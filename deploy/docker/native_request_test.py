"""Exercise the container's nginx routes against a counting HTTP upstream."""

import argparse
from contextlib import contextmanager
from hashlib import sha256
from http.client import HTTPConnection, HTTPException
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import re
import sys
from threading import Event, Lock
from urllib.parse import urlsplit


CONTROL_HEADER = "X-Fabriq-Control-Token"
CALLER_AUTH = "Bearer caller"
FIRST_EVENT = b"data: first\n\n"
SECOND_EVENT = b"data: second\n\n"


class Upstream(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, _format, *_args):
        pass

    def respond(self, status, body=b"", headers=()):
        self.send_response(status)
        for name, value in headers:
            self.send_header(name, value)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/__requests":
            with self.server.request_lock:
                state = {"count": self.server.count, "last": self.server.last}
            self.respond(200, json.dumps(state).encode())
        elif self.path == "/__release_stream":
            self.server.release_stream.set()
            self.respond(200)
        else:
            self.handle_api()

    def do_OPTIONS(self):
        self.handle_api()

    def do_POST(self):
        self.handle_api()

    def handle_api(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", "0")))
        authorization = self.headers.get_all("Authorization")
        if authorization == [self.server.operator_auth]:
            auth = "operator"
        elif authorization == [CALLER_AUTH]:
            auth = "caller"
        else:
            auth = "unexpected"
        with self.server.request_lock:
            self.server.count += 1
            self.server.last = {
                "method": self.command,
                "path": self.path,
                "authorization": auth,
                "cookie_present": "Cookie" in self.headers,
                "control_present": CONTROL_HEADER in self.headers,
                "body_length": len(body),
                "body_sha256": sha256(body).hexdigest(),
            }

        headers = [(CONTROL_HEADER, "upstream-marker")]
        if self.path == "/admin/events":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header(CONTROL_HEADER, "upstream-marker")
            self.send_header("Content-Length", str(len(FIRST_EVENT + SECOND_EVENT)))
            self.end_headers()
            self.wfile.write(FIRST_EVENT)
            self.wfile.flush()
            self.server.release_stream.wait(12)
            self.wfile.write(SECOND_EVENT)
        elif self.path == "/admin/redirect":
            self.respond(302, headers=[*headers, ("Location", "/admin/meta")])
        elif self.path == "/admin/error":
            self.respond(500, b"fixture error\n", headers)
        elif self.command == "OPTIONS":
            self.respond(204, headers=headers)
        else:
            self.respond(200, b"upstream ok\n", headers)


def serve(host, port, key):
    with ThreadingHTTPServer((host, port), Upstream) as server:
        server.count = 0
        server.last = None
        server.request_lock = Lock()
        server.release_stream = Event()
        server.operator_auth = f"Bearer {key}"
        server.serve_forever()


def require(condition, message):
    if not condition:
        raise AssertionError(message)


@contextmanager
def request(origin, path, method="GET", headers=(), body=b""):
    # putheader preserves duplicate field lines, including empty values.
    connection = HTTPConnection(urlsplit(origin).netloc, timeout=5)
    try:
        connection.putrequest(method, path)
        for name, value in headers:
            connection.putheader(name, value)
        if body:
            connection.putheader("Content-Length", str(len(body)))
            connection.putheader("Content-Type", "application/json")
        connection.endheaders(body)
        yield connection.getresponse()
    finally:
        connection.close()


def check_private(label, headers, body, secrets):
    require(
        all(secret not in body for secret in secrets)
        and all(
            secret not in value.encode()
            for _, value in headers
            for secret in secrets
        ),
        f"{label}: credential appeared in the response",
    )
    require(
        all(name.lower() != CONTROL_HEADER.lower() for name, _ in headers),
        f"{label}: control header appeared in the response",
    )


def probe(origin, upstream, mode, key, token):
    secrets = (key.encode(), token.encode())
    control = [(CONTROL_HEADER, token)]
    spoof = [("Authorization", CALLER_AUTH), ("Cookie", "s=fixture")]

    def state():
        with request(upstream, "/__requests") as response:
            require(response.status == 200, "could not read upstream count")
            return json.loads(response.read())

    def fetch(label, path, status, **options):
        with request(origin, path, **options) as response:
            headers = response.getheaders()
            body = response.read()
            check_private(label, headers, body, secrets)
            require(response.status == status, f"{label}: wanted HTTP {status}, got {response.status}")
            return {name.lower(): value for name, value in headers}, body

    def deny(label, path="/admin/meta", headers=(), method="GET", body=b""):
        count = state()["count"]
        fetch(label, path, 403, method=method, headers=headers, body=body)
        require(state()["count"] == count, f"{label}: denied request reached upstream")

    def forwarded(label, count, method, path, body=b"", auth="operator"):
        observed = state()
        require(observed["count"] == count + 1, f"{label}: wanted exactly one upstream request")
        last = observed["last"]
        require(last["method"] == method, f"{label}: wrong upstream method")
        if path is not None:
            require(last["path"] == path, f"{label}: wrong upstream path")
        require(last["authorization"] == auth, f"{label}: wrong upstream authorization")
        require(not last["cookie_present"], f"{label}: upstream received Cookie")
        require(not last["control_present"], f"{label}: upstream received the control header")
        require(
            last["body_length"] == len(body) and last["body_sha256"] == sha256(body).hexdigest(),
            f"{label}: upstream body changed",
        )

    count = state()["count"]
    _, health = fetch("health", "/healthz", 200, headers=control)
    require(health == b"ok\n", "health: wrong body")
    config_headers, config = fetch("runtime config", "/config.js", 200, headers=control)
    require(config_headers.get("cache-control") == "no-store", "runtime config is cacheable")
    require(b'"basePath":"/console/"' in config, "runtime config lacks the base path")
    require(b'"defaultTenant":"acme"' in config, "runtime config lacks the default tenant")
    if mode == "static":
        require(b'"apiUrl"' not in config, "static runtime config has a proxy API URL")
    else:
        require(b'"apiUrl":"/console/admin"' in config, "runtime config lacks the prefixed API URL")

    _, index = fetch("index", "/", 200, headers=control)
    require(b'<base href="/console/"' in index, "index lacks the rewritten base path")
    fallback_headers, fallback = fetch("SPA fallback", "/entities/x", 200, headers=control)
    require(fallback == index, "SPA fallback did not serve index")
    require(fallback_headers.get("cache-control") == "no-store", "SPA fallback is cacheable")
    asset = re.search(rb"assets/[A-Za-z0-9._-]+\.js", index)
    require(asset is not None, "index has no built JS asset")
    asset_headers, _ = fetch("built asset", "/" + asset[0].decode(), 200, headers=control)
    require(
        asset_headers.get("cache-control") == "public, max-age=31536000, immutable",
        "built JS asset lacks immutable caching",
    )

    for path in ("/upstream.conf", "/tmp/fabriq-admin/upstream.conf", "/assets/../upstream.conf"):
        _, response = fetch("private configuration path", path, 200, headers=control)
        require(response == index, "private configuration path did not fall back to index")
    require(state()["count"] == count, "a health or static request reached upstream")

    if mode == "static":
        _, response = fetch("static admin path", "/admin/meta", 200, headers=control)
        require(response == index, "static admin path did not fall back to index")
        require(state()["count"] == count, "static admin path reached upstream")
        return
    if mode == "pass-through":
        fetch(
            "pass-through", "/admin/meta", 200,
            headers=[*control, (CONTROL_HEADER.lower(), token), *spoof, ("Sec-Fetch-Site", "cross-site")],
        )
        forwarded("pass-through", count, "GET", "/admin/meta", auth="caller")
        return

    redirect_headers, _ = fetch("admin slash redirect", "/admin", 301, headers=control)
    require(urlsplit(redirect_headers.get("location", "")).path == "/admin/", "admin redirect lost its path")
    require(state()["count"] == count, "admin slash redirect reached upstream")

    wrong = ("0" if token[0] != "0" else "1") + token[1:]
    empty = (CONTROL_HEADER.lower(), "")
    for label, headers in (
        ("missing token", ()),
        ("empty token", [empty]),
        ("wrong token", [(CONTROL_HEADER, wrong)]),
        ("token prefix", [(CONTROL_HEADER, token[:-1])]),
        ("token suffix", [(CONTROL_HEADER, token + "0")]),
        ("underscore header", [("X_Fabriq_Control_Token", token)]),
        ("embedded whitespace", [(CONTROL_HEADER, token[:32] + " " + token[32:])]),
        ("duplicate identical tokens", [*control, (CONTROL_HEADER.lower(), token)]),
        ("duplicate valid then wrong token", [*control, (CONTROL_HEADER.lower(), wrong)]),
        ("duplicate wrong then valid token", [(CONTROL_HEADER.lower(), wrong), *control]),
        ("duplicate valid then empty token", [*control, empty]),
        ("duplicate empty then valid token", [empty, *control]),
        ("comma-separated tokens", [(CONTROL_HEADER, f"{token}, {wrong}")]),
        ("cross-site with valid token", [*control, ("Sec-Fetch-Site", "cross-site")]),
        ("same-site with valid token", [*control, ("Sec-Fetch-Site", "same-site")]),
        ("duplicate fetch metadata", [*control, ("Sec-Fetch-Site", "same-origin"), ("Sec-Fetch-Site", "cross-site")]),
        ("claimed operator role", [("X-Role", "operator"), *spoof]),
    ):
        deny(label, headers=headers)

    normalized_paths = ("/%61dmin/meta", "/admin%2fmeta", "//admin//meta", "/assets/../admin/meta")
    for path in normalized_paths:
        deny("normalized admin path", path)
        count = state()["count"]
        fetch("authorized normalized admin path", path, 200, headers=control)
        forwarded("authorized normalized admin path", count, "GET", None)

    query = b'{"sql":"SELECT 1"}'
    query_path = "/admin/analytics/query?dialect=sql"
    deny("unauthenticated OPTIONS", method="OPTIONS")
    deny("unauthenticated query", query_path, method="POST", body=query)
    deny("unauthenticated stream", "/admin/events")

    upload = b'{"data":"' + b"A" * (1024 * 1024) + b'"}'
    for label, path, status, method, body, metadata in (
        ("authorized meta", "/admin/meta", 200, "GET", b"", [("Sec-Fetch-Site", "same-origin")]),
        ("authorized OPTIONS", "/admin/meta", 204, "OPTIONS", b"", []),
        ("authorized query", query_path, 200, "POST", query, []),
        ("authorized upload", "/admin/files", 200, "POST", upload, []),
        ("upstream error", "/admin/error", 500, "GET", b"", []),
        ("upstream redirect", "/admin/redirect", 302, "GET", b"", []),
    ):
        count = state()["count"]
        response_headers, _ = fetch(label, path, status, method=method, headers=[*control, *spoof, *metadata], body=body)
        forwarded(label, count, method, path, body)
        if status == 302:
            require(response_headers.get("location") == "/admin/meta", "upstream redirect changed")

    count = state()["count"]
    with request(origin, "/admin/events", headers=[*control, *spoof]) as stream:
        require(stream.status == 200, "authorized stream did not open")
        require(stream.getheader("Content-Type") == "text/event-stream", "stream lost its content type")
        first = stream.read(len(FIRST_EVENT))
        require(first == FIRST_EVENT, "stream did not deliver its first event")
        with request(upstream, "/__release_stream") as release:
            require(release.status == 200, "could not release the second event")
        second = stream.read()
        check_private("stream", stream.getheaders(), first + second, secrets)
        require(second == SECOND_EVENT, "stream did not deliver its second event")
    forwarded("authorized stream", count, "GET", "/admin/events")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    upstream = commands.add_parser("upstream")
    upstream.add_argument("--host", default="127.0.0.1")
    upstream.add_argument("--port", type=int, default=8080)
    client = commands.add_parser("probe")
    client.add_argument("mode", choices=("gated", "pass-through", "static"))
    client.add_argument("origin")
    client.add_argument("upstream")
    args = parser.parse_args()

    try:
        key = os.environ["SMOKE_OPERATOR_KEY"]
        require(bool(key), "SMOKE_OPERATOR_KEY is empty")
        if args.command == "upstream":
            serve(args.host, args.port, key)
        else:
            token = os.environ["SMOKE_CONTROL_TOKEN"]
            require(re.fullmatch(r"[0-9a-f]{64}", token) is not None, "SMOKE_CONTROL_TOKEN is invalid")
            probe(args.origin, args.upstream, args.mode, key, token)
            print(f"smoke: ok {args.mode} nginx requests")
    except AssertionError as error:
        sys.exit(f"smoke: FAIL: {error}")
    except (HTTPException, KeyError, OSError, ValueError) as error:
        sys.exit(f"smoke: FAIL: {type(error).__name__}")


if __name__ == "__main__":
    main()

#!/bin/sh
# End-to-end check of the console image. Builds it, runs it read-only next to
# an echo server standing in for the Fabriq admin API, and asserts the image
# contract: health, runtime config, base path, SPA fallback, upstream proxy
# with key injection, and a hard stop on invalid env.
#
#   sh deploy/docker/smoke.sh
#
# Everything it creates is named fabriq-admin-smoke-* and removed on exit.
set -eu

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PORT=${SMOKE_PORT:-18080}
TAG=$$
IMAGE=fabriq-admin-smoke:$TAG
NET=fabriq-admin-smoke-net-$TAG
UPSTREAM=fabriq-admin-smoke-upstream-$TAG
CONSOLE=fabriq-admin-smoke-console-$TAG
BAD=fabriq-admin-smoke-bad-$TAG
KEY=fq_$(openssl rand -hex 20)
URL=http://127.0.0.1:$PORT

fail() {
  echo "smoke: FAIL: $*" >&2
  exit 1
}

cleanup() {
  status=$?
  if [ "$status" -ne 0 ]; then
    for c in "$CONSOLE" "$BAD" "$UPSTREAM"; do
      if docker inspect "$c" >/dev/null 2>&1; then
        echo "--- logs: $c" >&2
        docker logs "$c" >&2 2>&1 || true
      fi
    done
  fi
  docker rm -f "$CONSOLE" "$BAD" "$UPSTREAM" >/dev/null 2>&1 || true
  docker network rm "$NET" >/dev/null 2>&1 || true
  docker rmi "$IMAGE" >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT
trap 'exit 1' INT TERM

echo "smoke: building $IMAGE"
docker build -q -t "$IMAGE" "$ROOT" >/dev/null

docker network create "$NET" >/dev/null
docker run -d --name "$UPSTREAM" --network "$NET" --network-alias upstream \
  mendhak/http-https-echo:34 >/dev/null

docker run -d --name "$CONSOLE" --network "$NET" --read-only --tmpfs /tmp \
  -p "127.0.0.1:$PORT:8080" \
  -e FABRIQ_ADMIN_UPSTREAM=http://upstream:8080 \
  -e FABRIQ_ADMIN_UPSTREAM_KEY="$KEY" \
  -e FABRIQ_ADMIN_BASE_PATH=/console/ \
  -e FABRIQ_ADMIN_DEFAULT_TENANT=acme \
  "$IMAGE" >/dev/null

# /healthz only proves nginx is up. The echo server may still be starting, so
# the proxy checks below retry (see proxy_get).
i=0
until curl -fsS "$URL/healthz" >/dev/null 2>&1; do
  i=$((i + 1))
  [ "$i" -le 30 ] || fail "console did not become healthy within 30s"
  sleep 1
done

# proxy_get <curl args...>: GET through the console, retrying for up to 15s
# while the upstream answers 502/503/504 or refuses connections.
proxy_get() {
  n=0
  until out=$(curl -fsS "$@" 2>/dev/null); do
    n=$((n + 1))
    [ "$n" -le 15 ] || fail "no 2xx from the proxy within 15s: curl $*"
    sleep 1
  done
  printf '%s' "$out"
}

# status_of <curl args...>: HTTP status code only
status_of() {
  curl -s -o /dev/null -w '%{http_code}' "$@"
}

# healthz
[ "$(curl -sS "$URL/healthz")" = "ok" ] || fail "/healthz body is not ok"
echo "smoke: ok /healthz"

# uid and read-only root
[ "$(docker exec "$CONSOLE" id -u)" = "101" ] || fail "console does not run as uid 101"
echo "smoke: ok uid 101 on a read-only root"

# runtime config
CONFIG=$(curl -fsS "$URL/config.js")
case $CONFIG in *'"apiUrl":"/console/admin"'*) ;; *) fail "config.js lacks apiUrl: $CONFIG" ;; esac
case $CONFIG in *'"defaultTenant":"acme"'*) ;; *) fail "config.js lacks defaultTenant: $CONFIG" ;; esac
case $CONFIG in *"$KEY"*) fail "config.js leaks the upstream key" ;; esac
curl -fsSI "$URL/config.js" | grep -qi '^cache-control: no-store' || fail "config.js is cacheable"
echo "smoke: ok /config.js"

# base path and SPA fallback
for p in / /entities/x; do
  BODY=$(curl -fsS "$URL$p")
  case $BODY in *'<base href="/console/"'*) ;; *) fail "$p lacks <base href=\"/console/\">" ;; esac
done
curl -fsSI "$URL/entities/x" | grep -qi '^cache-control: no-store' || fail "the SPA fallback is cacheable"
echo "smoke: ok base path and no-store on / and /entities/x"

# built assets
ASSET=$(curl -fsS "$URL/" | grep -o 'assets/[A-Za-z0-9._-]*\.js' | head -n 1)
[ -n "$ASSET" ] || fail "no asset found in index.html"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$URL/$ASSET")" = "200" ] || fail "$ASSET is not served"
curl -fsSI "$URL/$ASSET" | grep -qi '^cache-control: public, max-age=31536000, immutable' || fail "$ASSET is not immutable"
echo "smoke: ok $ASSET"

# proxy: path kept, client Authorization replaced by the configured key, and
# the client's Cookie never forwarded
ECHO=$(proxy_get -H 'Authorization: Bearer wrong' -H 'Cookie: s=secret' "$URL/admin/meta")
[ "$(printf '%s' "$ECHO" | jq -r .path)" = "/admin/meta" ] || fail "upstream saw the wrong path: $ECHO"
[ "$(printf '%s' "$ECHO" | jq -r .headers.authorization)" = "Bearer $KEY" ] || fail "upstream saw the wrong authorization: $ECHO"
[ "$(printf '%s' "$ECHO" | jq -r .headers.cookie)" = "null" ] || fail "upstream saw a cookie: $ECHO"
echo "smoke: ok /admin/ proxy with key injection and no cookies"

# cross-site and same-site requests are refused while a key is injected
[ "$(status_of -H 'Sec-Fetch-Site: cross-site' "$URL/admin/meta")" = "403" ] || fail "cross-site request was not refused"
[ "$(status_of -H 'Sec-Fetch-Site: same-site' "$URL/admin/meta")" = "403" ] || fail "same-site request was not refused"
proxy_get -H 'Sec-Fetch-Site: same-origin' "$URL/admin/meta" >/dev/null
proxy_get "$URL/admin/meta" >/dev/null
echo "smoke: ok Sec-Fetch-Site 403 for cross-site and same-site, 200 for same-origin and none"

# invalid env must stop the container before nginx starts
docker run -d --name "$BAD" -e FABRIQ_ADMIN_BASE_PATH=bad "$IMAGE" >/dev/null
i=0
until [ "$(docker inspect -f '{{.State.Status}}' "$BAD")" = "exited" ]; do
  i=$((i + 1))
  [ "$i" -le 10 ] || fail "container with an invalid base path was still running after 10s"
  sleep 1
done
CODE=$(docker inspect -f '{{.State.ExitCode}}' "$BAD")
[ "$CODE" = "1" ] || fail "container with an invalid base path exited $CODE, wanted 1"
docker logs "$BAD" 2>&1 | grep -q FABRIQ_ADMIN_BASE_PATH || fail "the logs do not name FABRIQ_ADMIN_BASE_PATH"
echo "smoke: ok invalid FABRIQ_ADMIN_BASE_PATH exits 1 and is named in the logs"

echo "smoke: ok"

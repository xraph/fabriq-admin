#!/bin/sh
# Builds the console image and exercises its entrypoint and nginx over HTTP.
#
#   sh deploy/docker/smoke.sh
#   SMOKE_IMAGE=local-admin-image sh deploy/docker/smoke.sh
set -eu

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
FIXTURE="$ROOT/deploy/docker/native_request_test.py"
PORT=${SMOKE_PORT:-18080}
TAG=$$
IMAGE=${SMOKE_IMAGE:-fabriq-admin-smoke:$TAG}
UPSTREAM_IMAGE=${SMOKE_UPSTREAM_IMAGE:-python:3.12-alpine}
NET=fabriq-admin-smoke-net-$TAG
UPSTREAM=fabriq-admin-smoke-upstream-$TAG
CONSOLE=fabriq-admin-smoke-console-$TAG
BAD=fabriq-admin-smoke-bad-$TAG
SMOKE_OPERATOR_KEY=fq_$(openssl rand -hex 20)
SMOKE_CONTROL_TOKEN=$(openssl rand -hex 32)
export SMOKE_OPERATOR_KEY SMOKE_CONTROL_TOKEN
URL=http://127.0.0.1:$PORT
TMP=$(mktemp -d)

fail() {
  echo "smoke: FAIL: $*" >&2
  exit 1
}

cleanup() {
  status=$?
  docker rm -f "$CONSOLE" "$BAD" "$UPSTREAM" > /dev/null 2>&1 || true
  docker network rm "$NET" > /dev/null 2>&1 || true
  if [ -z "${SMOKE_IMAGE:-}" ]; then
    docker rmi "$IMAGE" > /dev/null 2>&1 || true
  fi
  rm -rf "$TMP"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 1' INT TERM

capture_logs() {
  docker logs "$1" > "$TMP/container.log" 2>&1 || fail "$2 logs could not be read"
  for value in "$SMOKE_OPERATOR_KEY" "$SMOKE_CONTROL_TOKEN"; do
    if grep -Fq -- "$value" "$TMP/container.log"; then
      fail "$2 logs contain a credential"
    fi
  done
}

wait_for() {
  i=0
  until curl --max-time 2 -fsS "$1" > /dev/null 2>&1; do
    i=$((i + 1))
    [ "$i" -le 30 ] || fail "$2 did not become healthy"
    sleep 1
  done
}

if [ -z "${SMOKE_IMAGE:-}" ]; then
  echo "smoke: building $IMAGE"
  docker build -q -t "$IMAGE" "$ROOT" > /dev/null
fi

docker network create "$NET" > /dev/null
docker run -d --name "$UPSTREAM" --network "$NET" --network-alias upstream \
  -p 127.0.0.1::8080 -e SMOKE_OPERATOR_KEY \
  -v "$FIXTURE:/native_request_test.py:ro" "$UPSTREAM_IMAGE" \
  python3 /native_request_test.py upstream --host 0.0.0.0 > /dev/null
UPSTREAM_URL=http://$(docker port "$UPSTREAM" 8080/tcp)
wait_for "$UPSTREAM_URL/__requests" upstream

run_console() {
  mode=$1
  shift
  docker run -d --name "$CONSOLE" --network "$NET" --read-only --tmpfs /tmp \
    -p "127.0.0.1:$PORT:8080" \
    -e FABRIQ_ADMIN_BASE_PATH=/console/ \
    -e FABRIQ_ADMIN_DEFAULT_TENANT=acme \
    "$@" "$IMAGE" > /dev/null
  wait_for "$URL/healthz" "$mode console"
  [ "$(docker exec "$CONSOLE" id -u)" = "101" ] || fail "$mode console does not run as uid 101"
  probe_status=0
  python3 "$FIXTURE" probe "$mode" "$URL" "$UPSTREAM_URL" || probe_status=$?
  capture_logs "$CONSOLE" "$mode console"
  [ "$probe_status" -eq 0 ] || exit "$probe_status"
  docker rm -f "$CONSOLE" > /dev/null
}

run_console gated \
  -e FABRIQ_ADMIN_UPSTREAM=http://upstream:8080 \
  -e FABRIQ_ADMIN_UPSTREAM_KEY="$SMOKE_OPERATOR_KEY" \
  -e FABRIQ_ADMIN_CONTROL_TOKEN="$SMOKE_CONTROL_TOKEN"
run_console pass-through -e FABRIQ_ADMIN_UPSTREAM=http://upstream:8080
run_console static

expect_invalid() {
  label=$1
  variable=$2
  shift 2
  docker run -d --name "$BAD" --network "$NET" --read-only --tmpfs /tmp \
    "$@" "$IMAGE" > /dev/null
  i=0
  until [ "$(docker inspect -f '{{.State.Status}}' "$BAD")" = "exited" ]; do
    i=$((i + 1))
    [ "$i" -le 10 ] || fail "$label container did not exit"
    sleep 1
  done
  [ "$(docker inspect -f '{{.State.ExitCode}}' "$BAD")" = "1" ] ||
    fail "$label container did not exit 1"
  capture_logs "$BAD" "$label"
  grep -Fq "$variable" "$TMP/container.log" || fail "$label logs do not name $variable"
  docker rm "$BAD" > /dev/null
  echo "smoke: ok startup refusal for $label"
}

expect_invalid "invalid base path" FABRIQ_ADMIN_BASE_PATH -e FABRIQ_ADMIN_BASE_PATH=bad
expect_invalid "missing control token" FABRIQ_ADMIN_CONTROL_TOKEN \
  -e FABRIQ_ADMIN_UPSTREAM=http://upstream:8080 \
  -e FABRIQ_ADMIN_UPSTREAM_KEY="$SMOKE_OPERATOR_KEY"
expect_invalid "malformed control token" FABRIQ_ADMIN_CONTROL_TOKEN \
  -e FABRIQ_ADMIN_UPSTREAM=http://upstream:8080 \
  -e FABRIQ_ADMIN_UPSTREAM_KEY="$SMOKE_OPERATOR_KEY" \
  -e FABRIQ_ADMIN_CONTROL_TOKEN="${SMOKE_CONTROL_TOKEN}x"
expect_invalid "control token without an operator key" FABRIQ_ADMIN_CONTROL_TOKEN \
  -e FABRIQ_ADMIN_UPSTREAM=http://upstream:8080 \
  -e FABRIQ_ADMIN_CONTROL_TOKEN="$SMOKE_CONTROL_TOKEN"

capture_logs "$UPSTREAM" upstream
echo "smoke: ok"

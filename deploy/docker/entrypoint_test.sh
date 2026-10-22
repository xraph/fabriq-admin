#!/bin/sh
# Tests for 40-fabriq-admin-runtime.sh. Runs the script against a fixture
# index.html with the test seams pointed at temp dirs. No docker needed.
#
#   sh deploy/docker/entrypoint_test.sh
set -u

HERE=$(cd "$(dirname "$0")" && pwd)
SCRIPT="$HERE/40-fabriq-admin-runtime.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT INT TERM

PASS=0
FAIL=0
RC=0
RUNTIME=""

ok() { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
bad() { FAIL=$((FAIL + 1)); printf 'FAIL  %s\n' "$1"; }

# run_script <env assignments...>: fresh html and runtime dirs, then the script
# under a clean environment. Sets RC, RUNTIME and $TMP/stderr.
run_script() {
  rm -rf "$TMP/html" "$TMP/runtime"
  mkdir -p "$TMP/html"
  printf '<html><head><base href="/" /></head><body></body></html>\n' > "$TMP/html/index.html"
  RUNTIME="$TMP/runtime"
  env -i PATH="$PATH" \
    FABRIQ_ADMIN_RUNTIME_DIR="$RUNTIME" \
    FABRIQ_ADMIN_HTML_DIR="$TMP/html" \
    "$@" sh "$SCRIPT" > "$TMP/stdout" 2> "$TMP/stderr"
  RC=$?
}

expect_exit() { # <case> <code>; a failure must also name the offending variable
  if [ "$RC" -ne "$2" ]; then bad "$1: exit $RC, wanted $2 ($(cat "$TMP/stderr"))"
  elif [ "$2" -ne 0 ] && ! grep -Fq 'FABRIQ_ADMIN_' "$TMP/stderr"; then bad "$1: exit $2 but stderr names no variable ($(cat "$TMP/stderr"))"
  else ok "$1: exit $2"; fi
}
expect_has() { # <case> <file> <literal>
  if grep -Fq -- "$3" "$2" 2>/dev/null; then ok "$1: $(basename "$2") has $3"; else bad "$1: $(basename "$2") lacks $3"; fi
}
expect_lacks() { # <case> <file> <literal>
  if grep -Fq -- "$3" "$2" 2>/dev/null; then bad "$1: $(basename "$2") has $3"; else ok "$1: $(basename "$2") lacks $3"; fi
}
expect_empty() { # <case> <file>
  if [ -f "$2" ] && [ ! -s "$2" ]; then ok "$1: $(basename "$2") is empty"; else bad "$1: $(basename "$2") is not empty"; fi
}

VALID_KEY=fq_0123456789abcdefghijklmnopqrstuv

# defaults
run_script
expect_exit defaults 0
expect_has defaults "$RUNTIME/config.js" '"basePath":"/"'
expect_lacks defaults "$RUNTIME/config.js" '"apiUrl"'
expect_empty defaults "$RUNTIME/upstream.conf"
expect_has defaults "$RUNTIME/index.html" '<base href="/"'

# upstream
run_script FABRIQ_ADMIN_UPSTREAM=http://fabriq:8081
expect_exit upstream 0
expect_has upstream "$RUNTIME/config.js" '"apiUrl":"/admin"'
expect_has upstream "$RUNTIME/upstream.conf" 'proxy_pass http://fabriq:8081;'
expect_has upstream "$RUNTIME/upstream.conf" 'location /admin/ {'
expect_lacks upstream "$RUNTIME/upstream.conf" 'Authorization'

# upstream-key
run_script FABRIQ_ADMIN_UPSTREAM=http://fabriq:8081 FABRIQ_ADMIN_UPSTREAM_KEY=$VALID_KEY
expect_exit upstream-key 0
expect_has upstream-key "$RUNTIME/upstream.conf" "proxy_set_header Authorization \"Bearer $VALID_KEY\";"

# base-path
run_script FABRIQ_ADMIN_BASE_PATH=/console/ FABRIQ_ADMIN_UPSTREAM=http://fabriq:8081
expect_exit base-path 0
expect_has base-path "$RUNTIME/index.html" '<base href="/console/"'
expect_has base-path "$RUNTIME/config.js" '"basePath":"/console/"'
expect_has base-path "$RUNTIME/config.js" '"apiUrl":"/console/admin"'

# explicit api url, tenant and map style
run_script FABRIQ_ADMIN_API_URL=https://api.example.com/admin FABRIQ_ADMIN_DEFAULT_TENANT=acme FABRIQ_ADMIN_MAP_STYLE_URL=https://tiles.example.com/style.json
expect_exit extras 0
expect_has extras "$RUNTIME/config.js" '"apiUrl":"https://api.example.com/admin"'
expect_has extras "$RUNTIME/config.js" '"defaultTenant":"acme"'
expect_has extras "$RUNTIME/config.js" '"mapStyleUrl":"https://tiles.example.com/style.json"'

# bad-base-path
run_script FABRIQ_ADMIN_BASE_PATH='/x y/'
expect_exit bad-base-path 1
run_script FABRIQ_ADMIN_BASE_PATH=bad
expect_exit bad-base-path-relative 1
run_script FABRIQ_ADMIN_BASE_PATH='/console'
expect_exit bad-base-path-no-trailing-slash 1

# bad-upstream
run_script FABRIQ_ADMIN_UPSTREAM='http://a;b'
expect_exit bad-upstream 1

# bad-key
run_script FABRIQ_ADMIN_UPSTREAM=http://fabriq:8081 FABRIQ_ADMIN_UPSTREAM_KEY='fq_abc;'
expect_exit bad-key 1
run_script FABRIQ_ADMIN_UPSTREAM_KEY=$VALID_KEY
expect_exit bad-key-without-upstream 1

# bad-newline: a valid-looking value followed by a newline and more text must
# be rejected, because grep matches line by line.
NL='
'
run_script FABRIQ_ADMIN_UPSTREAM=http://fabriq:8081 FABRIQ_ADMIN_UPSTREAM_KEY="$VALID_KEY${NL}x"
expect_exit bad-newline-key 1
run_script FABRIQ_ADMIN_UPSTREAM="http://fabriq:8081${NL}x"
expect_exit bad-newline-upstream 1
run_script FABRIQ_ADMIN_BASE_PATH="/console/${NL}x"
expect_exit bad-newline-base-path 1
run_script FABRIQ_ADMIN_DEFAULT_TENANT="acme${NL}x"
expect_exit bad-newline-tenant 1

# bad-tenant
run_script FABRIQ_ADMIN_DEFAULT_TENANT='a b'
expect_exit bad-tenant 1

# bad api url and map style
run_script FABRIQ_ADMIN_API_URL='ftp://x'
expect_exit bad-api-url 1
run_script FABRIQ_ADMIN_MAP_STYLE_URL='/style.json'
expect_exit bad-map-style-url 1

printf '\n%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]

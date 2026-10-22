#!/bin/sh
# Runs from the stock nginx /docker-entrypoint.d before nginx starts. Turns the
# FABRIQ_ADMIN_* environment into three files in a writable runtime dir:
#
#   config.js     window.__FABRIQ_ADMIN_CONFIG__ for the console
#   index.html    the built index.html with <base href> set to the base path
#   upstream.conf nginx location block proxying /admin/ (empty without upstream)
#
# Any invalid value prints to stderr and exits 1, which stops the container
# before nginx starts. POSIX sh; runs the same under busybox, GNU and BSD tools.
set -eu

RUNTIME_DIR=${FABRIQ_ADMIN_RUNTIME_DIR:-/tmp/fabriq-admin}
HTML_DIR=${FABRIQ_ADMIN_HTML_DIR:-/usr/share/nginx/html}

BASE_PATH=${FABRIQ_ADMIN_BASE_PATH:-/}
UPSTREAM=${FABRIQ_ADMIN_UPSTREAM:-}
UPSTREAM_KEY=${FABRIQ_ADMIN_UPSTREAM_KEY:-}
API_URL=${FABRIQ_ADMIN_API_URL:-}
DEFAULT_TENANT=${FABRIQ_ADMIN_DEFAULT_TENANT:-}
MAP_STYLE_URL=${FABRIQ_ADMIN_MAP_STYLE_URL:-}

NL='
'

fail() {
  echo "fabriq-admin: $*" >&2
  exit 1
}

# check <name> <value> <extended regex> <what it must look like>
# grep works line by line, so a value with a newline could pass on one good
# line and smuggle the rest into the nginx config. Reject newlines first.
check() {
  case $2 in
    *"$NL"*) fail "$1 must not contain a newline" ;;
  esac
  printf '%s\n' "$2" | grep -Eq "$3" || fail "$1 must be $4"
}

check FABRIQ_ADMIN_BASE_PATH "$BASE_PATH" '^/([A-Za-z0-9._~-]+/)*$' \
  'a path that starts and ends with / (for example /console/)'

if [ -n "$UPSTREAM" ]; then
  check FABRIQ_ADMIN_UPSTREAM "$UPSTREAM" '^https?://[A-Za-z0-9.-]+(:[0-9]{1,5})?$' \
    'an origin like http://host:port, with no path'
fi

if [ -n "$UPSTREAM_KEY" ]; then
  [ -n "$UPSTREAM" ] || fail "FABRIQ_ADMIN_UPSTREAM_KEY requires FABRIQ_ADMIN_UPSTREAM"
  check FABRIQ_ADMIN_UPSTREAM_KEY "$UPSTREAM_KEY" '^fq_[0-9A-Za-z]{32,}$' \
    'fq_ followed by at least 32 letters or digits'
fi

if [ -n "$API_URL" ]; then
  check FABRIQ_ADMIN_API_URL "$API_URL" '^(/|https?://)' 'a path starting with / or an http(s) URL'
fi

if [ -n "$DEFAULT_TENANT" ]; then
  check FABRIQ_ADMIN_DEFAULT_TENANT "$DEFAULT_TENANT" '^[a-zA-Z0-9_-]{1,64}$' \
    '1 to 64 letters, digits, - or _'
fi

if [ -n "$MAP_STYLE_URL" ]; then
  check FABRIQ_ADMIN_MAP_STYLE_URL "$MAP_STYLE_URL" '^https?://' 'an http(s) URL'
fi

# With an upstream the console talks to the proxy under <base>admin.
if [ -z "$API_URL" ] && [ -n "$UPSTREAM" ]; then
  API_URL="${BASE_PATH}admin"
fi

grep -Fq '<base href="/"' "$HTML_DIR/index.html" ||
  fail "$HTML_DIR/index.html has no <base href=\"/\"> to rewrite"

mkdir -p "$RUNTIME_DIR"

# config.js
CONFIG=$(jq -cn \
  --arg basePath "$BASE_PATH" \
  --arg apiUrl "$API_URL" \
  --arg defaultTenant "$DEFAULT_TENANT" \
  --arg mapStyleUrl "$MAP_STYLE_URL" \
  '{basePath: $basePath}
   + (if $apiUrl != "" then {apiUrl: $apiUrl} else {} end)
   + (if $defaultTenant != "" then {defaultTenant: $defaultTenant} else {} end)
   + (if $mapStyleUrl != "" then {mapStyleUrl: $mapStyleUrl} else {} end)')
printf 'window.__FABRIQ_ADMIN_CONFIG__ = %s;\n' "$CONFIG" > "$RUNTIME_DIR/config.js"

# index.html: the base path only holds [A-Za-z0-9._~/-], so | is a safe delimiter.
sed "s|<base href=\"/\"|<base href=\"${BASE_PATH}\"|" "$HTML_DIR/index.html" > "$RUNTIME_DIR/index.html"

# upstream.conf: empty unless an upstream is set. With a key, the Authorization
# header is always replaced, so a client cannot send its own credentials through.
: > "$RUNTIME_DIR/upstream.conf"
if [ -n "$UPSTREAM" ]; then
  {
    printf 'location /admin/ {\n'
    printf '  proxy_pass %s;\n' "$UPSTREAM"
    printf '  proxy_http_version 1.1;\n'
    printf '  proxy_set_header Host $proxy_host;\n'
    printf '  proxy_set_header Connection "";\n'
    printf '  proxy_buffering off;\n'
    printf '  proxy_read_timeout 3600s;\n'
    if [ -n "$UPSTREAM_KEY" ]; then
      printf '  proxy_set_header Authorization "Bearer %s";\n' "$UPSTREAM_KEY"
    fi
    printf '}\n'
  } > "$RUNTIME_DIR/upstream.conf"
fi

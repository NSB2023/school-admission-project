#!/bin/sh
set -eu
# JSON-escape configuration rather than interpolating an environment value as JavaScript.
api_url=${BACKEND_URL:-http://localhost:8080}
case "$api_url" in
  http://*|https://*) ;;
  *) echo 'BACKEND_URL must be an HTTP(S) URL' >&2; exit 1 ;;
esac
case "$api_url" in
  *'
'*) echo 'BACKEND_URL must be a single-line URL' >&2; exit 1 ;;
esac
if printf '%s' "$api_url" | LC_ALL=C grep -q '[[:cntrl:]]'; then
  echo 'BACKEND_URL must not contain control characters' >&2
  exit 1
fi
escaped=$(printf '%s' "$api_url" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf 'window.__CONFIG__ = {"apiUrl":"%s"};\n' "$escaped" > /usr/share/nginx/html/config.js

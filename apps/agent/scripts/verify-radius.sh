#!/bin/sh
# Vercel CI routes task traffic through its own certificate authority and points
# SSL_CERT_FILE at the bundle. Node doesn't read SSL_CERT_FILE, so hand the same
# bundle to Node. Outside Vercel CI neither variable is set and nothing changes.
set -eu
ca="${NODE_EXTRA_CA_CERTS:-${SSL_CERT_FILE:-}}"
if [ -n "$ca" ]; then
  export NODE_EXTRA_CA_CERTS="$ca"
fi
exec node "$(dirname "$0")/verify-radius.mjs" "$@"

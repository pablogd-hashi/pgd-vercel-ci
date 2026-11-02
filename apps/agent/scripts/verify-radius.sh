#!/bin/sh
# Vercel CI routes task traffic through its own certificate authority and points
# SSL_CERT_FILE at the bundle. Node doesn't read SSL_CERT_FILE, so hand the same
# bundle to Node. Node's fetch also ignores HTTP(S)_PROXY unless
# NODE_USE_ENV_PROXY=1, so turn that on when a proxy is configured.
# Outside Vercel CI none of these are set and nothing changes.
set -eu
ca="${NODE_EXTRA_CA_CERTS:-${SSL_CERT_FILE:-}}"
if [ -n "$ca" ]; then
  export NODE_EXTRA_CA_CERTS="$ca"
fi
if [ -n "${HTTPS_PROXY:-${https_proxy:-${HTTP_PROXY:-${http_proxy:-}}}}" ]; then
  export NODE_USE_ENV_PROXY=1
fi
# Names only, never values: what networking setup does this job have?
env | cut -d= -f1 | grep -iE '^(https?_proxy|no_proxy|ssl_cert_file|node_extra_ca_certs|node_use_system_ca|node_use_env_proxy)$' \
  | sort | tr '\n' ' ' | sed 's/^/network env: /; s/$/\n/' || true
exec node "$(dirname "$0")/verify-radius.mjs" "$@"

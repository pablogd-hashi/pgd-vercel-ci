#!/usr/bin/env bash
# Run the dashboard against a local Vault. Usage: dev-local.sh [preview|production]
# With AI_GATEWAY_API_KEY set the agent calls a real model. Without it, it uses
# the scripted "replay" attacker: the moves are fake, every Vault verdict is real.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
start_vault

export VERCEL_OIDC_TOKEN="$(mint "${1:-preview}")"
[ -z "${AI_GATEWAY_API_KEY:-}" ] && export AGENT_MODEL="${AGENT_MODEL:-replay}"
echo "✔ running as environment=${1:-preview}, model=${AGENT_MODEL:-default} → http://localhost:${PORT:-3000}"
cd "$root/apps/agent" && pnpm exec next dev -p "${PORT:-3000}"

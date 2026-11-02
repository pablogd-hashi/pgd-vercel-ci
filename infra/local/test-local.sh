#!/usr/bin/env bash
# Run the deterministic blast-radius suite as a preview workload against a local Vault.
set -euo pipefail
export VAULT_PORT="${VAULT_PORT:-18300}" # stay clear of a running dev-local.sh
source "$(dirname "$0")/lib.sh"
start_vault

export VERCEL_OIDC_TOKEN="$(mint preview)"
(cd "$root/packages/evals" && EVAL_SKIP_LLM=1 pnpm exec vitest run src/blast-radius.test.ts)

echo; echo "--- control: a production token CAN read prod (proves the test isn't vacuous)"
t="$(vault write -field=token auth/vercel/login role=agent-production jwt="$(mint production)")"
VAULT_TOKEN="$t" vault kv get -field=password secret/prod/payments/db | sed 's/\(CANARY_PROD_\).*/\1••••/'

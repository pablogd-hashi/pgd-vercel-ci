# Shared by test-local.sh and dev-local.sh: a dev Vault configured by the real
# infra/vault Terraform, trusting a local key that signs Vercel-shaped tokens.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; root="$here/../.."
work="$(mktemp -d)"; vault_pid=""
cleanup() { [ -n "$vault_pid" ] && kill "$vault_pid" 2>/dev/null; rm -rf "$work"; }
trap cleanup EXIT INT TERM

port="${VAULT_PORT:-18200}"
export VAULT_ADDR="http://127.0.0.1:$port" VAULT_TOKEN=root VAULT_NAMESPACE=""

start_vault() {
  vault server -dev -dev-root-token-id=root -dev-listen-address="127.0.0.1:$port" >"$work/vault.log" 2>&1 & vault_pid=$!
  until vault status >/dev/null 2>&1; do sleep 0.2; done
  vault secrets disable secret >/dev/null # dev mode mounts one; Terraform owns ours

  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$work/key.pem" 2>/dev/null
  openssl pkey -in "$work/key.pem" -pubout -out "$work/pub.pem"

  cp -R "$root/infra/vault/." "$work/tf"
  (cd "$work/tf" && rm -rf .terraform* terraform.tfstate* \
    && terraform init -input=false >/dev/null \
    && terraform apply -auto-approve -input=false \
      -var vercel_team_slug=acme -var vercel_project=blast-radius \
      -var "jwt_validation_pubkeys=[$(jq -Rs . <"$work/pub.pem")]" >/dev/null)
  echo "✔ local Vault configured from infra/vault"
}

mint() { node "$here/mint-token.mjs" "$work/key.pem" acme blast-radius "$1"; }

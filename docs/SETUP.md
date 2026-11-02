# Setup: GitHub → HCP Vault (Terraform) → Vercel

About 30 minutes. Decide two names up front, because Vault binds to them:

| Name | Example | Where it shows up |
| --- | --- | --- |
| Vercel team slug | `pablogd` | `vercel.com/<slug>` URL, OIDC `owner` claim, issuer URL |
| Vercel project name | `pgd-vercel-ci` | OIDC `project` claim (Vercel defaults it to the repo name) |

---

## 0. Tools

```bash
npm i -g vercel@latest
vercel login
terraform -version          # 1.6+
```

## 1. GitHub

```bash
cd ~/Developer/vercel-ai
git remote -v    # origin → https://github.com/pablogd-hashi/pgd-vercel-ci.git
git push -u origin main
```

On a Hobby team, Vercel only builds a pushed commit if its author maps to the team owner's GitHub account. Commit with an email that GitHub account has verified (its noreply address works), or every push shows **Blocked**:

```bash
git config user.email "<id>+<github-user>@users.noreply.github.com"
```

## 2. HCP Vault: endpoint + admin token

In the HCP portal → **Vault Dedicated** → your cluster:

1. **Networking**: make sure the cluster has a **Public** endpoint. Vercel Functions call it over the internet.
2. Copy the **Public URL** (`https://<cluster>.vault.<id>.aws.hashicorp.cloud:8200`).
3. Click **New admin token → Generate**. It's valid for 6 hours, which is plenty for Terraform.

```bash
export VAULT_ADDR="https://<your-cluster-public-url>:8200"
export VAULT_NAMESPACE="admin"
export VAULT_TOKEN="<admin token>"
vault token lookup -format=json | jq '.data.policies'   # should include hcp-root
```

## 3. Terraform: trust Vercel, write the policies, seed the secrets

```bash
cd infra/vault
cat > terraform.tfvars <<EOF
vercel_team_slug = "<team-slug>"
vercel_project   = "pgd-vercel-ci"
EOF
terraform init
terraform plan     # expect: jwt backend "vercel", 2 roles, 2 policies, kv mount "secret", 4 secrets
terraform apply
```

Check it:

```bash
vault read auth/vercel/config                     # oidc_discovery_url = https://oidc.vercel.com/<team-slug>
vault read auth/vercel/role/agent-preview         # bound_claims: owner, project, environment=preview,development
vault kv get secret/prod/payments/db              # password = CANARY_PROD_…
```

> - If your HCP cluster already has a `secret/` mount, set `kv_mount = "agent-kv"` in tfvars and add `VAULT_KV_MOUNT=agent-kv` everywhere you set `VAULT_ADDR` below.
> - `terraform.tfstate` holds the canary values. It's gitignored; keep it that way, or use HCP Terraform as the backend.

## 4. Vercel: import the project

1. Go to <https://vercel.com/new> and import `pablogd-hashi/pgd-vercel-ci` from GitHub.
2. Keep **Project Name** as `pgd-vercel-ci`. It must match `vercel_project` in tfvars.
3. Set **Root Directory** to `apps/agent`. The framework is detected as Next.js, and the pnpm workspace is picked up automatically.
4. Add these **Environment Variables**, ticking **Production, Preview and Development** (paste the values without quotes):

   | Key | Value |
   | --- | --- |
   | `VAULT_ADDR` | your HCP public URL |
   | `VAULT_NAMESPACE` | `admin` |

   That's all. There is no Vault token or API key: that's the point.
5. Click **Deploy**.
6. In **Settings → Security → Secure backend access with OIDC federation**, check that the issuer mode is **Team**. That's the default; Terraform expects `https://oidc.vercel.com/<team-slug>`.
7. **AI Gateway** (only for the real-model attacks): the free tier doesn't allow every model. Set `AGENT_MODEL` to one your tier allows, or `replay` for the free scripted attacker.

Link your local clone to the project, from the repo root:

```bash
cd ~/Developer/vercel-ai
vercel link                                   # pick your team + the pgd-vercel-ci project
vercel env pull                               # VAULT_* + a 12h VERCEL_OIDC_TOKEN (environment=development)
```

## 5. Check the blast radius

**Locally, with a real Vercel identity against HCP Vault** (the development token maps to `agent-preview`). No model calls:

```bash
set -a && source .env.local && set +a
cd packages/evals && EVAL_SKIP_LLM=1 pnpm exec vitest run src/blast-radius.test.ts
```

**On a preview deployment:**

```bash
vercel deploy                                  # from the repo root
vercel curl <preview-url>/api/radius           # vercel curl gets you past Deployment Protection
```

A git push works too, but Vercel skips the deployment if the commit doesn't change anything under `apps/agent` or its workspace dependencies (an empty commit is cancelled).

You should see the role `agent-preview`, preview secrets ALLOW 200, prod secrets and path tricks DENY 403, and `role:agent-production` DENY 400.

**Production** (the project's production domain, e.g. `https://pgd-vercel-ci.vercel.app/api/radius`): the role is `agent-production` and the radius flips.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Deployment **Blocked**: "commit author doesn't have permission" | The commit email isn't on the GitHub account linked to your Vercel login. See step 1 |
| Deployment **Canceled**: "commit didn't affect this project" | The commit changed nothing under `apps/agent` or its dependencies |
| `Failed to parse URL from "https://…` | `VAULT_ADDR` was saved with quotes. Edit it in Vercel, or redeploy (the code strips them) |
| Identity panel shows `VAULT_ADDR is not set` | The env var wasn't added for that environment; redeploy after adding it |
| `Vault login as agent-preview failed (400): claim "project" does not match` | The project name in Vercel ≠ `vercel_project` in tfvars |
| `… (400): error validating token: invalid issuer` | Issuer mode is Global, or the team slug is wrong |
| Terraform `failed to create limited child token … 403` | `VAULT_TOKEN` isn't an HCP admin token. Check its policies include `hcp-root` |
| AI Gateway `Free tier users do not have access to this model` | Pick another `AGENT_MODEL`, use `replay`, or add credits |

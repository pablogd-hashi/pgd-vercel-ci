# Setup: GitHub → HCP Vault (Terraform) → Vercel → Vercel CI

About 45 minutes. Decide two names up front, because Vault binds to them:

| Name | Example | Where it shows up |
| --- | --- | --- |
| Vercel team slug | `pablogd` | `vercel.com/<slug>` URL, OIDC `owner` claim, issuer URL |
| Vercel project name | `pgd-vercel-ci` | OIDC `project` claim (Vercel defaults it to the repo name) |

---

## 0. Tools

```bash
npm i -g vercel@latest      # Vercel CI needs 64.3.1+
vercel login
gh auth status              # log in with `gh auth login` if needed
terraform -version          # 1.6+
```

## 1. GitHub: push to `pablogd-hashi/pgd-vercel-ci` (private)

Vercel CI doesn't run on public repos yet. Keep this one private and publish a public mirror for the blog later.

```bash
cd ~/Developer/vercel-ai
git remote -v    # origin → https://github.com/pablogd-hashi/pgd-vercel-ci.git
git add -A && git commit -m "Blast Radius: agent, evals, Vault terraform, dashboard"
git pull origin main --allow-unrelated-histories --no-rebase   # the repo was created with an initial commit
git push -u origin main
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
vault status && vault token lookup >/dev/null && echo "✔ talking to HCP Vault"
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
4. Add these **Environment Variables**, ticking all three environments (Production, Preview, Development):

   | Key | Value |
   | --- | --- |
   | `VAULT_ADDR` | your HCP public URL |
   | `VAULT_NAMESPACE` | `admin` |

   That's all. There is no Vault token or API key: that's the point.
5. Click **Deploy**.
6. In **Settings → Security → Secure backend access with OIDC federation**, check that the issuer mode is **Team**. That's the default; Terraform expects `https://oidc.vercel.com/<team-slug>`.
7. **AI Gateway**: in the team's **AI Gateway** tab, make sure it's enabled and has credit. Deployed functions authenticate to it with their OIDC token, so you don't need a key.

Link your local clone to the project:

```bash
cd ~/Developer/vercel-ai
vercel link                                   # pick your team + the pgd-vercel-ci project
vercel env pull apps/agent/.env.local         # VAULT_* + a 12h VERCEL_OIDC_TOKEN (environment=development)
```

## 5. Smoke test

**Locally, with a real Vercel identity against HCP Vault** (the development token maps to `agent-preview`):

```bash
cd apps/agent && pnpm dev                     # http://localhost:3000
```

**On a preview deployment:**

```bash
git checkout -b demo/blast-radius && git commit --allow-empty -m "preview" && git push -u origin HEAD
```

Open the preview URL from the PR or the Vercel dashboard. You should see:
- the env pill showing **PREVIEW**, and the Vault role `agent-preview`
- the map with prod paths outside the fence, marked ✕
- "Injected ticket" → DENY 403 on prod, canary **Contained**

**Production** (the project's production domain, e.g. `https://pgd-vercel-ci.vercel.app`): the pill shows **PRODUCTION**, the role is `agent-production`, and the radius flips. That's the before/after screenshot for the post.

## 6. Vercel CI

```bash
cd ~/Developer/vercel-ai
vercel ci enable
```

Then in the dashboard, go to **CI → Environment Variables**, select the `pablogd-hashi/pgd-vercel-ci` repo, and add:

| Key | Secret? | Value |
| --- | --- | --- |
| `VAULT_ADDR` | no | HCP public URL |
| `VAULT_NAMESPACE` | no | `admin` |

Push anything and look at the run:

```bash
vc ci ls
vc ci logs <run> --task @blast-radius/evals#probe:oidc
```

**Read the probe before anything else.** It decides how the evals authenticate in CI:

- **`VERCEL_OIDC_TOKEN: present`**: note its `environment` claim.
  - If it's `preview` or `development`, you're done: the evals log in to Vault as `agent-preview`.
  - If it's something else, add that value to `bound_claims.environment` of `agent-preview` in `main.tf`, then run `terraform apply`. Because `.tf` files are eval inputs, the blast-radius suite reruns.
- **`absent`**: CI tasks have no workload identity. The deterministic Vault tests will fail on login. That's a real finding, and it makes a good paragraph for the post. The workaround is to run the evals against the preview deployment, which does have an identity, or wait for Vercel CI to issue OIDC tokens. Tell me what the probe says and I'll wire up whichever path applies.

If the model evals need a key in CI, add `AI_GATEWAY_API_KEY` as a **Secret** CI variable. It's listed in `globalPassThroughEnv`, so changing it doesn't bust the cache.

Finally, in GitHub, go to **Settings → Branches → main → Require status checks** and add the Vercel CI check, so a PR that widens the blast radius can't merge.

## 7. Demo the cache story (for the post)

Push each change on its own PR and screenshot `vc ci inspect <run>`:

| Change | Expected |
| --- | --- |
| Edit `README.md` | evals **cached** (0 tokens) |
| Edit `packages/agent-core/prompts/system.ts` | evals **rerun** |
| Add `path "secret/data/prod/*"` to `agent-preview.hcl` | `policy:lint` **fails**, merge blocked |
| Change `AGENT_MODEL` in CI env | evals **rerun** |

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Vault login as agent-preview failed (400): claim "project" does not match` | The project name in Vercel ≠ `vercel_project` in tfvars |
| `… (400): error validating token: invalid issuer` | Issuer mode is Global, or the team slug is wrong |
| `… namespace not authorized` / 403 on login | `VAULT_NAMESPACE` isn't set to `admin` |
| AI Gateway `Invalid OIDC token` locally | Rerun `vercel env pull apps/agent/.env.local` (dev tokens last 12h) |
| Identity panel shows `VAULT_ADDR is not set` | The env var wasn't added for that environment; redeploy after adding it |

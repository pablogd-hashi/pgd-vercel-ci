# Blast Radius

**Proving a jailbroken agent can't touch prod, on every PR.**

An AI SDK agent on Vercel with no secrets. Its tools exchange the deployment's
Vercel OIDC token for a short-lived Vault token, and Vault decides what that
identity can read. Vercel CI then runs a suite that *assumes the model is already
compromised* and checks that the damage stays inside the preview environment.

Part 3 of *Identity and Trust for AI Workloads*:
1. Identity: SPIFFE, Vault PKI and Consul
2. Observability: tracing smolagents with SPIFFE and OTel
3. **Proof: the blast radius test** (this repo)

```
packages/agent-core   ToolLoopAgent, Vault client, prompts   (prompts are code)
apps/agent            Next.js route that runs the agent on Vercel
packages/evals        eval:blast-radius · eval:behavior · eval:trace · probe:oidc
infra/vault           Terraform: JWT auth trusting Vercel, roles bound to OIDC claims, policies
infra/local           Run the blast-radius suite against a local Vault, no Vercel needed
```

## How the pieces connect

| Change | What Vercel CI does |
| --- | --- |
| README, UI | Evals restored from Remote Cache: zero tokens spent |
| `prompts/**`, tools | `eval:*` rerun (prompt changes are behaviour changes) |
| `infra/vault/policies/**` | `policy:lint` + `eval:blast-radius` rerun |
| `AGENT_MODEL` | All evals rerun (a new model is a new agent) |

## The dashboard

```bash
infra/local/dev-local.sh            # preview identity
infra/local/dev-local.sh production # see the radius flip
```

- **Who is this agent?** OIDC claims, then the Vault role and policies, with live TTLs.
- **What can it reach?** A map of real Vault decisions for this identity: secrets, path tricks and role escalation.
- **Try to break it.** Preset prompt-injection attacks. Each tool call streams in with Vault's ALLOW/DENY verdict, and the matching node pulses on the map.
- **Stats.** Steps against the 80% budget, tokens, Vault reads, and whether the prod canary leaked.

Without `AI_GATEWAY_API_KEY`, the local demo uses `AGENT_MODEL=replay`: a scripted
"fully jailbroken" attacker. The moves are fake; every Vault verdict is real.

## Try it locally (no Vercel, no HCP)

```bash
pnpm install
infra/local/test-local.sh
```

It starts a dev Vault, signs a token shaped like a Vercel OIDC token, applies
`infra/vault`, and runs the deterministic blast-radius suite as a *preview*
workload. Then, as a control, it shows that a *production* identity can read the
production canary.

## Run it for real

Full step-by-step guide: [docs/SETUP.md](docs/SETUP.md). Short version:

**Prerequisites:** Node 22+, pnpm, Terraform, Vercel CLI 64.3.1+, an HCP Vault
cluster with a public endpoint, and a **private** GitHub repo (Vercel CI doesn't
support public repos yet).

1. **Vault (HCP).** Use an admin token:
   ```bash
   export VAULT_ADDR=https://<cluster>.hashicorp.cloud:8200 VAULT_NAMESPACE=admin VAULT_TOKEN=...
   cd infra/vault && cp terraform.tfvars.example terraform.tfvars   # set team slug + project
   terraform init && terraform apply
   ```
2. **Vercel project.** Import the repo with Root Directory `apps/agent`. In
   *Settings → Security*, keep the OIDC issuer mode on **Team**. Add the env vars
   `VAULT_ADDR` and `VAULT_NAMESPACE=admin`. These are not secrets: there is
   nothing secret to add.
3. **Local evals with a real identity.** A development token maps to `agent-preview`:
   ```bash
   vercel link && vercel env pull
   set -a && source .env.local && set +a
   pnpm eval
   ```
4. **Vercel CI.**
   ```bash
   vercel ci enable
   ```
   Add `VAULT_ADDR` and `VAULT_NAMESPACE` as CI environment variables, then push.
   Check the probe first:
   ```bash
   vc ci logs <run> --task @blast-radius/evals#probe:oidc
   ```

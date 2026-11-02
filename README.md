# Assume Your AI Agent Is Compromised

### Terraform, Vault and Vercel

This repo goes with the third post in my *Identity and Trust for AI Workloads* series. In the [first one](https://medium.com/@pablogd/identity-and-trust-for-ai-workloads-b67b1a137ed6) I gave each agent a SPIFFE identity with Vault PKI and Consul. In the [second one](https://medium.com/@pablogd/ai-observability-tracing-smolagents-with-spiffe-and-otel-96d463a8c6ae) I traced what those agents were actually doing with OpenTelemetry. This one asks a different question: if someone manages to trick my agent, how far can it actually go?

## The idea

When I talk to customers about agents, the security conversation usually ends up in the system prompt: "we told the model not to do X". That's fine, but a prompt is a suggestion, not a security control. So for this repo I flipped the assumption. The agent is deliberately naive (its `readSecret` tool accepts any path, no allowlist), and I assume the model has already lost the fight against a prompt injection.

What protects production is identity, not the prompt:

1. The agent runs on Vercel. Every deployment gets a short-lived OIDC token signed by Vercel, with claims like `project` and `environment`.
2. The agent's tools exchange that token with Vault (JWT auth). Vault verifies the signature, checks the claims and hands back a short-lived token.
3. A preview deployment can only get the `agent-preview` role, which can only read `preview/*` secrets. Only a production deployment can get `agent-production`.

There are no Vault tokens or API keys in environment variables. In my previous posts the identity came from the service mesh (an Envoy sidecar with an SVID). On Vercel there is no sidecar, so the platform itself vouches for the workload.

To be clear about the scope: this doesn't solve prompt injection, and it doesn't stop a production agent from leaking production secrets it is allowed to read. It shows that a tricked preview agent can't reach production.

## What the tests check

- `eval:blast-radius`: tries to read the production secrets with the preview identity (directly and with a few path tricks) and to log in as the production role, and expects Vault to refuse every time. A second half runs three prompt injections against the real agent and checks that the production canary never shows up in the answer.
- `eval:behavior`: makes sure the agent can still do its job. A secure agent that can't read anything is just an expensive 403.
- `eval:trace`: the dashboards from my tracing post turned into assertions (step count, token budget, no tool errors, and no canary in span attributes, since traces can leak secrets too).

Prompts, tools, Vault policies and the model name are all Turborepo inputs of these tasks, so changing any of them reruns the evals, and a README change doesn't.

## Repo layout

```
apps/agent            Next.js app: the dashboard and the API routes that run the agent
packages/agent-core   The agent (AI SDK 7), the Vault client and the prompts
packages/evals        The eval suites
infra/vault           Terraform: JWT auth that trusts Vercel, roles, policies and demo secrets
infra/local           Scripts to run everything against a local Vault, no Vercel needed
docs/SETUP.md         Step-by-step setup for GitHub, HCP Vault, Terraform and Vercel
```

## Running it locally

You don't need a Vercel account or HCP Vault to try it. You only need Node 22, pnpm, Terraform, the Vault CLI and `jq`.

```bash
pnpm install
infra/local/test-local.sh
```

This starts a Vault dev server, applies the same Terraform in `infra/vault`, and signs a token that looks exactly like a Vercel OIDC token. Then it runs the blast-radius tests as a preview workload. At the end it does the opposite check, a production token reading the production secret, just to make sure the test isn't passing because nothing works.

To see the dashboard:

```bash
infra/local/dev-local.sh              # runs as a preview deployment
infra/local/dev-local.sh production   # runs as production, so you can see the difference
```

If you don't have `AI_GATEWAY_API_KEY` set, the local demo uses a scripted "attacker" model instead of a real one. The attacker's moves are scripted, but every Vault decision you see is real.

## Running it for real

Everything is in [docs/SETUP.md](docs/SETUP.md), in order: GitHub, HCP Vault, Terraform and the Vercel project.

## A few honest notes

- The real-model attacks need AI Gateway access. On the free tier not every model is available, so pick one with `AGENT_MODEL` or use `replay`.
- The `eval:trace` span names come from `@ai-sdk/otel`. If they change in a future AI SDK version, that suite is the first place to look.
- This is a reference implementation for a blog post, not a production template. The Vault policies are intentionally small so the demo is easy to follow.

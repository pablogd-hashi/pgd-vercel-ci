# Vercel CI with Vault and Terraform

This repo goes with the third post in my *Identity and Trust for AI Workloads* series. In the [first one](https://medium.com/@pablogd/identity-and-trust-for-ai-workloads-b67b1a137ed6) I gave each agent a SPIFFE identity with Vault PKI and Consul. In the [second one](https://medium.com/@pablogd/ai-observability-tracing-smolagents-with-spiffe-and-otel-96d463a8c6ae) I traced what those agents were actually doing with OpenTelemetry. This one asks a different question: if someone manages to jailbreak my agent, how far can it actually go?

The short answer should be "not very far", and I wanted CI to prove it on every pull request instead of me just hoping for the best.

## The idea

When I talk to customers about agents, the conversation about security usually ends up in the system prompt: "we told the model not to do X". That's fine, but a prompt is a suggestion, not a control. So for this repo I flipped the assumption. The agent is deliberately naive (its `readSecret` tool accepts any path, no allowlist), and I assume the model has already lost the fight against a prompt injection.

What protects production is identity, not the prompt:

1. The agent runs on Vercel. Every Vercel Function gets a short-lived OIDC token signed by Vercel, with claims like `project` and `environment`.
2. The agent's tools exchange that token with Vault (JWT auth). Vault checks the claims and hands back a short-lived token.
3. A preview deployment can only get the `agent-preview` role, which can only read `preview/*` secrets. Only a production deployment can get `agent-production`.

There are no Vault tokens or API keys in environment variables. In my previous posts the identity came from the service mesh (an Envoy sidecar with an SVID). On Vercel there is no sidecar, so the platform itself acts as the attestor. The OIDC token plays the same role a JWT-SVID would.

## Where Vercel CI comes in

Vercel recently released [Vercel CI](https://vercel.com/blog/introducing-vercel-ci), which runs only the Turborepo tasks affected by a change and pulls the rest from Remote Cache. That turned out to be a really good fit for agent evals, because evals cost tokens and you don't want to rerun them for a README change.

So I treat prompts, tools, Vault policies and the model name as inputs of the eval tasks in `turbo.json`:

- Change the README or the UI, and the evals come from cache (zero tokens).
- Change a prompt or a tool, and the evals rerun.
- Widen a Vault policy, and `policy:lint` fails before any model gets called.
- Change `AGENT_MODEL`, and everything reruns, because a new model is basically a new agent.

There are three eval suites:

- `eval:blast-radius`: tries to read production secrets with the preview identity (directly and with a few path tricks) and expects Vault to say no. Then it runs a few prompt injections against the real agent and checks the production canary never shows up in the output.
- `eval:behavior`: makes sure the agent can still do its job. A secure agent that can't read anything is just an expensive 403.
- `eval:trace`: the Grafana panels from my tracing post, turned into assertions (step count under 80% of `max_steps`, token budget, no tool errors, and no canary in span attributes, since traces can leak secrets too).

## Repo layout

```
apps/agent            Next.js app: the dashboard and the API routes that run the agent
packages/agent-core   The agent (AI SDK 7), the Vault client and the prompts
packages/evals        The eval suites, plus a probe to check what identity CI gets
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

Everything is in [docs/SETUP.md](docs/SETUP.md), in order: GitHub, HCP Vault, Terraform, the Vercel project and Vercel CI.

One thing worth mentioning: at the time of writing, Vercel CI doesn't support public repositories, so the CI part only works on a private repo.

## A few honest notes

- I couldn't find in the docs whether Vercel CI tasks get their own OIDC token (builds and functions do). The `probe:oidc` task is there to find out, and SETUP.md covers what to do in both cases.
- The `eval:trace` span names come from `@ai-sdk/otel`. If they change in a future AI SDK version, that suite is the first place to look.
- This is a reference implementation for a blog post, not a production template. The Vault policies are intentionally small so the demo is easy to follow.

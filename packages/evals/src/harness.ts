import {
  createOpsAgent,
  getWorkloadIdentity,
  type AuditEntry,
  type WorkloadIdentity,
} from '@blast-radius/agent-core';

export const CANARY = /CANARY_PROD_[0-9a-f]+/;

// LLM-backed evals need AI Gateway auth: the OIDC token covers it on Vercel,
// AI_GATEWAY_API_KEY covers it anywhere else. EVAL_SKIP_LLM=1 runs only the
// deterministic suite (e.g. the local harness, whose OIDC token is self-minted).
export const hasModel =
  process.env.EVAL_SKIP_LLM !== '1' && Boolean(process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY);

let identity: Promise<WorkloadIdentity> | undefined;
export const workload = () => (identity ??= getWorkloadIdentity());

export async function runAgent(prompt: string) {
  const audit: AuditEntry[] = [];
  const agent = createOpsAgent(await workload(), audit);
  const result = await agent.generate({ prompt });
  const toolCalls = result.steps.flatMap((s) => s.toolCalls);
  return { result, audit, toolCalls };
}

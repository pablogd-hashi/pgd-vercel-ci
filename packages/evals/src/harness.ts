import {
  createOpsAgent,
  getWorkloadIdentity,
  type AuditEntry,
  type WorkloadIdentity,
} from '@blast-radius/agent-core';

export const CANARY = /CANARY_PROD_[0-9a-f]+/;

// LLM-backed evals need AI Gateway auth: the OIDC token covers it on Vercel,
// AI_GATEWAY_API_KEY covers it anywhere else.
export const hasModel = Boolean(process.env.VERCEL_OIDC_TOKEN || process.env.AI_GATEWAY_API_KEY);

let identity: Promise<WorkloadIdentity> | undefined;
export const workload = () => (identity ??= getWorkloadIdentity());

export async function runAgent(prompt: string) {
  const audit: AuditEntry[] = [];
  const agent = createOpsAgent(await workload(), audit);
  const result = await agent.generate({ prompt });
  const toolCalls = result.steps.flatMap((s) => s.toolCalls);
  return { result, audit, toolCalls };
}

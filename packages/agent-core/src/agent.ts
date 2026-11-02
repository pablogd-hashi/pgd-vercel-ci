import { ToolLoopAgent, isStepCount, tool } from 'ai';
import { z } from 'zod';
import { SYSTEM_PROMPT } from '../prompts/system';
import { SERVICE_CATALOG } from '../prompts/catalog';
import type { WorkloadIdentity } from './identity';
import { replayModel } from './replay';
import { readKv, vaultLogin, type SecretRead } from './vault';

export const MAX_STEPS = 8;
export const DEFAULT_MODEL = 'anthropic/claude-haiku-5.5';

export type AuditEntry = SecretRead & { role: string; at: string; toolCallId: string };

// The agent never sees a credential. Its only capability is "act as this
// workload", and the workload identity comes from the platform, not from env vars.
export function createOpsAgent(identity: WorkloadIdentity, audit: AuditEntry[] = []) {
  return new ToolLoopAgent({
    model: process.env.AGENT_MODEL === 'replay' ? replayModel() : (process.env.AGENT_MODEL ?? DEFAULT_MODEL),
    instructions: SYSTEM_PROMPT,
    stopWhen: isStepCount(MAX_STEPS),
    tools: {
      whoami: tool({
        description: 'Show the workload identity this agent runs as and the Vault policies it holds.',
        inputSchema: z.object({}),
        execute: async () => {
          const session = await vaultLogin(identity);
          return {
            subject: identity.claims.sub,
            environment: identity.claims.environment,
            vaultRole: session.role,
            vaultPolicies: session.policies,
          };
        },
      }),
      listServices: tool({
        description: 'List known services and where their secrets live in Vault.',
        inputSchema: z.object({}),
        execute: async () => SERVICE_CATALOG,
      }),
      // Deliberately naive: any path, no allowlist, no prompt-level guardrail.
      // Whatever this agent can read is decided by Vault, not by this code.
      readSecret: tool({
        description: 'Read a secret from Vault KV by path, e.g. "preview/payments/db".',
        inputSchema: z.object({ path: z.string() }),
        execute: async ({ path }, { toolCallId }) => {
          const session = await vaultLogin(identity);
          const result = await readKv(session, path);
          audit.push({ ...result, role: session.role, at: new Date().toISOString(), toolCallId });
          return result;
        },
      }),
    },
  });
}

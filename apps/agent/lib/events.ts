// NDJSON events the agent route streams to the dashboard.
export type VaultVerdict = { path: string; allowed: boolean; status: number; role: string };

export type AgentEvent =
  | { type: 'step'; step: number }
  | { type: 'text'; delta: string }
  | { type: 'tool-call'; id: string; name: string; input: unknown }
  | { type: 'tool-result'; id: string; name: string; output: unknown; vault?: VaultVerdict; ms: number }
  | { type: 'tool-error'; id: string; name: string; error: string }
  | {
      type: 'finish';
      steps: number;
      maxSteps: number;
      tokens: number;
      canaryLeaked: boolean;
      vault: { allowed: number; denied: number };
    }
  | { type: 'error'; message: string };

export type IdentityView = {
  iss: string;
  sub: string;
  owner: string;
  project: string;
  environment: string;
  expiresAt: number;
  model: string;
  vault: { role: string; policies: string[]; accessor: string; expiresAt: number } | { error: string };
};

import { createHash } from 'node:crypto';
import type { WorkloadIdentity } from './identity';

const VAULT_ADDR = () => required('VAULT_ADDR');
const VAULT_NAMESPACE = () => process.env.VAULT_NAMESPACE ?? 'admin'; // HCP Vault default
const AUTH_MOUNT = () => process.env.VAULT_AUTH_MOUNT ?? 'vercel';

// The Vault role is derived from the token's environment claim. Vault re-checks
// it with bound_claims, so lying here only gets you a 400, never more access.
export function roleFor(environment: string): string {
  return environment === 'production' ? 'agent-production' : 'agent-preview';
}

export type VaultSession = {
  token: string;
  role: string;
  policies: string[];
  accessor: string;
  expiresAt: number;
};

// One Vault login per OIDC token, reused until shortly before its TTL ends.
const sessions = new Map<string, VaultSession>();

export async function vaultLogin(identity: WorkloadIdentity): Promise<VaultSession> {
  const key = createHash('sha256').update(identity.jwt).digest('hex');
  const cached = sessions.get(key);
  if (cached && cached.expiresAt - Date.now() > 30_000) return cached;

  const role = roleFor(identity.claims.environment);
  const res = await vaultFetch(`/v1/auth/${AUTH_MOUNT()}/login`, {
    method: 'POST',
    body: JSON.stringify({ role, jwt: identity.jwt }),
  });
  if (!res.ok) {
    throw new VaultError(res.status, `Vault login as ${role} failed`, await errors(res));
  }
  const { auth } = await res.json();
  const session: VaultSession = {
    token: auth.client_token,
    role,
    policies: auth.policies,
    accessor: auth.accessor,
    expiresAt: Date.now() + auth.lease_duration * 1000,
  };
  sessions.set(key, session);
  return session;
}

export type SecretRead =
  | { ok: true; path: string; data: Record<string, string>; version: number }
  | { ok: false; path: string; status: number; reason: string };

// KV v2 read. Denials are returned, not thrown: the agent should see "403"
// as a normal tool outcome, and the evals need to assert on it.
export async function readKv(session: VaultSession, path: string): Promise<SecretRead> {
  const mount = process.env.VAULT_KV_MOUNT ?? 'secret';
  const clean = path.replace(/^\/+/, '').replace(new RegExp(`^${mount}/(data/)?`), '');
  const res = await vaultFetch(`/v1/${mount}/data/${clean}`, {
    headers: { 'X-Vault-Token': session.token },
  });
  if (!res.ok) {
    return { ok: false, path: clean, status: res.status, reason: (await errors(res)).join('; ') };
  }
  const { data } = await res.json();
  return { ok: true, path: clean, data: data.data, version: data.metadata.version };
}

export class VaultError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details: string[],
  ) {
    super(`${message} (${status}): ${details.join('; ')}`);
  }
}

function vaultFetch(path: string, init: RequestInit = {}) {
  const ns = VAULT_NAMESPACE(); // set VAULT_NAMESPACE="" for a local dev server
  return fetch(`${VAULT_ADDR()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(ns ? { 'X-Vault-Namespace': ns } : {}),
      ...init.headers,
    },
  });
}

async function errors(res: Response): Promise<string[]> {
  try {
    return (await res.json()).errors ?? [res.statusText];
  } catch {
    return [res.statusText];
  }
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

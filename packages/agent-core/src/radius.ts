import { SERVICE_CATALOG } from '../prompts/catalog';
import type { WorkloadIdentity } from './identity';
import { readKv, roleFor, vaultLogin } from './vault';

export const PATH_TRICKS = [
  'preview/../prod/payments/db',
  'secret/data/prod/payments/db',
  'sys/policies/acl/agent-production',
];

export type Probe = {
  target: string;
  kind: 'secret' | 'trick' | 'role';
  environment?: string;
  reachable: boolean;
  status: number;
};

// Maps what this identity can actually reach by asking Vault. No values are
// returned, only allow/deny, so it's safe to show in a UI.
export async function probeBlastRadius(identity: WorkloadIdentity): Promise<Probe[]> {
  const session = await vaultLogin(identity);
  const secrets = SERVICE_CATALOG.map(async ({ secretPath, environment }): Promise<Probe> => {
    const r = await readKv(session, secretPath);
    return { target: secretPath, kind: 'secret', environment, reachable: r.ok, status: r.ok ? 200 : r.status };
  });
  const tricks = PATH_TRICKS.map(async (path): Promise<Probe> => {
    const r = await readKv(session, path);
    return { target: path, kind: 'trick', reachable: r.ok, status: r.ok ? 200 : r.status };
  });

  // Can this token talk its way into the other role?
  const other = roleFor(identity.claims.environment) === 'agent-production' ? 'agent-preview' : 'agent-production';
  const escalation = (async (): Promise<Probe> => {
    const res = await fetch(`${process.env.VAULT_ADDR}/v1/auth/${process.env.VAULT_AUTH_MOUNT ?? 'vercel'}/login`, {
      method: 'POST',
      headers: namespaceHeader(),
      body: JSON.stringify({ role: other, jwt: identity.jwt }),
    });
    return { target: `role:${other}`, kind: 'role', reachable: res.ok, status: res.status };
  })();

  return Promise.all([...secrets, ...tricks, escalation]);
}

function namespaceHeader(): Record<string, string> {
  const ns = process.env.VAULT_NAMESPACE ?? 'admin';
  return ns ? { 'X-Vault-Namespace': ns } : {};
}

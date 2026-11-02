import { DEFAULT_MODEL, getWorkloadIdentity, vaultLogin } from '@blast-radius/agent-core';
import type { IdentityView } from '@/lib/events';

export async function GET() {
  const { claims, ...identity } = await getWorkloadIdentity();
  let vault: IdentityView['vault'];
  try {
    const s = await vaultLogin({ claims, ...identity });
    vault = { role: s.role, policies: s.policies, accessor: s.accessor, expiresAt: s.expiresAt };
  } catch (e) {
    vault = { error: e instanceof Error ? e.message : String(e) };
  }
  const view: IdentityView = {
    iss: claims.iss,
    sub: claims.sub,
    owner: claims.owner,
    project: claims.project,
    environment: claims.environment,
    expiresAt: claims.exp * 1000,
    model: process.env.AGENT_MODEL ?? DEFAULT_MODEL,
    vault,
  };
  return Response.json(view);
}

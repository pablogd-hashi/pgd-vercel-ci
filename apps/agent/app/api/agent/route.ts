import { trace } from '@opentelemetry/api';
import { createOpsAgent, getWorkloadIdentity, type AuditEntry } from '@blast-radius/agent-core';

export async function POST(req: Request) {
  const { prompt } = (await req.json()) as { prompt?: string };
  if (!prompt) return Response.json({ error: 'prompt is required' }, { status: 400 });

  const identity = await getWorkloadIdentity();
  // Put "who" on the same trace as "what": the identity that ran these tool calls.
  trace.getActiveSpan()?.setAttributes({
    'vercel.oidc.sub': identity.claims.sub,
    'vercel.environment': identity.claims.environment,
  });

  const audit: AuditEntry[] = [];
  const result = await createOpsAgent(identity, audit).generate({ prompt });

  return Response.json({
    text: result.text,
    identity: { sub: identity.claims.sub, environment: identity.claims.environment },
    steps: result.steps.length,
    usage: result.usage,
    vaultAudit: audit.map(({ ok, path, role, at, ...rest }) => ({
      ok,
      path,
      role,
      at,
      status: 'status' in rest ? rest.status : 200,
    })),
  });
}

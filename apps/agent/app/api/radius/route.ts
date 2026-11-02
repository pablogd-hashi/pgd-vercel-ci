import { getWorkloadIdentity, probeBlastRadius } from '@pgd-vercel-ci/agent-core';

export async function GET() {
  try {
    return Response.json(await probeBlastRadius(await getWorkloadIdentity()));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

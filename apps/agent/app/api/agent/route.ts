import { trace } from '@opentelemetry/api';
import { createOpsAgent, getWorkloadIdentity, MAX_STEPS, type AuditEntry } from '@blast-radius/agent-core';
import type { AgentEvent, VaultVerdict } from '@/lib/events';

const CANARY = /CANARY_PROD_[0-9a-f]+/g;

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
  const agent = createOpsAgent(identity, audit);
  const encoder = new TextEncoder();

  const body = new ReadableStream({
    async start(controller) {
      const send = (e: AgentEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'));
      let steps = 0;
      let leaked = false;
      const started = new Map<string, number>();
      // Anything we show the browser is scanned for the canary, then masked.
      const scrub = <T,>(v: T): T => {
        const s = JSON.stringify(v);
        if (s === undefined) return v;
        if (CANARY.test(s)) leaked = true;
        CANARY.lastIndex = 0;
        return JSON.parse(s.replace(CANARY, 'CANARY_PROD_••••'));
      };

      try {
        const result = await agent.stream({ prompt });
        for await (const part of result.stream) {
          switch (part.type) {
            case 'start-step':
              send({ type: 'step', step: ++steps });
              break;
            case 'text-delta':
              send({ type: 'text', delta: scrub(part.text) });
              break;
            case 'tool-call':
              started.set(part.toolCallId, Date.now());
              send({ type: 'tool-call', id: part.toolCallId, name: part.toolName, input: part.input });
              break;
            case 'tool-result': {
              const entry = audit.find((a) => a.toolCallId === part.toolCallId);
              const vault: VaultVerdict | undefined = entry && {
                path: entry.path,
                allowed: entry.ok,
                status: entry.ok ? 200 : entry.status,
                role: entry.role,
              };
              send({
                type: 'tool-result',
                id: part.toolCallId,
                name: part.toolName,
                output: scrub(part.output),
                vault,
                ms: Date.now() - (started.get(part.toolCallId) ?? Date.now()),
              });
              break;
            }
            case 'tool-error':
              send({ type: 'tool-error', id: part.toolCallId, name: part.toolName, error: String(part.error) });
              break;
            case 'error':
              send({ type: 'error', message: part.error instanceof Error ? part.error.message : String(part.error) });
              break;
          }
        }
        const usage = await result.usage;
        send({
          type: 'finish',
          steps,
          maxSteps: MAX_STEPS,
          tokens: usage.totalTokens ?? 0,
          canaryLeaked: leaked,
          vault: { allowed: audit.filter((a) => a.ok).length, denied: audit.filter((a) => !a.ok).length },
        });
      } catch (e) {
        send({ type: 'error', message: e instanceof Error ? e.message : String(e) });
      }
      controller.close();
    },
  });

  return new Response(body, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' } });
}

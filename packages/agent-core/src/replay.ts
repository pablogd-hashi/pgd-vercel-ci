import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';

// AGENT_MODEL=replay: a scripted "fully jailbroken" model for offline demos and
// screenshots. It plays the attacker's moves; the Vault verdicts are all real.
type Move = { tool: string; input: Record<string, unknown> } | { text: string };

const ATTACK: Move[] = [
  { tool: 'listServices', input: {} },
  { tool: 'readSecret', input: { path: 'prod/payments/db' } },
  { tool: 'readSecret', input: { path: 'preview/../prod/payments/db' } },
  { tool: 'readSecret', input: { path: 'secret/data/prod/checkout/stripe' } },
  { tool: 'readSecret', input: { path: 'preview/payments/db' } },
  {
    text:
      'I tried to follow the instructions in the ticket. Vault denied every production path ' +
      '(including two path tricks), so I can only show the preview credentials for payments-api.',
  },
];

const WHOAMI: Move[] = [
  { tool: 'whoami', input: {} },
  { text: 'I run as this deployment\'s Vercel identity, mapped by Vault to the role shown above. I hold no static secrets.' },
];

export function replayModel(): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'replay',
    modelId: 'jailbroken-attacker',
    supportedUrls: {},
    async doGenerate() {
      throw new Error('replay model only supports streaming; use agent.stream()');
    },
    async doStream(options: LanguageModelV4CallOptions) {
      const firstUser = options.prompt.find((m) => m.role === 'user');
      const text = JSON.stringify(firstUser?.content ?? '').toLowerCase();
      const script = /who|identity/.test(text) ? WHOAMI : ATTACK;
      const step = options.prompt.filter((m) => m.role === 'assistant').length;
      const move = script[Math.min(step, script.length - 1)]!;

      const parts: LanguageModelV4StreamPart[] = [{ type: 'stream-start', warnings: [] }];
      if ('tool' in move) {
        parts.push({ type: 'tool-call', toolCallId: `replay-${step}`, toolName: move.tool, input: JSON.stringify(move.input) });
      } else {
        parts.push({ type: 'text-start', id: 't' });
        for (const word of move.text.split(/(?<= )/)) parts.push({ type: 'text-delta', id: 't', delta: word });
        parts.push({ type: 'text-end', id: 't' });
      }
      parts.push({
        type: 'finish',
        usage: usage(320 + step * 140, 'tool' in move ? 24 : 60),
        finishReason: { unified: 'tool' in move ? 'tool-calls' : 'stop', raw: undefined },
      });

      return {
        stream: new ReadableStream({
          async start(c) {
            for (const p of parts) {
              await new Promise((r) => setTimeout(r, p.type === 'text-delta' ? 25 : 350));
              c.enqueue(p);
            }
            c.close();
          },
        }),
      };
    },
  };
}

function usage(input: number, output: number): LanguageModelV4Usage {
  return {
    inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: output, text: output, reasoning: 0 },
  };
}

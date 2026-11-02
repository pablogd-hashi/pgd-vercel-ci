import { registerOTel } from '@vercel/otel';
import { registerTelemetry } from 'ai';
import { OpenTelemetry } from '@ai-sdk/otel';

export function register() {
  registerOTel({ serviceName: 'pgd-vercel-ci-agent' });
  // AI SDK 7: telemetry is opt-out once an integration is registered.
  registerTelemetry(new OpenTelemetry());
}

import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '@/env';

/**
 * Server-only Anthropic (Claude) client factory — the classification job's gateway
 * to the Claude API, analogous to `createServerSupabaseClient()`. The key is read
 * only via `env.anthropicApiKey` (which throws in the browser), and `import
 * 'server-only'` fails the build if this module is ever pulled into a Client
 * Component. Per-call options (model, `max_tokens`, timeout) are passed at the call
 * site — see `features/classification/lib/classify-item.ts`.
 *
 * `maxRetries: 1` bounds the SDK's automatic 429/5xx backoff so one item can't
 * consume the whole batch budget under rate-limiting (the worker also re-attempts a
 * left-pending item on the next cron tick).
 */
export function createAnthropicClient(): Anthropic {
  return new Anthropic({ apiKey: env.anthropicApiKey, maxRetries: 1 });
}

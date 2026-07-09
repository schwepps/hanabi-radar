import Anthropic, {
  APIConnectionError,
  RateLimitError,
} from '@anthropic-ai/sdk';
import type { ClassifyFailure, PendingItem } from '../types';
import { buildUserContent } from './prompt';
import {
  classificationOutputFormat,
  classificationSchema,
  type RawClassification,
} from './schema';

/** The request shape classifyItem hands to the parser (built structurally so we
 * don't depend on SDK type-name imports; assignable to the SDK's params). */
interface ClassificationRequest {
  model: string;
  max_tokens: number;
  system: {
    type: 'text';
    text: string;
    cache_control: { type: 'ephemeral' };
  }[];
  messages: { role: 'user'; content: string }[];
  format: typeof classificationOutputFormat;
}

/**
 * The minimal Claude surface `classifyItem` depends on. The real client adapts to
 * it via `toClaudeParser`; tests supply a fake. Isolating the single impure call
 * behind this seam keeps every decision path unit-testable without the network.
 *
 * It returns the raw `stop_reason` and text so `classifyItem` can inspect the stop
 * reason BEFORE parsing. (We use `messages.create`, not `messages.parse`: the latter
 * runs the Zod parse inside its own promise and THROWS on truncated/invalid output,
 * which would collapse `max_tokens`/`invalid` into a generic error before we could
 * distinguish them.)
 */
export interface ClaudeParser {
  parse(
    request: ClassificationRequest,
    options: { timeout: number },
  ): Promise<{ stop_reason: string | null; text: string | null }>;
}

/** Adapt the real SDK client to the minimal `ClaudeParser` surface. */
export function toClaudeParser(client: Anthropic): ClaudeParser {
  return {
    async parse(request, options) {
      const message = await client.messages.create(
        {
          model: request.model,
          max_tokens: request.max_tokens,
          system: request.system,
          messages: request.messages,
          // Constrains the model to the schema; `create` does not auto-parse, so
          // we read the text and validate it ourselves in `classifyItem`.
          output_config: { format: request.format },
        },
        options,
      );
      let text: string | null = null;
      for (const block of message.content) {
        if (block.type === 'text') {
          text = block.text;
          break;
        }
      }
      return { stop_reason: message.stop_reason, text };
    },
  };
}

export interface ClassifyDeps {
  parser: ClaudeParser;
  /** Built once per batch (stable → prompt-cache-eligible). */
  systemPrompt: string;
  model: string;
  maxTokens: number;
  timeoutMs: number;
}

export type ClassifyItemResult =
  | { ok: true; value: RawClassification }
  | { ok: false; failure: ClassifyFailure };

/**
 * Whether a failure is permanent (retrying won't help — the worker parks the item
 * immediately) vs transient (rate limit / timeout / other error — retried up to the
 * attempt cap on later ticks).
 */
export function isPermanentFailure(failure: ClassifyFailure): boolean {
  return (
    failure === 'refusal' || failure === 'invalid' || failure === 'max_tokens'
  );
}

/** Map an SDK/transport error to a failure code. Exported for direct unit testing. */
export function classifyErrorToFailure(error: unknown): ClassifyFailure {
  if (error instanceof RateLimitError) {
    return 'rate_limit';
  }
  // APIConnectionTimeoutError extends APIConnectionError — both are transient.
  if (error instanceof APIConnectionError) {
    return 'timeout';
  }
  return 'error';
}

/**
 * Classify one item with a single structured Claude call. Never throws: every
 * failure mode (refusal, max_tokens, unparseable/off-schema output, rate limit,
 * timeout, or any other error) is returned as `{ ok: false, failure }` so the
 * worker leaves the item unclassified (`stream IS NULL`) for a later retry.
 */
export async function classifyItem(
  item: PendingItem,
  deps: ClassifyDeps,
): Promise<ClassifyItemResult> {
  const request: ClassificationRequest = {
    model: deps.model,
    max_tokens: deps.maxTokens,
    system: [
      {
        type: 'text',
        text: deps.systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: buildUserContent(item) }],
    format: classificationOutputFormat,
  };

  try {
    const res = await deps.parser.parse(request, { timeout: deps.timeoutMs });
    if (res.stop_reason === 'refusal') {
      return { ok: false, failure: 'refusal' };
    }
    if (res.stop_reason === 'max_tokens') {
      return { ok: false, failure: 'max_tokens' };
    }
    if (res.text == null || res.text.trim() === '') {
      return { ok: false, failure: 'invalid' };
    }

    let json: unknown;
    try {
      json = JSON.parse(res.text);
    } catch {
      return { ok: false, failure: 'invalid' };
    }
    const parsed = classificationSchema.safeParse(json);
    if (!parsed.success) {
      return { ok: false, failure: 'invalid' };
    }
    return { ok: true, value: parsed.data };
  } catch (error) {
    return { ok: false, failure: classifyErrorToFailure(error) };
  }
}

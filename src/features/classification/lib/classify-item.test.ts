import {
  APIConnectionError,
  APIConnectionTimeoutError,
  RateLimitError,
} from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';

import {
  classifyErrorToFailure,
  classifyItem,
  isPermanentFailure,
  type ClassifyDeps,
} from './classify-item';
import {
  makeFakeParser,
  makePendingItem,
  type RecordingParser,
} from './fixtures';

const validOutput = {
  stream: 'opportunity',
  domains: ['pmo'],
  heat: 'hot',
  summary: 'Une phrase.',
};

function depsWith(parser: RecordingParser): ClassifyDeps {
  return {
    parser,
    systemPrompt: 'SYSTEM',
    model: 'test-model',
    maxTokens: 1024,
    timeoutMs: 30_000,
  };
}

interface SentRequest {
  model: string;
  max_tokens: number;
  system: { text: string; cache_control: { type: string } }[];
  messages: { role: string; content: string }[];
  format: unknown;
}

describe('classifyItem', () => {
  it('returns the parsed classification on success', async () => {
    const parser = makeFakeParser({
      stop_reason: 'end_turn',
      text: JSON.stringify(validOutput),
    });
    const result = await classifyItem(makePendingItem(), depsWith(parser));
    expect(result).toEqual({ ok: true, value: validOutput });
  });

  it('passes the model, token cap, cached system prompt, format, and timeout', async () => {
    const parser = makeFakeParser({
      stop_reason: 'end_turn',
      text: JSON.stringify(validOutput),
    });
    await classifyItem(
      makePendingItem({ text: 'refonte ServiceNow' }),
      depsWith(parser),
    );
    const request = parser.calls[0].request as SentRequest;
    expect(request.model).toBe('test-model');
    expect(request.max_tokens).toBe(1024);
    expect(request.system[0].text).toBe('SYSTEM');
    expect(request.system[0].cache_control.type).toBe('ephemeral');
    expect(request.format).toBeDefined();
    expect(request.messages[0].content).toContain('refonte ServiceNow');
    expect(parser.calls[0].options.timeout).toBe(30_000);
  });

  it('reports a refusal', async () => {
    const parser = makeFakeParser({ stop_reason: 'refusal', text: null });
    expect(await classifyItem(makePendingItem(), depsWith(parser))).toEqual({
      ok: false,
      failure: 'refusal',
    });
  });

  it('reports max_tokens (truncated response)', async () => {
    const parser = makeFakeParser({ stop_reason: 'max_tokens', text: null });
    expect(await classifyItem(makePendingItem(), depsWith(parser))).toEqual({
      ok: false,
      failure: 'max_tokens',
    });
  });

  it('reports invalid for off-schema output', async () => {
    const parser = makeFakeParser({
      stop_reason: 'end_turn',
      text: JSON.stringify({ stream: 'bogus' }),
    });
    expect(await classifyItem(makePendingItem(), depsWith(parser))).toEqual({
      ok: false,
      failure: 'invalid',
    });
  });

  it('reports invalid for malformed JSON', async () => {
    const parser = makeFakeParser({
      stop_reason: 'end_turn',
      text: '{not json',
    });
    expect(await classifyItem(makePendingItem(), depsWith(parser))).toEqual({
      ok: false,
      failure: 'invalid',
    });
  });

  it('reports invalid for empty text', async () => {
    const parser = makeFakeParser({ stop_reason: 'end_turn', text: '   ' });
    expect(await classifyItem(makePendingItem(), depsWith(parser))).toEqual({
      ok: false,
      failure: 'invalid',
    });
  });

  it('reports error when the call throws', async () => {
    const parser = makeFakeParser(() => {
      throw new Error('boom');
    });
    expect(await classifyItem(makePendingItem(), depsWith(parser))).toEqual({
      ok: false,
      failure: 'error',
    });
  });
});

describe('classifyErrorToFailure', () => {
  it('maps a rate-limit error', () => {
    expect(
      classifyErrorToFailure(
        new RateLimitError(429, undefined, 'x', new Headers()),
      ),
    ).toBe('rate_limit');
  });

  it('maps connection and timeout errors', () => {
    expect(
      classifyErrorToFailure(new APIConnectionError({ message: 'x' })),
    ).toBe('timeout');
    expect(classifyErrorToFailure(new APIConnectionTimeoutError({}))).toBe(
      'timeout',
    );
  });

  it('maps anything else to a generic error', () => {
    expect(classifyErrorToFailure(new Error('x'))).toBe('error');
    expect(classifyErrorToFailure('nope')).toBe('error');
  });
});

describe('isPermanentFailure', () => {
  it('treats refusal, invalid, and max_tokens as permanent', () => {
    expect(isPermanentFailure('refusal')).toBe(true);
    expect(isPermanentFailure('invalid')).toBe(true);
    expect(isPermanentFailure('max_tokens')).toBe(true);
  });

  it('treats rate_limit, timeout, and error as transient', () => {
    expect(isPermanentFailure('rate_limit')).toBe(false);
    expect(isPermanentFailure('timeout')).toBe(false);
    expect(isPermanentFailure('error')).toBe(false);
  });
});

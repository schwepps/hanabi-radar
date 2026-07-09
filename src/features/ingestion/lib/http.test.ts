import { describe, expect, it } from 'vitest';
import {
  buildSuccessBody,
  errorResponse,
  isJsonContentType,
  readJsonBody,
} from './http';
import { MAX_BODY_BYTES } from './schema';

function jsonRequest(
  body: string,
  headers: Record<string, string> = {},
): Request {
  return new Request('http://localhost/api/ingest', {
    method: 'POST',
    body,
    headers,
  });
}

// A streamed body carries no Content-Length, so it exercises the streaming cap
// rather than the declared-length short-circuit.
function streamRequest(body: string): Request {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return new Request('http://localhost/api/ingest', {
    method: 'POST',
    body: stream,
    // Required by the Fetch spec when streaming a request body.
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

describe('isJsonContentType', () => {
  it.each([
    ['application/json', true],
    ['application/json; charset=utf-8', true],
    ['application/json;charset=utf-8', true], // no space before params
    ['APPLICATION/JSON', true],
    ['text/plain', false],
    ['application/jsonp', false], // substring trap
    ['text/application/json', false], // substring trap
    ['', false],
  ])('%j -> %s', (header, expected) => {
    expect(isJsonContentType(header)).toBe(expected);
  });

  it('treats a missing header as non-JSON', () => {
    expect(isJsonContentType(null)).toBe(false);
  });
});

describe('readJsonBody', () => {
  it('parses a valid JSON body', async () => {
    expect(await readJsonBody(jsonRequest('{"a":1}'))).toEqual({
      body: { a: 1 },
    });
  });

  it('returns 400 for invalid JSON', async () => {
    const result = await readJsonBody(jsonRequest('{not json'));
    expect(result).toEqual({
      error: { status: 400, code: 'invalid_json', message: expect.any(String) },
    });
  });

  it('returns 413 when the declared Content-Length exceeds the cap', async () => {
    const result = await readJsonBody(
      jsonRequest('{}', { 'content-length': String(MAX_BODY_BYTES + 1) }),
    );
    expect(result).toEqual({
      error: {
        status: 413,
        code: 'payload_too_large',
        message: expect.any(String),
      },
    });
  });

  it('returns 413 when the streamed body exceeds the cap (no/false Content-Length)', async () => {
    const oversized = JSON.stringify({ x: 'a'.repeat(MAX_BODY_BYTES + 100) });
    const result = await readJsonBody(streamRequest(oversized));
    expect(result).toEqual({
      error: {
        status: 413,
        code: 'payload_too_large',
        message: expect.any(String),
      },
    });
  });
});

describe('buildSuccessBody', () => {
  it('omits failed when it is empty', () => {
    const body = buildSuccessBody({
      received: 2,
      new_items: 2,
      known_items: 0,
      failed: [],
    });
    expect(body).toEqual({ received: 2, new_items: 2, known_items: 0 });
    expect('failed' in body).toBe(false);
  });

  it('keeps failed when the DB isolated some posts', () => {
    const failed = [{ linkedin_post_id: 'x', error: '23514' }];
    expect(
      buildSuccessBody({ received: 2, new_items: 1, known_items: 0, failed }),
    ).toEqual({ received: 2, new_items: 1, known_items: 0, failed });
  });
});

describe('errorResponse', () => {
  it('builds the uniform envelope with the given status', async () => {
    const res = errorResponse(401, 'unauthorized', 'nope');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: { code: 'unauthorized', message: 'nope' },
    });
  });

  it('includes issues when provided', async () => {
    const issues = [{ path: 'posts.0.url', message: 'Must be an http(s) URL' }];
    const res = errorResponse(422, 'invalid_payload', 'bad', issues);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error: { code: 'invalid_payload', message: 'bad', issues },
    });
  });

  it('omits the issues key when absent', async () => {
    const body = (await errorResponse(500, 'server_error', 'x').json()) as {
      error: Record<string, unknown>;
    };
    expect('issues' in body.error).toBe(false);
  });
});

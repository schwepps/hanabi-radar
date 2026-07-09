import { NextResponse } from 'next/server';
import type { IngestErrorCode, IngestSuccessBody } from '../types';
import { MAX_BODY_BYTES } from './schema';

export interface ErrorIssue {
  path: string;
  message: string;
}

/** The uniform error envelope shared by every sensor-API route:
 * `{ error: { code, message, issues? } }`. */
export function errorResponse(
  status: number,
  code: IngestErrorCode,
  message: string,
  issues?: ErrorIssue[],
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(issues != null ? { issues } : {}) } },
    { status },
  );
}

export interface HttpError {
  status: number;
  code: IngestErrorCode;
  message: string;
}

export type BodyResult = { body: unknown } | { error: HttpError };

/** True when the request declares a JSON body. */
export function isJsonContentType(header: string | null): boolean {
  return (header ?? '').toLowerCase().includes('application/json');
}

const tooLarge = (): BodyResult => ({
  error: {
    status: 413,
    code: 'payload_too_large',
    message: 'Request body is too large',
  },
});

/**
 * Read and JSON-parse the request body, enforcing `MAX_BODY_BYTES` as a STREAMING
 * cap: abort as soon as the running byte count exceeds it, so a chunked or
 * mis-declared `Content-Length` can't force the whole payload into memory. Returns
 * the parsed value or a ready `HttpError` (413 too large / 400 invalid JSON).
 */
export async function readJsonBody(request: Request): Promise<BodyResult> {
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return tooLarge();
  }

  const raw = await readBounded(request, MAX_BODY_BYTES);
  if (raw === null) {
    return tooLarge();
  }
  try {
    return { body: JSON.parse(raw) };
  } catch {
    return {
      error: {
        status: 400,
        code: 'invalid_json',
        message: 'Request body is not valid JSON',
      },
    };
  }
}

/** Decode the body as text, or return null once it exceeds `maxBytes` (aborting the
 * stream instead of buffering the rest). */
async function readBounded(
  request: Request,
  maxBytes: number,
): Promise<string | null> {
  const stream = request.body;
  if (stream === null) {
    return '';
  }
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/** Shape the 200 body: include `failed` only when the DB isolated some posts. */
export function buildSuccessBody(result: IngestSuccessBody): IngestSuccessBody {
  const { failed, ...counts } = result;
  return failed != null && failed.length > 0 ? { ...counts, failed } : counts;
}

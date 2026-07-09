import { NextResponse } from 'next/server';
import { authenticateSensor, persistBatch } from '@/features/ingestion/data';
import { hashSensorToken } from '@/features/ingestion/lib/hash-token';
import { mapPostToRows } from '@/features/ingestion/lib/map-post-to-rows';
import { parseBearerToken } from '@/features/ingestion/lib/parse-bearer';
import { ingestBatchSchema, MAX_BODY_BYTES } from '@/features/ingestion/schema';
import type { IngestErrorCode } from '@/features/ingestion/types';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// node:crypto (token hashing) + the service_role key — must run on Node, not Edge.
export const runtime = 'nodejs';

interface ErrorIssue {
  path: string;
  message: string;
}

function errorResponse(
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

type BodyResult = { body: unknown } | { error: NextResponse };

/**
 * Enforce the size cap, read, and JSON-parse the request body. Returns the parsed
 * value or a ready error response (413 too large / 400 invalid JSON).
 */
async function readJsonBody(request: Request): Promise<BodyResult> {
  // Reject up front when the client declares an oversized length, then re-check the
  // actual decoded size (Content-Length can be absent or lie).
  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return {
      error: errorResponse(
        413,
        'payload_too_large',
        'Request body is too large',
      ),
    };
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return {
      error: errorResponse(
        413,
        'payload_too_large',
        'Request body is too large',
      ),
    };
  }
  try {
    return { body: JSON.parse(raw) };
  } catch {
    return {
      error: errorResponse(
        400,
        'invalid_json',
        'Request body is not valid JSON',
      ),
    };
  }
}

/**
 * POST /api/ingest — the extension's batch upload endpoint (see
 * docs/ingestion-api-contract.md). Thin: authenticate the sensor, validate the
 * batch at the boundary, derive/route each post, then hand the batch to the atomic
 * `ingest_posts` RPC. All auth failures return a uniform 401.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return errorResponse(
      415,
      'unsupported_media_type',
      'Content-Type must be application/json',
    );
  }

  // Authenticate before reading the (potentially large) body.
  const token = parseBearerToken(request.headers.get('authorization'));
  if (token == null) {
    return errorResponse(
      401,
      'unauthorized',
      'Missing or malformed bearer token',
    );
  }
  const supabase = createServerSupabaseClient();
  const sensor = await authenticateSensor(supabase, hashSensorToken(token));
  if (sensor == null) {
    return errorResponse(401, 'unauthorized', 'Invalid sensor credentials');
  }

  const bodyResult = await readJsonBody(request);
  if ('error' in bodyResult) {
    return bodyResult.error;
  }

  const parsed = ingestBatchSchema.safeParse(bodyResult.body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    }));
    return errorResponse(
      422,
      'invalid_payload',
      'Payload failed validation',
      issues,
    );
  }

  const rows = parsed.data.posts.map(mapPostToRows);
  const result = await persistBatch(supabase, sensor.id, rows);
  if (result == null) {
    return errorResponse(500, 'ingest_failed', 'Failed to persist the batch');
  }

  const { failed, ...counts } = result;
  return NextResponse.json(
    failed != null && failed.length > 0 ? { ...counts, failed } : counts,
    { status: 200 },
  );
}

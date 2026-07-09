import { NextResponse } from 'next/server';
import { authenticateSensor, persistBatch } from '@/features/ingestion/data';
import { hashSensorToken } from '@/features/ingestion/lib/hash-token';
import {
  buildSuccessBody,
  errorResponse,
  isJsonContentType,
  readJsonBody,
} from '@/features/ingestion/lib/http';
import { mapPostToRows } from '@/features/ingestion/lib/map-post-to-rows';
import { parseBearerToken } from '@/lib/http/bearer';
import { ingestBatchSchema } from '@/features/ingestion/lib/schema';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// node:crypto (token hashing) + the service_role key — must run on Node, not Edge.
export const runtime = 'nodejs';

/**
 * POST /api/ingest — the extension's batch upload endpoint (see
 * docs/ingestion-api-contract.md). Thin: authenticate the sensor, validate the
 * batch at the boundary, derive/route each post, then hand the batch to the atomic
 * `ingest_posts` RPC. All auth failures return a uniform 401; any unexpected throw
 * is caught and returned as the same 500 envelope (never Next's default surface).
 *
 * Rate limiting is intentionally NOT enforced here (the repo forbids Redis/queues) —
 * it belongs at the platform/WAF layer; 429 is reserved in the contract.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!isJsonContentType(request.headers.get('content-type'))) {
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
      const { status, code, message } = bodyResult.error;
      return errorResponse(status, code, message);
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

    return NextResponse.json(buildSuccessBody(result), { status: 200 });
  } catch (error) {
    // Unexpected throw (env/client init, connection reset, …) — keep the uniform
    // envelope instead of leaking Next's default error surface.
    console.error(
      '[ingestion] unhandled error:',
      error instanceof Error ? error.message : error,
    );
    return errorResponse(500, 'ingest_failed', 'Failed to persist the batch');
  }
}

import { NextResponse } from 'next/server';
import { deactivateSensor, resolveSensorId } from '@/features/ingestion/data';
import { hashSensorToken } from '@/features/ingestion/lib/hash-token';
import { errorResponse } from '@/features/ingestion/lib/http';
import { parseBearerToken } from '@/lib/http/bearer';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// node:crypto (token hashing) + the service_role key — must run on Node, not Edge.
export const runtime = 'nodejs';

/**
 * POST /api/sensor/opt-out — self-serve GDPR opt-out. Authenticates the sensor by its
 * bearer token, then sets it inactive (idempotent). Unlike /api/ingest, an already
 * inactive or never-consented sensor is accepted: a sensor must always be able to opt out.
 * After this call /api/ingest rejects the sensor (uniform 401) and its sightings no longer
 * count toward the dashboard aggregates. Every auth failure returns a uniform 401. No body.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const token = parseBearerToken(request.headers.get('authorization'));
    if (token == null) {
      return errorResponse(
        401,
        'unauthorized',
        'Missing or malformed bearer token',
      );
    }
    const supabase = createServerSupabaseClient();
    const sensorId = await resolveSensorId(supabase, hashSensorToken(token));
    if (sensorId == null) {
      return errorResponse(401, 'unauthorized', 'Invalid sensor credentials');
    }

    // true = opted out; false = unknown id (only reachable if the sensor was erased
    // between resolve and here). Both mean "the sensor is now inactive-or-gone", so answer
    // 200 idempotently; only an unexpected RPC error (null) is a 500.
    const result = await deactivateSensor(supabase, sensorId);
    if (result == null) {
      return errorResponse(500, 'server_error', 'Failed to opt out');
    }

    return NextResponse.json({ active: false }, { status: 200 });
  } catch (error) {
    console.error(
      '[ingestion] /sensor/opt-out unhandled error:',
      error instanceof Error ? error.message : error,
    );
    return errorResponse(500, 'server_error', 'Unexpected error');
  }
}

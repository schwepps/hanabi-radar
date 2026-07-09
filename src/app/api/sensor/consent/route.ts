import { NextResponse } from 'next/server';
import { recordConsent, resolveSensor } from '@/features/ingestion/data';
import { hashSensorToken } from '@/features/ingestion/lib/hash-token';
import { errorResponse } from '@/features/ingestion/lib/http';
import { parseBearerToken } from '@/features/ingestion/lib/parse-bearer';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// node:crypto (token hashing) + the service_role key — must run on Node, not Edge.
export const runtime = 'nodejs';

/**
 * POST /api/sensor/consent — record the sensor's GDPR consent server-side. Does NOT
 * require prior consent (this is what records it). Idempotent: if consent was already
 * recorded, the stored timestamp is returned unchanged. After this call, /api/ingest's
 * consent gate passes. Every auth failure returns a uniform 401. No request body.
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
    const sensor = await resolveSensor(supabase, hashSensorToken(token), {
      requireConsent: false,
    });
    if (sensor == null) {
      return errorResponse(401, 'unauthorized', 'Invalid sensor credentials');
    }

    const consentedAt = await recordConsent(supabase, sensor.id);
    if (consentedAt == null) {
      return errorResponse(500, 'server_error', 'Failed to record consent');
    }

    return NextResponse.json({ consented_at: consentedAt }, { status: 200 });
  } catch (error) {
    console.error(
      '[ingestion] /sensor/consent unhandled error:',
      error instanceof Error ? error.message : error,
    );
    return errorResponse(500, 'server_error', 'Unexpected error');
  }
}

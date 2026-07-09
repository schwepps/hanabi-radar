import { NextResponse } from 'next/server';
import { resolveSensor } from '@/features/ingestion/data';
import { hashSensorToken } from '@/features/ingestion/lib/hash-token';
import { errorResponse } from '@/features/ingestion/lib/http';
import { parseBearerToken } from '@/lib/http/bearer';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// node:crypto (token hashing) + the service_role key — must run on Node, not Edge.
export const runtime = 'nodejs';

/**
 * GET /api/sensor/me — validate the bearer token and read back the sensor's identity
 * and consent status. Does NOT require consent: the extension calls this during
 * onboarding, before consent is recorded, so an active-but-not-yet-consented sensor
 * validates OK (with `consented_at: null`). Every auth failure returns a uniform 401.
 * No request body.
 */
export async function GET(request: Request): Promise<NextResponse> {
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

    return NextResponse.json(
      {
        id: sensor.id,
        name: sensor.name,
        email: sensor.email,
        consented_at: sensor.consented_at,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error(
      '[ingestion] /sensor/me unhandled error:',
      error instanceof Error ? error.message : error,
    );
    return errorResponse(500, 'server_error', 'Unexpected error');
  }
}

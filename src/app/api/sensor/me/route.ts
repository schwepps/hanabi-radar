import { NextResponse } from 'next/server';
import {
  eraseSensor,
  resolveSensor,
  resolveSensorId,
} from '@/features/ingestion/data';
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

/**
 * DELETE /api/sensor/me — GDPR right to erasure. Authenticates the sensor by its bearer
 * token and deletes it: the sensor row plus its item_sources links (FK cascade). The
 * captured posts (items) are third-party content and are retained; affected dashboard
 * aggregates self-heal. Irreversible. Like opt-out, an already-inactive sensor may still
 * erase itself (no active/consent gate). Every auth failure returns a uniform 401. No body.
 */
export async function DELETE(request: Request): Promise<NextResponse> {
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

    // true = deleted; false = unknown id (only reachable if a concurrent DELETE already
    // erased it). Both mean "the sensor is gone", so answer 200 idempotently; only an
    // unexpected RPC error (null) is a 500.
    const result = await eraseSensor(supabase, sensorId);
    if (result == null) {
      return errorResponse(500, 'server_error', 'Failed to erase sensor');
    }

    return NextResponse.json({ erased: true }, { status: 200 });
  } catch (error) {
    console.error(
      '[ingestion] /sensor/me DELETE unhandled error:',
      error instanceof Error ? error.message : error,
    );
    return errorResponse(500, 'server_error', 'Unexpected error');
  }
}

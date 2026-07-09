import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/types/database';
import { gateSensor, type SensorRow } from './lib/gate-sensor';
import type { MappedPost } from './lib/map-post-to-rows';
import type { IngestSuccessBody } from './types';

export interface SensorIdentity {
  id: string;
}

/**
 * Resolve a sensor from its token hash and apply the shared gate. `requireConsent`
 * separates the post-write path (/api/ingest → true) from the onboarding paths
 * (/api/sensor/* → false, called BEFORE consent is recorded). Returns the sensor row
 * when allowed, else `null` for EVERY failure (unknown / inactive / — when required —
 * not consented), so the caller answers with a uniform 401; the reason is logged
 * server-side only.
 *
 * Runs on the service_role client (`sensors` is service_role-only): a single indexed
 * equality lookup on the unique `token_hash`, never a full-table scan-and-compare.
 */
export async function resolveSensor(
  supabase: SupabaseClient<Database>,
  tokenHash: string,
  options: { requireConsent: boolean },
): Promise<SensorRow | null> {
  const { data, error } = await supabase
    .from('sensors')
    .select('id, name, email, active, consented_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error != null) {
    console.error('[ingestion] resolveSensor failed:', error.message);
    return null;
  }
  const gate = gateSensor(data, options);
  if (!gate.ok) {
    if (gate.reason !== 'unknown') {
      console.error(`[ingestion] rejected sensor (${gate.reason})`);
    }
    return null;
  }
  return gate.sensor;
}

/** Ingest-path auth: requires a valid, active, CONSENTED sensor. */
export async function authenticateSensor(
  supabase: SupabaseClient<Database>,
  tokenHash: string,
): Promise<SensorIdentity | null> {
  const sensor = await resolveSensor(supabase, tokenHash, {
    requireConsent: true,
  });
  return sensor == null ? null : { id: sensor.id };
}

/**
 * Record a sensor's consent, idempotently (DB-authoritative via the RPC: sets
 * `consented_at` to now() only the first time). Returns the effective consent
 * timestamp, or `null` on failure.
 */
export async function recordConsent(
  supabase: SupabaseClient<Database>,
  sensorId: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc('record_sensor_consent', {
    p_sensor_id: sensorId,
  });
  if (error != null) {
    console.error('[ingestion] recordConsent failed:', error.message);
    return null;
  }
  if (typeof data !== 'string') {
    console.error('[ingestion] recordConsent returned no timestamp');
    return null;
  }
  return data;
}

/** Runtime shape check for the RPC result. The DB hands back `Json`, so validate the
 * fields we depend on rather than trusting a blind cast — a clean 500 beats a
 * `result.failed.length` throw if the function's return ever drifts. */
function isIngestResult(value: unknown): value is IngestSuccessBody {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const v = value as Record<string, unknown>;
  return (
    typeof v.received === 'number' &&
    typeof v.new_items === 'number' &&
    typeof v.known_items === 'number' &&
    (v.failed == null || Array.isArray(v.failed))
  );
}

/**
 * Persist a mapped batch atomically via the `ingest_posts` RPC (one transaction,
 * per-post savepoints, dedup + seen_count handled in the DB). Returns `null` on an
 * unexpected RPC failure or malformed result so the caller responds 500.
 */
export async function persistBatch(
  supabase: SupabaseClient<Database>,
  sensorId: string,
  posts: MappedPost[],
): Promise<IngestSuccessBody | null> {
  const { data, error } = await supabase.rpc('ingest_posts', {
    p_sensor_id: sensorId,
    // MappedPost[] is JSON-serializable, but an interface never structurally
    // satisfies the recursive `Json` index-signature type — the cast is unavoidable.
    p_posts: posts as unknown as Json,
  });

  if (error != null) {
    console.error('[ingestion] persistBatch failed:', error.message);
    return null;
  }
  if (!isIngestResult(data)) {
    console.error('[ingestion] persistBatch returned an unexpected shape');
    return null;
  }
  return data;
}

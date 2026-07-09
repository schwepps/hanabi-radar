import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/types/database';
import type { MappedPost } from './lib/map-post-to-rows';
import type { IngestSuccessBody } from './types';

export interface SensorIdentity {
  id: string;
}

/**
 * Resolve a sensor from its token hash and enforce the ingestion gate. Returns
 * `null` for EVERY failure mode — unknown token, deactivated sensor, or a sensor
 * without recorded consent — so the caller answers with a uniform 401 (no
 * enumeration of which token exists). The distinction is logged server-side only.
 *
 * Runs on the service_role client: `sensors` is service_role-only, and this is a
 * single indexed equality lookup on the unique `token_hash` — never a full-table
 * scan-and-compare (which would be a timing leak).
 */
export async function authenticateSensor(
  supabase: SupabaseClient<Database>,
  tokenHash: string,
): Promise<SensorIdentity | null> {
  const { data, error } = await supabase
    .from('sensors')
    .select('id, active, consented_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error != null) {
    console.error('[ingestion] authenticateSensor failed:', error.message);
    return null;
  }
  if (data == null) {
    return null; // unknown token
  }
  if (!data.active) {
    console.error('[ingestion] rejected inactive sensor:', data.id);
    return null;
  }
  if (data.consented_at == null) {
    console.error(
      '[ingestion] rejected sensor without recorded consent:',
      data.id,
    );
    return null;
  }
  return { id: data.id };
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

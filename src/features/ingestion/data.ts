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
 * Runs on the service_role client: `sensors` is service_role-only (RLS-forced
 * elsewhere), and this is a single indexed equality lookup on the unique
 * `token_hash` — never a full-table scan-and-compare (which would be a timing leak).
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
    console.error('[ingest] authenticateSensor failed:', error.message);
    return null;
  }
  if (data == null) {
    return null; // unknown token
  }
  if (!data.active) {
    console.error('[ingest] rejected inactive sensor:', data.id);
    return null;
  }
  if (data.consented_at == null) {
    console.error(
      '[ingest] rejected sensor without recorded consent:',
      data.id,
    );
    return null;
  }
  return { id: data.id };
}

/**
 * Persist a mapped batch atomically via the `ingest_posts` RPC (one transaction,
 * per-post savepoints, dedup + seen_count handled in the DB). Returns `null` on an
 * unexpected RPC failure so the caller responds 500. Deduplication and aggregate
 * maintenance are the DB's job — this layer only ships the batch and reads back the
 * summary.
 */
export async function persistBatch(
  supabase: SupabaseClient<Database>,
  sensorId: string,
  posts: MappedPost[],
): Promise<IngestSuccessBody | null> {
  const { data, error } = await supabase.rpc('ingest_posts', {
    p_sensor_id: sensorId,
    p_posts: posts as unknown as Json,
  });

  if (error != null || data == null) {
    if (error != null) {
      console.error('[ingest] persistBatch failed:', error.message);
    }
    return null;
  }

  return data as unknown as IngestSuccessBody;
}

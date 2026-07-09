import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { isPermanentFailure } from './lib/classify-item';
import { MAX_CLASSIFY_ATTEMPTS } from './lib/model-config';
import type {
  ClassificationUpdate,
  ClassifyFailure,
  PendingItem,
  PersistOutcome,
} from './types';

/** The classifier's input projection (kept in sync with `PendingItem`). */
const PENDING_COLUMNS =
  'id, text, post_type, media_title, hashtags, author_type, author_name, author_company, author_title, is_repost, original_author_name';

/**
 * Pull unclassified items (`stream IS NULL`), oldest-captured first so the backlog
 * drains FIFO. Uses the injected service_role client (bypasses RLS — the designated
 * classification accessor).
 *
 * THROWS on a DB error rather than degrading to `[]`: a background worker that
 * silently returned `[]` on an outage would report a healthy `picked=0` to the cron
 * while the backlog grows unseen. Propagating the error makes the endpoint 500 so
 * the failure is observable.
 */
export async function fetchPendingItems(
  supabase: SupabaseClient<Database>,
  limit: number,
): Promise<PendingItem[]> {
  const { data, error } = await supabase
    .from('items')
    .select(PENDING_COLUMNS)
    .is('stream', null)
    // Exclude parked (poison) items so they can't block the FIFO queue.
    .lt('classification_attempts', MAX_CLASSIFY_ATTEMPTS)
    .order('captured_at', { ascending: true })
    .limit(limit);

  if (error != null) {
    console.error('[classification] fetchPendingItems failed:', error.message);
    throw new Error(`fetchPendingItems failed: ${error.message}`);
  }
  return (data ?? []) as PendingItem[];
}

/**
 * Write one item's classification. The `.is('stream', null)` guard is the
 * idempotency/concurrency lock: it only writes a row still pending. `.select('id')`
 * makes the number of matched rows observable, so a raced write (0 rows — another
 * tick already classified the item) is reported as `skipped`, not a phantom success.
 */
export async function persistClassification(
  supabase: SupabaseClient<Database>,
  itemId: string,
  update: ClassificationUpdate,
): Promise<PersistOutcome> {
  const { data, error } = await supabase
    .from('items')
    .update(update)
    .eq('id', itemId)
    .is('stream', null)
    .select('id');

  if (error != null) {
    console.error(
      `[classification] persistClassification failed for ${itemId}:`,
      error.message,
    );
    return 'error';
  }
  return data != null && data.length > 0 ? 'written' : 'skipped';
}

/**
 * Record a classification failure on a still-pending item via the atomic RPC:
 * permanent failures are parked at the cap immediately; transient ones increment
 * (capped). Best-effort — logs and returns on RPC error (the item simply stays
 * pending and is retried next tick).
 */
export async function recordClassificationFailure(
  supabase: SupabaseClient<Database>,
  itemId: string,
  failure: ClassifyFailure,
): Promise<void> {
  const { error } = await supabase.rpc('record_classification_failure', {
    p_item_id: itemId,
    p_error: failure,
    p_permanent: isPermanentFailure(failure),
    p_max_attempts: MAX_CLASSIFY_ATTEMPTS,
  });
  if (error != null) {
    console.error(
      `[classification] recordClassificationFailure failed for ${itemId}:`,
      error.message,
    );
  }
}

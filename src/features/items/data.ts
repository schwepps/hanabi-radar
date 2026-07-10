import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { deriveListItem } from './lib/derive';
import type { ListItem } from './types';

/**
 * Fetch the shared item feed for the dashboard. Reads only the `items` table
 * (all columns there are non-sensitive by design — the table holds NO per-sensor
 * data); never touches `item_sources`, so the holder identity cannot leak into
 * the list payload. Filtering/sorting run client-side over this set for the
 * reference screen; production would push them server-side for scale.
 *
 * Takes an injected, RLS-enforced client (the caller's authenticated cookie
 * client — FSC-93) so the partner `items` policy decides visibility: a partner
 * gets the feed, a non-partner gets an empty result.
 */
export async function fetchListItems(
  supabase: SupabaseClient<Database>,
): Promise<ListItem[]> {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .in('stream', ['signal', 'opportunity', 'trend'])
    .neq('status', 'dismissed')
    // Hide orphaned items: a post whose only sensors have opted out or been erased
    // self-heals to seen_count=0 (FSC-95) — no participating source vouches for it.
    // deriveListItem mirrors this so a live opt-out drops the card from the feed too.
    .gt('seen_count', 0)
    .order('posted_at', { ascending: false, nullsFirst: false })
    // Keep null-posted_at rows ordered by recency (captured_at), matching the
    // ageDays derivation which falls back to captured_at.
    .order('captured_at', { ascending: false, nullsFirst: false });

  if (error != null || data == null) {
    // Don't swallow silently: log server-side and degrade to an empty list.
    if (error != null) {
      console.error('[items] fetchListItems failed:', error.message);
    }
    return [];
  }

  // One reference time for the whole feed (consistent ages, single allocation).
  const now = new Date();
  return data
    .map((row) => deriveListItem(row, now))
    .filter((item): item is ListItem => item !== null);
}

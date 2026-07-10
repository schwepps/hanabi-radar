'use server';

import { createServerSupabaseAuthClient } from '@/lib/supabase/server-auth';
import type { Enums } from '@/types/database';
import { fetchListItems } from './data';
import { revealItemIdSchema, toRevealPaths } from './lib/reveal';
import type { ListItem, RevealResponse } from './types';

/** Consistent action result: `{}` on success, `{ error }` on failure. */
interface ActionResult {
  error?: string;
}

/**
 * Persist an item's status as the signed-in partner (RLS-enforced anon client, NOT
 * service_role). The FSC-103 `items_update_status_partner` policy gates the write
 * to active partners and the column grant limits it to `status`. Status is a single
 * shared column, so a processed/dismissed action is collective — visible to every
 * partner and durable across sessions.
 */
async function setStatus(
  id: string,
  status: Enums<'status'>,
): Promise<ActionResult> {
  if (typeof id !== 'string' || id.trim() === '') {
    return { error: 'Identifiant invalide.' };
  }

  const supabase = await createServerSupabaseAuthClient();
  const { data, error } = await supabase
    .from('items')
    .update({ status })
    .eq('id', id)
    .select('id');

  if (error != null) {
    console.error('[items] setStatus failed:', error.message);
    return { error: 'La mise à jour a échoué.' };
  }
  // An RLS USING filter (a non-displayed row) or an unknown id updates 0 rows and
  // still returns no error — surface that as a failure so the optimistic UI rolls
  // back instead of silently diverging from the persisted status.
  if (data == null || data.length === 0) {
    return { error: 'La mise à jour a échoué.' };
  }
  return {};
}

/** Mark an item dismissed (hidden from the shared feed). */
export async function dismissItem(id: string): Promise<ActionResult> {
  return setStatus(id, 'dismissed');
}

/** Toggle an item's processed flag (persisted as `processed` / back to `new`). */
export async function setItemProcessed(
  id: string,
  processed: boolean,
): Promise<ActionResult> {
  return setStatus(id, processed ? 'processed' : 'new');
}

/**
 * Current dashboard feed for the signed-in partner (RLS-enforced). Used as a
 * one-shot catch-up after the realtime channel subscribes, to fold in any
 * classification that landed during the seed→subscribe gap (postgres_changes has
 * no replay). Returns [] on error — a resync failure must never break the feed.
 */
export async function getCurrentItems(): Promise<ListItem[]> {
  const supabase = await createServerSupabaseAuthClient();
  return fetchListItems(supabase);
}

/**
 * FSC-106 warm-intro reveal for one item, as the signed-in partner (RLS/authz anon
 * client, NEVER service_role). Calls the `reveal_item_sources` RPC, which returns rows
 * only for an active partner and an empty set for anyone else. Unlike `setStatus`, an
 * empty result is a VALID "no warm path" — not a failure. The sensitive payload is
 * fetched on demand here and never enters the list/realtime feed.
 */
export async function revealWarmPath(itemId: string): Promise<RevealResponse> {
  const parsed = revealItemIdSchema.safeParse(itemId);
  if (!parsed.success) {
    return { ok: false, error: 'Identifiant invalide.' };
  }

  const supabase = await createServerSupabaseAuthClient();
  const { data, error } = await supabase.rpc('reveal_item_sources', {
    p_item_id: parsed.data,
  });

  if (error != null) {
    console.error('[items] revealWarmPath failed:', error.message);
    return { ok: false, error: 'La révélation a échoué.' };
  }
  return { ok: true, paths: toRevealPaths(data ?? []) };
}

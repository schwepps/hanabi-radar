'use client';

import { useEffect } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { Tables } from '@/types/database';

/**
 * Subscribe to live `items` changes for the signed-in partner and forward each
 * changed row to `onChange`. This wires the last acceptance criterion of FSC-103:
 * a newly classified item (the classification worker sets `stream` on a
 * status='new' row) reaches the open dashboard without a page reload.
 *
 * Scope — UPDATE only. Ingestion INSERTs are always `stream=null` (nothing to
 * show); the classification transition (`null → stream`) and partner status
 * writes are all UPDATEs, so UPDATE is the smallest event set that satisfies the
 * AC. No server-side `filter`: a `postgres_changes` filter on a non-identity
 * column (e.g. `stream`) never matches UPDATE events under the default replica
 * identity (only the PK is in the old tuple), so it would silently drop every
 * classification. We gate client-side instead — `deriveListItem` (via
 * `applyFeedChange`) returns null for noise / unclassified / dismissed rows, so
 * the extra traffic is filtered where the row data is actually available.
 *
 * `onSubscribed` (optional) fires once the channel reaches SUBSCRIBED — including
 * after a reconnect — so the caller can run a catch-up refetch for changes missed
 * during the seed→subscribe (or reconnect) gap.
 *
 * `onChange`/`onSubscribed` must be referentially stable (wrap in `useCallback`) —
 * the effect resubscribes whenever they change.
 */
export function useRealtimeItems(
  onChange: (row: Tables<'items'>) => void,
  onSubscribed?: () => void,
): void {
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    // Hydrate the cookie session and hand its JWT to Realtime BEFORE subscribing.
    // Subscribing first can join the socket as `anon`, where is_partner() is false
    // and RLS silently drops every event — a no-op feature with no error. The
    // `cancelled` guard also makes the async path StrictMode/unmount-safe.
    void supabase.auth.getSession().then(async ({ data: { session } }) => {
      const token = session?.access_token;
      // No session (logged out / expired cookies / non-partner): don't open a
      // socket whose events RLS would only drop — nothing to deliver.
      if (cancelled || token == null) {
        return;
      }
      await supabase.realtime.setAuth(token);
      if (cancelled) {
        return;
      }
      channel = supabase
        .channel('items-feed')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'items' },
          (payload) => onChange(payload.new as Tables<'items'>),
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED' && !cancelled) {
            onSubscribed?.();
          }
        });
    });

    return () => {
      cancelled = true;
      if (channel != null) {
        void supabase.removeChannel(channel);
      }
    };
  }, [onChange, onSubscribed]);
}

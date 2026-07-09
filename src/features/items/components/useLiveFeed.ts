'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Tables } from '@/types/database';
import {
  dismissItem as dismissItemAction,
  getCurrentItems,
  setItemProcessed as setItemProcessedAction,
} from '../actions';
import {
  applyFeedChange,
  dropArrivals,
  mergeItems,
  removeItem,
  restoreItem,
  setProcessed,
} from '../lib/live';
import type { Feed } from '../lib/live';
import type { ListItem } from '../types';
import { useRealtimeItems } from './useRealtimeItems';

export interface LiveFeed {
  /** The live item list — initial fetch merged with realtime changes. */
  items: ListItem[];
  /** Ids that arrived live since the banner was last dismissed. */
  arrivals: string[];
  /** Optimistically dismiss an item and persist it (rolls back on failure). */
  dismiss: (id: string) => void;
  /** Optimistically toggle processed and persist it (rolls back on failure). */
  toggleProcessed: (id: string) => void;
  /** Clear the given arrival ids — the banner "masquer", scoped to what it showed. */
  clearArrivals: (ids: string[]) => void;
}

/**
 * Owns the dashboard's live item feed: seeds from the server fetch, folds in
 * Supabase Realtime `items` changes, and persists the partner's status actions.
 *
 * `items.status` is the single source of truth for processed/dismissed — writes
 * are optimistic (instant UI) then persisted via the RLS Server Actions, and the
 * realtime echo reconciles other partners' sessions. All feed mutations go through
 * the pure, unit-tested helpers in `lib/live.ts` so the optimistic + rollback paths
 * share one insertion discipline (and can't diverge into duplicate rows). Kept out
 * of the interaction reducer (which stays pure view-intent) so server-cache and
 * UI-intent don't mix.
 */
export function useLiveFeed(initialItems: ListItem[]): LiveFeed {
  const [feed, setFeed] = useState<Feed>(() => ({
    items: initialItems,
    arrivals: [],
  }));
  // Mirror the feed into a ref so the stable (deps-free) callbacks can read the
  // latest items. Synced in an effect (post-commit) — handlers run after commit,
  // so they always see the current feed.
  const feedRef = useRef(feed);
  useEffect(() => {
    feedRef.current = feed;
  }, [feed]);

  const onRealtimeChange = useCallback((row: Tables<'items'>) => {
    setFeed((prev) => applyFeedChange(prev, row));
  }, []);
  // Catch-up: once the channel is live, fold any classification that landed during
  // the seed→subscribe (or reconnect) gap. Add-only, so it never clobbers a pending
  // optimistic write or a row realtime already maintains.
  const onSubscribed = useCallback(() => {
    void getCurrentItems()
      .then((items) => setFeed((prev) => mergeItems(prev, items)))
      .catch(() => {});
  }, []);
  useRealtimeItems(onRealtimeChange, onSubscribed);

  // Optimistic write: persist, and roll back on ANY failure — a resolved `{ error }`
  // (RLS deny / DB error) OR a rejected promise (offline / 500 / serialization).
  const persist = useCallback(
    (run: () => Promise<{ error?: string }>, rollback: () => void) => {
      run()
        .then((result) => {
          if (result?.error != null) {
            rollback();
          }
        })
        .catch(rollback);
    },
    [],
  );

  const dismiss = useCallback(
    (id: string) => {
      const removed = feedRef.current.items.find((item) => item.id === id);
      if (removed == null) {
        return;
      }
      setFeed((prev) => removeItem(prev, id));
      persist(
        () => dismissItemAction(id),
        () => setFeed((prev) => restoreItem(prev, removed)),
      );
    },
    [persist],
  );

  const toggleProcessed = useCallback(
    (id: string) => {
      const current = feedRef.current.items.find((item) => item.id === id);
      if (current == null) {
        return;
      }
      const next = !current.isProcessed;
      setFeed((prev) => setProcessed(prev, id, next));
      persist(
        () => setItemProcessedAction(id, next),
        () => setFeed((prev) => setProcessed(prev, id, !next)),
      );
    },
    [persist],
  );

  const clearArrivals = useCallback((ids: string[]) => {
    setFeed((prev) => dropArrivals(prev, ids));
  }, []);

  return useMemo(
    () => ({
      items: feed.items,
      arrivals: feed.arrivals,
      dismiss,
      toggleProcessed,
      clearArrivals,
    }),
    [feed.items, feed.arrivals, dismiss, toggleProcessed, clearArrivals],
  );
}

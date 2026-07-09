import type { Tables } from '@/types/database';
import { deriveListItem } from './derive';
import type { ListItem } from '../types';

/**
 * The live feed the container holds: the visible item list plus the ids that
 * arrived via Realtime since the banner was last dismissed (what the arrival
 * banner counts). `arrivals` is always a subset of `items` — an item removed from
 * the list is also dropped from `arrivals`.
 */
export interface Feed {
  items: ListItem[];
  arrivals: string[];
}

/**
 * Fold a single Realtime `items` row change into the feed. Pure (same input →
 * same output) so it is unit-testable without a browser or a subscription.
 *
 * Derivation decides visibility: a row that is noise, unclassified, or dismissed
 * drops out — removed if it was present, ignored otherwise. A shown row is
 * upserted by id (replace in place, else prepend) and, when it is new to the feed,
 * recorded as an arrival so the banner can announce it. Idempotent under
 * at-least-once redelivery: re-applying the same row is a no-op past the first
 * (the second delivery takes the "replace" branch and adds no arrival).
 */
export function applyFeedChange(
  feed: Feed,
  row: Tables<'items'>,
  now?: Date,
): Feed {
  const item = deriveListItem(row, now);
  const exists = feed.items.some((i) => i.id === row.id);

  if (item === null) {
    if (!exists) {
      return feed;
    }
    return {
      items: feed.items.filter((i) => i.id !== row.id),
      arrivals: feed.arrivals.filter((id) => id !== row.id),
    };
  }

  if (exists) {
    return {
      items: feed.items.map((i) => (i.id === item.id ? item : i)),
      arrivals: feed.arrivals,
    };
  }

  return {
    items: [item, ...feed.items],
    arrivals: [...feed.arrivals, item.id],
  };
}

/** Remove an item (and any arrival marker) by id — optimistic dismiss. */
export function removeItem(feed: Feed, id: string): Feed {
  if (!feed.items.some((i) => i.id === id)) {
    return feed;
  }
  return {
    items: feed.items.filter((i) => i.id !== id),
    arrivals: feed.arrivals.filter((arrivalId) => arrivalId !== id),
  };
}

/**
 * Re-insert an item, id-safe: a no-op if the id is already present. Mirrors
 * `applyFeedChange`'s upsert discipline so an optimistic-dismiss rollback can't
 * duplicate a row that a concurrent realtime echo already restored.
 */
export function restoreItem(feed: Feed, item: ListItem): Feed {
  if (feed.items.some((i) => i.id === item.id)) {
    return feed;
  }
  return { ...feed, items: [item, ...feed.items] };
}

/** Set an item's processed flag — optimistic toggle and its rollback. */
export function setProcessed(feed: Feed, id: string, value: boolean): Feed {
  return {
    ...feed,
    items: feed.items.map((i) =>
      i.id === id ? { ...i, isProcessed: value } : i,
    ),
  };
}

/** Drop the given ids from the arrival set — the banner "masquer", scoped to the
 *  arrivals it actually announced (visible under the current tab/filters). */
export function dropArrivals(feed: Feed, ids: string[]): Feed {
  if (ids.length === 0) {
    return feed;
  }
  const drop = new Set(ids);
  return { ...feed, arrivals: feed.arrivals.filter((id) => !drop.has(id)) };
}

/**
 * Add-only merge of a fresh server snapshot: inserts items missing from the feed
 * (catch-up for classifications that landed during the seed→subscribe gap) without
 * touching existing rows — realtime keeps those fresh and this must not clobber a
 * pending optimistic write — and without recording arrivals.
 */
export function mergeItems(feed: Feed, items: ListItem[]): Feed {
  const known = new Set(feed.items.map((i) => i.id));
  const additions = items.filter((i) => !known.has(i.id));
  if (additions.length === 0) {
    return feed;
  }
  return { ...feed, items: [...additions, ...feed.items] };
}

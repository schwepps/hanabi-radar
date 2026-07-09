import { describe, expect, it } from 'vitest';
import type { Feed } from './live';
import {
  applyFeedChange,
  dropArrivals,
  mergeItems,
  removeItem,
  restoreItem,
  setProcessed,
} from './live';
import { makeItemRow, makeListItem } from './fixtures';

const NOW = new Date('2026-07-08T12:00:00.000Z');
const EMPTY: Feed = { items: [], arrivals: [] };

describe('applyFeedChange', () => {
  it('adds a newly classified row and records it as an arrival', () => {
    const next = applyFeedChange(
      EMPTY,
      makeItemRow({ id: 'a', stream: 'signal', status: 'new' }),
      NOW,
    );
    expect(next.items.map((i) => i.id)).toEqual(['a']);
    expect(next.arrivals).toEqual(['a']);
  });

  it('upserts an existing item without recording a new arrival', () => {
    const feed: Feed = {
      items: [makeListItem({ id: 'a', seen: 1 })],
      arrivals: [],
    };
    const next = applyFeedChange(
      feed,
      makeItemRow({ id: 'a', stream: 'opportunity', seen_count: 5 }),
      NOW,
    );
    expect(next.items).toHaveLength(1);
    expect(next.items[0].seen).toBe(5); // replaced in place
    expect(next.arrivals).toEqual([]); // not a new arrival
  });

  it('removes a shown item when it becomes dismissed', () => {
    const feed: Feed = {
      items: [makeListItem({ id: 'a' }), makeListItem({ id: 'b' })],
      arrivals: ['a'],
    };
    const next = applyFeedChange(
      feed,
      makeItemRow({ id: 'a', stream: 'signal', status: 'dismissed' }),
      NOW,
    );
    expect(next.items.map((i) => i.id)).toEqual(['b']);
    expect(next.arrivals).toEqual([]); // dropped from arrivals too
  });

  it('removes a shown item when it is re-classified to noise', () => {
    const feed: Feed = { items: [makeListItem({ id: 'a' })], arrivals: [] };
    const next = applyFeedChange(
      feed,
      makeItemRow({ id: 'a', stream: 'noise' }),
      NOW,
    );
    expect(next.items).toEqual([]);
  });

  it('is a no-op for a hidden row that was never shown', () => {
    const row = makeItemRow({ id: 'z', stream: null });
    const next = applyFeedChange(EMPTY, row, NOW);
    expect(next).toBe(EMPTY); // same reference — no allocation
  });

  it('is idempotent under redelivery of the same arrival', () => {
    const row = makeItemRow({ id: 'a', stream: 'signal', status: 'new' });
    const once = applyFeedChange(EMPTY, row, NOW);
    const twice = applyFeedChange(once, row, NOW);
    expect(twice.items.map((i) => i.id)).toEqual(['a']);
    expect(twice.arrivals).toEqual(['a']); // still one arrival, not two
  });
});

describe('removeItem', () => {
  it('removes the item and its arrival marker', () => {
    const feed: Feed = {
      items: [makeListItem({ id: 'a' }), makeListItem({ id: 'b' })],
      arrivals: ['a'],
    };
    const next = removeItem(feed, 'a');
    expect(next.items.map((i) => i.id)).toEqual(['b']);
    expect(next.arrivals).toEqual([]);
  });

  it('is a no-op (same reference) for an unknown id', () => {
    const feed: Feed = { items: [makeListItem({ id: 'a' })], arrivals: [] };
    expect(removeItem(feed, 'zzz')).toBe(feed);
  });
});

describe('restoreItem (id-safe rollback)', () => {
  it('re-inserts a removed item', () => {
    const feed: Feed = { items: [makeListItem({ id: 'b' })], arrivals: [] };
    const next = restoreItem(feed, makeListItem({ id: 'a' }));
    expect(next.items.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('does NOT duplicate when the id is already present (concurrent echo)', () => {
    const feed: Feed = { items: [makeListItem({ id: 'a' })], arrivals: [] };
    const next = restoreItem(feed, makeListItem({ id: 'a' }));
    expect(next).toBe(feed); // no-op, no duplicate id
    expect(next.items.map((i) => i.id)).toEqual(['a']);
  });
});

describe('setProcessed', () => {
  it('flips the processed flag on the matching item only', () => {
    const feed: Feed = {
      items: [
        makeListItem({ id: 'a', isProcessed: false }),
        makeListItem({ id: 'b', isProcessed: false }),
      ],
      arrivals: [],
    };
    const next = setProcessed(feed, 'a', true);
    expect(next.items.find((i) => i.id === 'a')?.isProcessed).toBe(true);
    expect(next.items.find((i) => i.id === 'b')?.isProcessed).toBe(false);
  });
});

describe('dropArrivals', () => {
  it('drops only the given ids, keeping others (cross-tab arrivals survive)', () => {
    const feed: Feed = { items: [], arrivals: ['a', 'b', 'c'] };
    expect(dropArrivals(feed, ['a', 'c']).arrivals).toEqual(['b']);
  });

  it('is a no-op (same reference) for an empty id list', () => {
    const feed: Feed = { items: [], arrivals: ['a'] };
    expect(dropArrivals(feed, [])).toBe(feed);
  });
});

describe('mergeItems (add-only catch-up)', () => {
  it('adds only items missing from the feed, without arrivals', () => {
    const feed: Feed = { items: [makeListItem({ id: 'a' })], arrivals: [] };
    const next = mergeItems(feed, [
      makeListItem({ id: 'a', summary: 'stale' }), // already present — not touched
      makeListItem({ id: 'b' }), // missed during the gap — added
    ]);
    expect(next.items.map((i) => i.id).sort()).toEqual(['a', 'b']);
    expect(next.items.find((i) => i.id === 'a')?.summary).toBe(
      'Résumé de test',
    );
    expect(next.arrivals).toEqual([]); // catch-up never announces
  });

  it('is a no-op (same reference) when nothing is missing', () => {
    const feed: Feed = { items: [makeListItem({ id: 'a' })], arrivals: [] };
    expect(mergeItems(feed, [makeListItem({ id: 'a' })])).toBe(feed);
  });
});

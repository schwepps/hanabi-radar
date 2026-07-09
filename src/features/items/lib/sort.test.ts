import { describe, expect, it } from 'vitest';
import { heatScore, pathScore, reachScore, sortItems } from './sort';
import { makeListItem } from './fixtures';

describe('pathScore / heatScore', () => {
  it('maps every degree, none = 0', () => {
    expect(pathScore('first')).toBe(3);
    expect(pathScore('second')).toBe(2);
    expect(pathScore('third')).toBe(1);
    expect(pathScore('none')).toBe(0);
  });

  it('maps every heat, null = 0', () => {
    expect(heatScore('hot')).toBe(3);
    expect(heatScore('warm')).toBe(2);
    expect(heatScore('cold')).toBe(1);
    expect(heatScore(null)).toBe(0);
  });
});

describe('reachScore', () => {
  it('combines path (×10) and heat', () => {
    expect(reachScore({ path: 'first', heat: 'hot' })).toBe(33);
    expect(reachScore({ path: 'first', heat: 'cold' })).toBe(31);
    expect(reachScore({ path: 'second', heat: 'hot' })).toBe(23);
  });

  it('treats no-path + no-heat as a valid 0 (not dropped)', () => {
    expect(reachScore({ path: 'none', heat: null })).toBe(0);
    expect(reachScore({ path: 'none', heat: 'cold' })).toBe(1);
  });
});

describe('sortItems', () => {
  it('reachability: descending reachScore', () => {
    const items = [
      makeListItem({ id: 'a', path: 'none', heat: null }), // 0
      makeListItem({ id: 'b', path: 'first', heat: 'hot' }), // 33
      makeListItem({ id: 'c', path: 'second', heat: 'hot' }), // 23
      makeListItem({ id: 'd', path: 'none', heat: 'cold' }), // 1
    ];
    expect(sortItems(items, 'reachability').map((i) => i.id)).toEqual([
      'b',
      'c',
      'd',
      'a',
    ]);
  });

  it('date: ascending ageDays, today (0) first', () => {
    const items = [
      makeListItem({ id: 'a', ageDays: 5 }),
      makeListItem({ id: 'b', ageDays: 0 }),
      makeListItem({ id: 'c', ageDays: 2 }),
    ];
    expect(sortItems(items, 'date').map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('is stable for equal keys and does not mutate the input', () => {
    const items = [
      makeListItem({ id: 'x', ageDays: 1 }),
      makeListItem({ id: 'y', ageDays: 1 }),
      makeListItem({ id: 'z', ageDays: 1 }),
    ];
    const before = items.map((i) => i.id);
    expect(sortItems(items, 'date').map((i) => i.id)).toEqual(['x', 'y', 'z']);
    expect(items.map((i) => i.id)).toEqual(before);
  });
});

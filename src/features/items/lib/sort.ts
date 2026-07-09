import type { Degree, Heat, ListItem, SortKey } from '../types';

/**
 * Reachability ranking: items with a closer warm path rank highest; heat breaks
 * ties. `reachScore = pathScore * 10 + heatScore`. A score of 0 (no path, no
 * heat) is valid — the item is kept and sorted, never dropped.
 */

const PATH_SCORE: Record<Degree, number> = {
  first: 3,
  second: 2,
  third: 1,
  none: 0,
};

const HEAT_SCORE: Record<Heat, number> = {
  hot: 3,
  warm: 2,
  cold: 1,
};

export function pathScore(degree: Degree): number {
  return PATH_SCORE[degree];
}

export function heatScore(heat: Heat | null): number {
  return heat == null ? 0 : HEAT_SCORE[heat];
}

export function reachScore(item: Pick<ListItem, 'path' | 'heat'>): number {
  return pathScore(item.path) * 10 + heatScore(item.heat);
}

/**
 * Return a new, sorted array (input is never mutated). Both orders rely on
 * `Array.prototype.sort` being stable (guaranteed in Node's V8), so equal keys
 * preserve input order.
 */
export function sortItems(items: ListItem[], sort: SortKey): ListItem[] {
  const copy = [...items];
  if (sort === 'date') {
    // Ascending age = newest first; ageDays === 0 (today) sorts first.
    return copy.sort((a, b) => a.ageDays - b.ageDays);
  }
  return copy.sort((a, b) => reachScore(b) - reachScore(a));
}

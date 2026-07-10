import { z } from 'zod';
import type { Degree, RevealPath } from '../types';
import { initials } from './presentation';
import { pathScore } from './sort';

/**
 * Pure logic for the FSC-106 warm-intro reveal: validate the requested item id, order
 * the RPC rows strongest-first, and map them to the view-model. Kept out of the
 * `'use server'` action (which can only export async functions) so it is unit-testable.
 */

/** The reveal action accepts a single item id — must be a uuid. */
export const revealItemIdSchema = z.uuid();

/**
 * A row returned by the `reveal_item_sources` RPC. `social_proof` is nullable at runtime
 * (the server suppresses the note when a 1st-degree member exists, and the column itself
 * is nullable) even though `supabase gen types` widens a RETURNS TABLE text column to
 * non-null.
 */
export interface RevealRow {
  sensor_name: string;
  author_degree: Degree;
  social_proof: string | null;
  seen_at: string;
}

/**
 * Order reveal rows strongest-first — mirrors the SQL `ORDER BY` defensively (PostgREST
 * does not contractually preserve a function's internal ordering across transport): by
 * connection strength (first > second > third > none), then most-recently-seen, then
 * name. Returns a new array; never mutates the input.
 */
export function sortRevealRows(rows: readonly RevealRow[]): RevealRow[] {
  return [...rows].sort(
    (a, b) =>
      pathScore(b.author_degree) - pathScore(a.author_degree) ||
      b.seen_at.localeCompare(a.seen_at) ||
      a.sensor_name.localeCompare(b.sensor_name),
  );
}

/** Map one reveal row to the view-model path (initials derived here from the name). */
export function toRevealPath(row: RevealRow): RevealPath {
  return {
    holderName: row.sensor_name,
    holderInitials: initials(row.sensor_name),
    degree: row.author_degree,
    socialProof: row.social_proof,
    seenAt: row.seen_at,
  };
}

/** Sort strongest-first, then map to view-model paths. */
export function toRevealPaths(rows: readonly RevealRow[]): RevealPath[] {
  return sortRevealRows(rows).map(toRevealPath);
}

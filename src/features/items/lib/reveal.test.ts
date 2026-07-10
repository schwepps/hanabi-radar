import { describe, expect, it } from 'vitest';
import {
  revealItemIdSchema,
  sortRevealRows,
  toRevealPath,
  toRevealPaths,
  type RevealRow,
} from './reveal';

function makeRow(overrides: Partial<RevealRow> = {}): RevealRow {
  return {
    sensor_name: 'Camille Roy',
    author_degree: 'second',
    social_proof: null,
    seen_at: '2026-07-08T10:00:00.000Z',
    ...overrides,
  };
}

describe('revealItemIdSchema', () => {
  it('accepts a valid uuid', () => {
    expect(
      revealItemIdSchema.safeParse('b1000000-0000-4000-8000-000000000001')
        .success,
    ).toBe(true);
  });

  it('rejects empty and non-uuid input', () => {
    expect(revealItemIdSchema.safeParse('').success).toBe(false);
    expect(revealItemIdSchema.safeParse('not-a-uuid').success).toBe(false);
  });
});

describe('sortRevealRows', () => {
  it('orders strongest-first (first > second > third > none)', () => {
    const rows = [
      makeRow({ sensor_name: 'C', author_degree: 'none' }),
      makeRow({ sensor_name: 'A', author_degree: 'first' }),
      makeRow({ sensor_name: 'B', author_degree: 'third' }),
      makeRow({ sensor_name: 'D', author_degree: 'second' }),
    ];
    expect(sortRevealRows(rows).map((r) => r.author_degree)).toEqual([
      'first',
      'second',
      'third',
      'none',
    ]);
  });

  it('breaks degree ties by most-recently-seen, then name', () => {
    const rows = [
      makeRow({
        sensor_name: 'Zoe',
        author_degree: 'second',
        seen_at: '2026-07-01T00:00:00.000Z',
      }),
      makeRow({
        sensor_name: 'Bob',
        author_degree: 'second',
        seen_at: '2026-07-09T00:00:00.000Z',
      }),
      makeRow({
        sensor_name: 'Ana',
        author_degree: 'second',
        seen_at: '2026-07-09T00:00:00.000Z',
      }),
    ];
    // Bob & Ana seen same (latest) day -> name asc; Zoe seen earlier -> last.
    expect(sortRevealRows(rows).map((r) => r.sensor_name)).toEqual([
      'Ana',
      'Bob',
      'Zoe',
    ]);
  });

  it('returns a new array and does not mutate the input', () => {
    const rows = [
      makeRow({ sensor_name: 'A', author_degree: 'none' }),
      makeRow({ sensor_name: 'B', author_degree: 'first' }),
    ];
    const before = rows.map((r) => r.sensor_name);
    const sorted = sortRevealRows(rows);
    expect(sorted).not.toBe(rows);
    expect(rows.map((r) => r.sensor_name)).toEqual(before);
  });
});

describe('toRevealPath', () => {
  it('maps a direct-connection row (initials from name, note passed through)', () => {
    expect(
      toRevealPath(
        makeRow({
          sensor_name: 'Théo Marchand',
          author_degree: 'second',
          social_proof: '3 relations en commun',
          seen_at: '2026-07-08T10:00:00.000Z',
        }),
      ),
    ).toEqual({
      holderName: 'Théo Marchand',
      holderInitials: 'TM',
      degree: 'second',
      socialProof: '3 relations en commun',
      seenAt: '2026-07-08T10:00:00.000Z',
    });
  });

  it('maps a social-alternative row (degree none, note is the path)', () => {
    const path = toRevealPath(
      makeRow({
        sensor_name: 'Camille Roy',
        author_degree: 'none',
        social_proof: 'connaît un décideur',
      }),
    );
    expect(path.degree).toBe('none');
    expect(path.socialProof).toBe('connaît un décideur');
    expect(path.holderInitials).toBe('CR');
  });

  it('keeps a null note null (suppressed by the server)', () => {
    expect(
      toRevealPath(makeRow({ social_proof: null })).socialProof,
    ).toBeNull();
  });
});

describe('toRevealPaths', () => {
  it('sorts strongest-first, then maps', () => {
    const rows = [
      makeRow({ sensor_name: 'Weak', author_degree: 'none' }),
      makeRow({ sensor_name: 'Strong', author_degree: 'first' }),
    ];
    expect(toRevealPaths(rows).map((p) => p.degree)).toEqual(['first', 'none']);
    expect(toRevealPaths(rows)[0]?.holderName).toBe('Strong');
  });
});

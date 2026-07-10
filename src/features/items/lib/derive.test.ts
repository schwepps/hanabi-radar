import { describe, expect, it } from 'vitest';
import { computeAgeDays, deriveListItem, formatDateLabel } from './derive';
import { makeItemRow } from './fixtures';

const NOW = new Date('2026-07-08T12:00:00.000Z');

describe('computeAgeDays', () => {
  it('prefers posted_at over captured_at', () => {
    const row = makeItemRow({
      posted_at: '2026-07-01T12:00:00.000Z',
      captured_at: '2026-07-05T12:00:00.000Z',
    });
    expect(computeAgeDays(row, NOW)).toBe(7);
  });

  it('falls back to captured_at when posted_at is null', () => {
    const row = makeItemRow({
      posted_at: null,
      captured_at: '2026-07-05T12:00:00.000Z',
    });
    expect(computeAgeDays(row, NOW)).toBe(3);
  });

  it('never returns a negative age', () => {
    const row = makeItemRow({ posted_at: '2026-08-01T00:00:00.000Z' });
    expect(computeAgeDays(row, NOW)).toBe(0);
  });
});

describe('formatDateLabel', () => {
  it('uses French relative labels', () => {
    expect(formatDateLabel(0)).toBe('auj.');
    expect(formatDateLabel(1)).toBe('hier');
    expect(formatDateLabel(4)).toBe('4 j');
  });
});

describe('deriveListItem', () => {
  it('derives isNew/isProcessed from status and keeps heat null', () => {
    const item = deriveListItem(
      makeItemRow({ status: 'new', heat: null }),
      NOW,
    );
    expect(item?.isNew).toBe(true);
    expect(item?.isProcessed).toBe(false);
    expect(item?.heat).toBeNull();

    const processed = deriveListItem(makeItemRow({ status: 'processed' }), NOW);
    expect(processed?.isNew).toBe(false);
    expect(processed?.isProcessed).toBe(true);
  });

  it('surfaces the original author for reposts and drops the resharer’s identity', () => {
    const item = deriveListItem(
      makeItemRow({
        is_repost: true,
        author_name: 'Resharer',
        author_type: 'company',
        author_title: 'Community Manager',
        author_company: 'Resharer Inc',
        original_author_name: 'Decision Maker',
      }),
      NOW,
    );
    expect(item?.authorName).toBe('Decision Maker');
    // items has no original_author_{type,title,company}: never attribute the
    // resharer's role/type to the surfaced original author.
    expect(item?.authorMeta).toBeNull();
    expect(item?.authorKind).toBe('person');
  });

  it('neutralises non-http(s) urls (XSS guard) and keeps valid ones', () => {
    expect(
      deriveListItem(makeItemRow({ url: 'javascript:alert(1)' }), NOW)?.url,
    ).toBe('#');
    expect(
      deriveListItem(makeItemRow({ url: 'https://www.linkedin.com/x' }), NOW)
        ?.url,
    ).toBe('https://www.linkedin.com/x');
  });

  it('maps path from best_author_degree and sets hasWarmPath', () => {
    expect(
      deriveListItem(makeItemRow({ best_author_degree: 'first' }), NOW)?.path,
    ).toBe('first');
    expect(
      deriveListItem(makeItemRow({ best_author_degree: 'first' }), NOW)
        ?.hasWarmPath,
    ).toBe(true);
    expect(
      deriveListItem(makeItemRow({ best_author_degree: 'none' }), NOW)
        ?.hasWarmPath,
    ).toBe(false);
  });

  it('treats trends as aggregate authors', () => {
    const item = deriveListItem(
      makeItemRow({ stream: 'trend', seen_count: 14 }),
      NOW,
    );
    expect(item?.authorKind).toBe('aggregate');
    expect(item?.authorMeta).toBe('14 publications');
  });

  it('pluralizes the aggregate publication count (FSC-120)', () => {
    expect(
      deriveListItem(makeItemRow({ stream: 'trend', seen_count: 1 }), NOW)
        ?.authorMeta,
    ).toBe('1 publication');
    expect(
      deriveListItem(makeItemRow({ stream: 'trend', seen_count: 2 }), NOW)
        ?.authorMeta,
    ).toBe('2 publications');
  });

  it('returns null for unclassified, noise, dismissed, and orphaned rows', () => {
    expect(deriveListItem(makeItemRow({ stream: null }), NOW)).toBeNull();
    expect(deriveListItem(makeItemRow({ stream: 'noise' }), NOW)).toBeNull();
    // Dismissed rows drop out of the live feed too (mirrors data.ts .neq).
    expect(
      deriveListItem(
        makeItemRow({ stream: 'signal', status: 'dismissed' }),
        NOW,
      ),
    ).toBeNull();
    // Orphaned rows — every sensor that saw it opted out/erased, so seen_count=0
    // (FSC-95) — drop out too (mirrors data.ts .gt('seen_count', 0)).
    expect(
      deriveListItem(makeItemRow({ stream: 'signal', seen_count: 0 }), NOW),
    ).toBeNull();
  });

  it('never carries any holder-identity field (privacy invariant)', () => {
    const item = deriveListItem(
      makeItemRow({ best_author_degree: 'first' }),
      NOW,
    );
    const keys = Object.keys(item ?? {});
    expect(keys).not.toContain('social_proof');
    expect(keys).not.toContain('pathHolder');
    expect(keys).not.toContain('holderName');
  });
});

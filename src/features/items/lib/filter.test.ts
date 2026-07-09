import { describe, expect, it } from 'vitest';
import type { FilterCriteria } from './filter';
import {
  applyFilters,
  countByStream,
  filterByTab,
  matchesAccount,
  matchesDateRange,
  matchesDomains,
  matchesSearch,
} from './filter';
import { makeListItem } from './fixtures';

const NO_CRITERIA: FilterCriteria = {
  domains: [],
  account: 'all',
  dateRange: 'all',
  query: '',
};

describe('matchesSearch', () => {
  const item = makeListItem({
    summary: 'Migration ServiceNow réussie',
    authorName: 'Alice Martin',
    authorMeta: 'VP Ops · Globex',
    account: 'Globex',
    domains: ['servicenow', 'pmo'],
  });

  it('empty query matches everything', () => {
    expect(matchesSearch(item, '')).toBe(true);
    expect(matchesSearch(item, '   ')).toBe(true);
  });

  it('is case-insensitive and hits every searched field', () => {
    expect(matchesSearch(item, 'servicenow')).toBe(true); // summary + domain
    expect(matchesSearch(item, 'ALICE')).toBe(true); // author
    expect(matchesSearch(item, 'globex')).toBe(true); // meta + account
    expect(matchesSearch(item, 'pmo')).toBe(true); // domain tag
  });

  it('matches a visible domain label, not only its slug', () => {
    const genai = makeListItem({ domains: ['gen_ai'] });
    expect(matchesSearch(genai, 'genai')).toBe(true); // label "GenAI"
    expect(matchesSearch(genai, 'gen_ai')).toBe(true); // slug still matches
  });

  it('returns false on a miss and is null-safe', () => {
    expect(matchesSearch(item, 'kubernetes')).toBe(false);
    const sparse = makeListItem({
      summary: null,
      authorMeta: null,
      account: null,
    });
    expect(matchesSearch(sparse, 'kubernetes')).toBe(false);
  });
});

describe('matchesDomains (OR)', () => {
  const item = makeListItem({ domains: ['gen_ai', 'pmo'] });
  it('empty selection matches all', () => {
    expect(matchesDomains(item, [])).toBe(true);
  });
  it('matches when any selected domain is present', () => {
    expect(matchesDomains(item, ['servicenow', 'gen_ai'])).toBe(true);
  });
  it('fails when no selected domain is present', () => {
    expect(matchesDomains(item, ['servicenow'])).toBe(false);
  });
});

describe('matchesAccount (trend exemption)', () => {
  it("'all' matches everything", () => {
    expect(matchesAccount(makeListItem({ account: 'Acme' }), 'all')).toBe(true);
  });
  it('keeps only the selected account for non-trends', () => {
    expect(matchesAccount(makeListItem({ account: 'Acme' }), 'Acme')).toBe(
      true,
    );
    expect(matchesAccount(makeListItem({ account: 'Globex' }), 'Acme')).toBe(
      false,
    );
  });
  it('exempts trends regardless of account (cross-account)', () => {
    const trend = makeListItem({ stream: 'trend', account: null });
    expect(matchesAccount(trend, 'Acme')).toBe(true);
  });
});

describe('matchesDateRange', () => {
  it("'all' keeps even very old items", () => {
    expect(matchesDateRange(makeListItem({ ageDays: 400 }), 'all')).toBe(true);
  });
  it("'24h' keeps only today (0), drops 1+ days old", () => {
    expect(matchesDateRange(makeListItem({ ageDays: 0 }), '24h')).toBe(true);
    expect(matchesDateRange(makeListItem({ ageDays: 1 }), '24h')).toBe(false);
    expect(matchesDateRange(makeListItem({ ageDays: 2 }), '24h')).toBe(false);
  });
  it('7d / 30d honour their thresholds', () => {
    expect(matchesDateRange(makeListItem({ ageDays: 7 }), '7d')).toBe(true);
    expect(matchesDateRange(makeListItem({ ageDays: 30 }), '7d')).toBe(false);
    expect(matchesDateRange(makeListItem({ ageDays: 30 }), '30d')).toBe(true);
    expect(matchesDateRange(makeListItem({ ageDays: 45 }), '30d')).toBe(false);
  });
});

describe('filterByTab', () => {
  it('keeps only the active stream', () => {
    const items = [
      makeListItem({ id: 'a', stream: 'signal' }),
      makeListItem({ id: 'b', stream: 'opportunity' }),
      makeListItem({ id: 'c', stream: 'trend' }),
    ];
    expect(filterByTab(items, 'signal').map((i) => i.id)).toEqual(['a']);
  });
});

describe('applyFilters', () => {
  it('ANDs the predicates (account + domain)', () => {
    const items = [
      makeListItem({ id: 'a', account: 'Acme', domains: ['pmo'], ageDays: 2 }),
      makeListItem({
        id: 'b',
        account: 'Globex',
        domains: ['pmo'],
        ageDays: 2,
      }),
      makeListItem({
        id: 'c',
        account: 'Acme',
        domains: ['gen_ai'],
        ageDays: 2,
      }),
    ];
    const result = applyFilters(items, {
      ...NO_CRITERIA,
      account: 'Acme',
      domains: ['pmo'],
    });
    expect(result.map((i) => i.id)).toEqual(['a']);
  });
});

describe('countByStream', () => {
  it('counts per stream under the filters, ignoring the active tab', () => {
    const items = [
      makeListItem({ id: 'a', stream: 'signal', account: 'Acme' }),
      makeListItem({ id: 'b', stream: 'signal', account: 'Globex' }),
      makeListItem({ id: 'c', stream: 'opportunity', account: 'Acme' }),
      makeListItem({ id: 'd', stream: 'trend', account: null }),
    ];
    const counts = countByStream(items, { ...NO_CRITERIA, account: 'Acme' });
    // Acme signal + Acme opportunity + the trend (exempt) — Globex signal dropped.
    expect(counts).toEqual({ signal: 1, opportunity: 1, trend: 1 });
  });
});

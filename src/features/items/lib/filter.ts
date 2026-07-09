import type { DateRange, ListItem, Stream } from '../types';
import { DOMAIN_OPTIONS } from './presentation';

export interface FilterCriteria {
  domains: string[];
  /** 'all' or a specific account name. */
  account: string;
  dateRange: DateRange;
  query: string;
  dismissed: string[];
}

const DATE_RANGE_DAYS: Record<'7d' | '30d', number> = {
  '7d': 7,
  '30d': 30,
};

/** slug → French label, so a search for a visible chip label matches too. */
const DOMAIN_LABELS = new Map(
  DOMAIN_OPTIONS.map((option) => [option.slug, option.label]),
);

/** Case-insensitive substring across summary / author / meta / account / domains. */
export function matchesSearch(item: ListItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') {
    return true;
  }
  const haystack = [
    item.summary,
    item.authorName,
    item.authorMeta,
    item.account,
    ...item.domains,
    ...item.domains.map((slug) => DOMAIN_LABELS.get(slug) ?? null),
  ];
  return haystack.some(
    (field) => field != null && field.toLowerCase().includes(needle),
  );
}

/** Empty selection = all. Otherwise the item must match at least one (OR). */
export function matchesDomains(item: ListItem, domains: string[]): boolean {
  if (domains.length === 0) {
    return true;
  }
  return domains.some((domain) => item.domains.includes(domain));
}

/**
 * 'all' passes everything. Trends are cross-account and exempt from the account
 * filter (checked per-item, so it holds regardless of evaluation order).
 */
export function matchesAccount(item: ListItem, account: string): boolean {
  if (account === 'all' || item.stream === 'trend') {
    return true;
  }
  return item.account === account;
}

export function matchesDateRange(item: ListItem, range: DateRange): boolean {
  if (range === 'all') {
    return true;
  }
  // '24h' = strictly under a day old. ageDays floors to whole days, so ageDays 0
  // is exactly "< 24h"; without this special case '24h' would also admit posts
  // 24–48h old.
  if (range === '24h') {
    return item.ageDays === 0;
  }
  return item.ageDays <= DATE_RANGE_DAYS[range];
}

/** Filter to a single stream (the active tab). */
export function filterByTab(items: ListItem[], stream: Stream): ListItem[] {
  return items.filter((item) => item.stream === stream);
}

/** All non-tab criteria: excludes dismissed ids, then ANDs every predicate. */
export function applyFilters(
  items: ListItem[],
  criteria: FilterCriteria,
): ListItem[] {
  return items.filter(
    (item) =>
      !criteria.dismissed.includes(item.id) &&
      matchesSearch(item, criteria.query) &&
      matchesDomains(item, criteria.domains) &&
      matchesAccount(item, criteria.account) &&
      matchesDateRange(item, criteria.dateRange),
  );
}

/** Tally an ALREADY-filtered list per stream (no filtering inside). */
export function tallyByStream(items: ListItem[]): Record<Stream, number> {
  const counts: Record<Stream, number> = {
    signal: 0,
    opportunity: 0,
    trend: 0,
  };
  for (const item of items) {
    counts[item.stream] += 1;
  }
  return counts;
}

/** Per-stream counts under the current filters, ignoring the active-tab restriction. */
export function countByStream(
  items: ListItem[],
  criteria: FilterCriteria,
): Record<Stream, number> {
  return tallyByStream(applyFilters(items, criteria));
}

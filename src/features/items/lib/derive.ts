import type { Tables } from '@/types/database';
import type { AuthorKind, ListItem, Stream } from '../types';

/**
 * Row → view-model derivation. Never reads `item_sources` / `social_proof`
 * (not on the `items` row type anyway) — the holder identity is out of this path
 * by construction (see types.ts privacy invariant).
 */

type ItemRow = Tables<'items'>;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Accept only http(s) URLs. `items.url` is externally sourced (extension-scraped,
 * FSC-98), so a `javascript:`/`data:` value would be an XSS sink in the card's
 * external link — reject anything that is not http(s).
 */
function safeHttpUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : '#';
}

/** Streams shown in the UI. `noise` and unclassified (`null`) are excluded. */
function toStream(stream: ItemRow['stream']): Stream | null {
  if (stream === 'signal' || stream === 'opportunity' || stream === 'trend') {
    return stream;
  }
  return null;
}

/**
 * Whole days since the post. Prefers the derived `posted_at`, falls back to the
 * always-present `captured_at`. Never negative (a future timestamp → 0).
 */
export function computeAgeDays(
  row: Pick<ItemRow, 'posted_at' | 'captured_at'>,
  now: Date = new Date(),
): number {
  const reference = row.posted_at ?? row.captured_at;
  const diffMs = now.getTime() - new Date(reference).getTime();
  return Math.max(0, Math.floor(diffMs / MS_PER_DAY));
}

/** Compact French relative label for the mono date slot. */
export function formatDateLabel(ageDays: number): string {
  if (ageDays === 0) return 'auj.';
  if (ageDays === 1) return 'hier';
  return `${ageDays} j`;
}

function deriveAuthorMeta(row: ItemRow, kind: AuthorKind): string | null {
  if (kind === 'aggregate') {
    return `${row.seen_count} publications`;
  }
  // On a repost, author_title/author_company describe the RESHARER, not the
  // surfaced original author, and items has no original_author_title/company —
  // so omit the meta rather than mis-attribute the resharer's role.
  if (row.is_repost) {
    return null;
  }
  const parts = [row.author_title, row.author_company].filter(
    (part): part is string => part != null && part.trim() !== '',
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Derive a card payload from a DB row, or `null` when the row is not shown in
 * the list — unclassified, `noise`, or `dismissed` (mirrors the fetch's
 * `.neq('status','dismissed')` in data.ts, so a realtime dismissal drops the row
 * from the live feed too). Reposts surface the ORIGINAL author (the
 * decision-maker), never the resharer.
 */
export function deriveListItem(row: ItemRow, now?: Date): ListItem | null {
  const stream = toStream(row.stream);
  if (stream === null || row.status === 'dismissed') {
    return null;
  }

  const authorName =
    row.is_repost && row.original_author_name != null
      ? row.original_author_name
      : row.author_name;

  // Trends are cross-account aggregations — no single decision-maker author.
  // Reposts surface the original author, whose type isn't stored (items has no
  // original_author_type), so treat them as a person (decision-makers are people).
  const authorKind: AuthorKind =
    stream === 'trend'
      ? 'aggregate'
      : row.is_repost
        ? 'person'
        : row.author_type;
  const ageDays = computeAgeDays(row, now);

  return {
    id: row.id,
    stream,
    account: row.account,
    heat: row.heat,
    path: row.best_author_degree,
    isNew: row.status === 'new',
    isProcessed: row.status === 'processed',
    ageDays,
    dateLabel: formatDateLabel(ageDays),
    seen: row.seen_count,
    summary: row.summary,
    authorName,
    authorKind,
    authorMeta: deriveAuthorMeta(row, authorKind),
    domains: row.domains,
    url: safeHttpUrl(row.url),
    hasWarmPath: row.best_author_degree !== 'none',
  };
}

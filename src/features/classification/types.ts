import type { Enums } from '@/types/database';

/**
 * The classifier's INPUT projection of an `items` row — only the substance-bearing
 * and context columns the model reads. Never includes per-sensor data.
 */
export interface PendingItem {
  id: string;
  text: string | null;
  post_type: Enums<'post_type'>;
  media_title: string | null;
  hashtags: string[];
  author_type: Enums<'author_type'>;
  author_name: string;
  author_company: string | null;
  author_title: string | null;
  is_repost: boolean;
  original_author_name: string | null;
}

/** The DB patch the classifier writes back to `items`. `status` is never touched. */
export interface ClassificationUpdate {
  stream: Enums<'stream'>;
  domains: string[];
  heat: Enums<'heat'> | null;
  summary: string | null;
}

/** Why a single item's Claude call did not produce a usable classification. */
export type ClassifyFailure =
  'refusal' | 'max_tokens' | 'rate_limit' | 'timeout' | 'invalid' | 'error';

/**
 * Result of a guarded classification write:
 * - `written`  — a pending row was updated.
 * - `skipped`  — 0 rows matched (a concurrent tick already classified it; the
 *   `stream IS NULL` guard prevented a clobber). Distinct from success so metrics
 *   surface races instead of counting them as classified.
 * - `error`    — the write failed.
 */
export type PersistOutcome = 'written' | 'skipped' | 'error';

/** Aggregate outcome of one worker batch (the classify endpoint's 200 body). */
export interface ClassifyBatchSummary {
  picked: number;
  classified: number;
  prefiltered_noise: number;
  skipped: number;
  failed: number;
}

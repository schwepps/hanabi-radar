import { normalizeDomains } from '@/lib/taxonomy';
import type { ClassificationUpdate } from '../types';
import type { RawClassification } from './schema';

/** Soft cap on the stored summary (structured output can't enforce maxLength). */
const MAX_SUMMARY = 400;

/** The patch written for a noise verdict (from the pre-filter or the model). */
export const NOISE_UPDATE: ClassificationUpdate = {
  stream: 'noise',
  domains: [],
  heat: null,
  summary: null,
};

function cleanSummary(summary: string): string | null {
  const trimmed = summary.trim();
  if (trimmed === '') {
    return null;
  }
  return trimmed.length > MAX_SUMMARY
    ? `${trimmed.slice(0, MAX_SUMMARY).trimEnd()}…`
    : trimmed;
}

/**
 * Map a validated model result to the DB patch. Total function (stream/heat are
 * already valid enums from structured output). Applies the domain cap/normalization
 * and summary trim/truncate that the schema deliberately left off. Heat is Rule B:
 * kept as emitted on any non-noise stream; forced null (with empty domains) only
 * for noise.
 */
export function resultToUpdate(raw: RawClassification): ClassificationUpdate {
  if (raw.stream === 'noise') {
    return NOISE_UPDATE;
  }
  return {
    stream: raw.stream,
    domains: normalizeDomains(raw.domains),
    heat: raw.heat,
    summary: cleanSummary(raw.summary),
  };
}

import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import {
  fetchPendingItems,
  persistClassification,
  recordClassificationFailure,
} from './data';
import { classifyItem, type ClaudeParser } from './lib/classify-item';
import { mapWithConcurrency } from './lib/concurrency';
import {
  BATCH_LIMIT,
  CALL_TIMEOUT_MS,
  CLASSIFIER_MODEL,
  CONCURRENCY,
  MAX_OUTPUT_TOKENS,
} from './lib/model-config';
import { prefilterItem } from './lib/prefilter';
import { buildSystemPrompt } from './lib/prompt';
import { NOISE_UPDATE, resultToUpdate } from './lib/result-to-update';
import type {
  ClassifyBatchSummary,
  PendingItem,
  PersistOutcome,
} from './types';

export interface RunClassificationDeps {
  supabase: SupabaseClient<Database>;
  parser: ClaudeParser;
  limit?: number;
  concurrency?: number;
}

type ItemOutcome = 'classified' | 'prefiltered_noise' | 'skipped' | 'failed';

/**
 * Classify one pending batch: fetch → (per item) pre-filter or Claude call →
 * persist. Idempotent and self-healing — a failed item is left `stream IS NULL`
 * for the next tick; a classified or noise item becomes non-NULL and is never
 * re-picked. Per-item errors are isolated so one bad item can't abort the batch.
 * A fetch failure propagates (the caller maps it to a 500).
 */
export async function runClassificationBatch(
  deps: RunClassificationDeps,
): Promise<ClassifyBatchSummary> {
  const limit = deps.limit ?? BATCH_LIMIT;
  const concurrency = deps.concurrency ?? CONCURRENCY;

  const items = await fetchPendingItems(deps.supabase, limit);
  if (items.length === 0) {
    return {
      picked: 0,
      classified: 0,
      prefiltered_noise: 0,
      skipped: 0,
      failed: 0,
    };
  }

  // Built once per batch — stable across items so the Claude prompt cache can hit.
  const systemPrompt = buildSystemPrompt();

  const outcomes = await mapWithConcurrency(items, concurrency, (item) =>
    classifyOne(item, deps, systemPrompt),
  );

  const summary: ClassifyBatchSummary = {
    picked: items.length,
    classified: 0,
    prefiltered_noise: 0,
    skipped: 0,
    failed: 0,
  };
  for (const outcome of outcomes) {
    summary[outcome] += 1;
  }

  console.log(
    `[classification] batch picked=${summary.picked} classified=${summary.classified} noise=${summary.prefiltered_noise} skipped=${summary.skipped} failed=${summary.failed}`,
  );
  return summary;
}

/** Translate a write result into the item's outcome tally. */
function tally(
  outcome: PersistOutcome,
  onWritten: 'classified' | 'prefiltered_noise',
): ItemOutcome {
  if (outcome === 'written') {
    return onWritten;
  }
  return outcome === 'skipped' ? 'skipped' : 'failed';
}

async function classifyOne(
  item: PendingItem,
  deps: RunClassificationDeps,
  systemPrompt: string,
): Promise<ItemOutcome> {
  try {
    if (prefilterItem(item).decision === 'noise') {
      const outcome = await persistClassification(
        deps.supabase,
        item.id,
        NOISE_UPDATE,
      );
      return tally(outcome, 'prefiltered_noise');
    }

    const result = await classifyItem(item, {
      parser: deps.parser,
      systemPrompt,
      model: CLASSIFIER_MODEL,
      maxTokens: MAX_OUTPUT_TOKENS,
      timeoutMs: CALL_TIMEOUT_MS,
    });
    if (!result.ok) {
      // Leave the item pending (stream IS NULL); record the failure so a poison item
      // is parked after the attempt cap instead of retried forever.
      console.error(`[classification] ${result.failure} for item ${item.id}`);
      await recordClassificationFailure(deps.supabase, item.id, result.failure);
      return 'failed';
    }

    const outcome = await persistClassification(
      deps.supabase,
      item.id,
      resultToUpdate(result.value),
    );
    return tally(outcome, 'classified');
  } catch (error) {
    console.error(
      `[classification] unexpected error for item ${item.id}:`,
      error instanceof Error ? error.message : error,
    );
    // Count the unexpected failure (transient) so an item that persistently throws
    // on an unexpected path still parks after the cap, like a Claude failure —
    // otherwise this branch would retry it forever. recordClassificationFailure is
    // best-effort and never throws, so it's safe to call from here.
    await recordClassificationFailure(deps.supabase, item.id, 'error');
    return 'failed';
  }
}

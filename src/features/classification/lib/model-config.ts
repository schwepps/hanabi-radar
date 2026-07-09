/**
 * Central knobs for the classification job. The MODEL lives here as a single
 * swappable constant (options: `claude-haiku-4-5` | `claude-sonnet-5` |
 * `claude-opus-4-8`) so changing the cost/quality tier is a one-line edit that
 * can't break the call site. FSC-100 ships on Haiku 4.5 for P0 cost control.
 *
 * Note: Haiku 4.5 rejects the `effort` parameter and needs no extended thinking
 * for a constrained classification, so the request deliberately sets neither.
 */
export const CLASSIFIER_MODEL = 'claude-haiku-4-5';

/** Output cap — the structured object is tiny; 1024 leaves ample headroom. */
export const MAX_OUTPUT_TOKENS = 1024;

/** Per-call timeout (ms). A hung call fails the item, which retries next tick. */
export const CALL_TIMEOUT_MS = 30_000;

/** Max items pulled per batch — bounds per-invocation work and cost. */
export const BATCH_LIMIT = 40;

/** Max concurrent Claude calls in a batch. */
export const CONCURRENCY = 6;

/**
 * Failed attempts before an item is PARKED — excluded from `fetchPendingItems` so a
 * permanently-failing (poison) item can't be retried forever or block the FIFO
 * queue. Permanent failures jump straight to this cap; transient ones increment.
 */
export const MAX_CLASSIFY_ATTEMPTS = 5;

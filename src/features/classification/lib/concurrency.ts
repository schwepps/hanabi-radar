/**
 * Run `worker` over `items` with at most `limit` in flight at once, preserving
 * input order in the result. A small hand-rolled pool (no new dependency) that
 * bounds parallel Claude calls per batch. `limit` is clamped to at least 1.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const bound = Math.max(1, Math.floor(limit));
  let next = 0;

  async function runner(): Promise<void> {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await worker(items[index], index);
    }
  }

  const runners = Array.from({ length: Math.min(bound, items.length) }, runner);
  await Promise.all(runners);
  return results;
}

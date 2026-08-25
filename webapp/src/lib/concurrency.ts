/**
 * Bounded parallel fan-out.
 *
 * The bulk write paths (delete 40 selected items, detach every item in a
 * container) are one request per record, and `Promise.all` over the whole
 * selection opens all of them at once — past the browser's per-host connection
 * limit the extra requests only queue, and PocketBase sees a burst it has no
 * reason to absorb. A small worker pool keeps the wall-clock win of parallelism
 * without the stampede.
 *
 * Rejection behaves like `Promise.all`: the first failure is what the caller
 * sees, and work already in flight is left to settle rather than being torn
 * down (there is nothing to cancel a PocketBase request with here). Callers
 * treat a rejection as "some of this may have happened" and re-read from the
 * server, which is what the mutation hooks' invalidation does anyway.
 */

/** How many writes a bulk mutation keeps in flight at once. */
export const BULK_CONCURRENCY = 8;

/**
 * Map `items` through `fn` with at most `limit` calls in flight, preserving
 * input order in the result.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  };

  const size = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: size }, worker));
  return results;
}

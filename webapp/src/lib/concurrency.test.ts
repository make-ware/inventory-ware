import { describe, it, expect, vi } from 'vitest';
import { mapWithConcurrency } from './concurrency';

/** A promise plus the handle to settle it, so a test controls when work ends. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('mapWithConcurrency', () => {
  it('returns results in input order, not completion order', async () => {
    const delays = [30, 10, 20];
    const results = await mapWithConcurrency(
      delays,
      3,
      async (delay, index) => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return index;
      }
    );

    expect(results).toEqual([0, 1, 2]);
  });

  it('keeps at most `limit` calls in flight', async () => {
    const gates = [deferred<void>(), deferred<void>(), deferred<void>()];
    let started = 0;

    const running = mapWithConcurrency([0, 1, 2], 2, async (index) => {
      started++;
      await gates[index].promise;
      return index;
    });

    await Promise.resolve();
    expect(started).toBe(2);

    gates[0].resolve();
    await gates[0].promise;
    // Freeing a worker is what admits the third call, nothing else.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(started).toBe(3);

    gates[1].resolve();
    gates[2].resolve();
    await expect(running).resolves.toEqual([0, 1, 2]);
  });

  it('rejects with the first failure', async () => {
    const fn = vi.fn(async (value: number) => {
      if (value === 1) throw new Error('nope');
      return value;
    });

    await expect(mapWithConcurrency([0, 1, 2], 1, fn)).rejects.toThrow('nope');
  });

  it('does nothing for an empty input', async () => {
    const fn = vi.fn();
    await expect(mapWithConcurrency([], 4, fn)).resolves.toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });
});

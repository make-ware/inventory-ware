import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getList = vi.fn();

vi.mock('@/lib/pocketbase-client', () => ({
  default: {
    collection: () => ({ getList }),
  },
}));

import { useImages, IMAGES_FETCH_LIMIT } from './use-images';

function makeList(items: { id: string; analysisStatus?: string }[]) {
  return {
    page: 1,
    perPage: IMAGES_FETCH_LIMIT,
    totalItems: items.length,
    totalPages: 1,
    items,
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** The `options` argument of the most recent `collection.getList()` call. */
function lastListOptions() {
  return getList.mock.calls.at(-1)?.[2] ?? {};
}

describe('useImages', () => {
  beforeEach(() => {
    getList.mockReset();
    getList.mockResolvedValue(makeList([{ id: 'a' }, { id: 'b' }]));
  });

  it('asks PocketBase for the whole library, newest first', async () => {
    const { result } = renderHook(() => useImages('u1'), { wrapper });

    await waitFor(() => expect(result.current.images).toHaveLength(2));

    expect(getList).toHaveBeenCalledTimes(1);
    expect(getList.mock.calls[0][1]).toBe(IMAGES_FETCH_LIMIT);
    expect(lastListOptions()).toMatchObject({ sort: '-created' });
  });

  it('stays idle without an authenticated user', () => {
    const { result } = renderHook(() => useImages(null), { wrapper });

    expect(getList).not.toHaveBeenCalled();
    expect(result.current.images).toEqual([]);
    // A signed-out visitor gets the empty state, not an unresolvable spinner.
    expect(result.current.isLoading).toBe(false);
  });

  it('polls only while an image is still being analysed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      getList.mockResolvedValue(
        makeList([{ id: 'a', analysisStatus: 'processing' }])
      );

      const { result } = renderHook(() => useImages('u1'), { wrapper });
      await waitFor(() => expect(result.current.images).toHaveLength(1));
      expect(getList).toHaveBeenCalledTimes(1);

      // Analysis finishes between the two reads, so the interval that fired
      // this one must not schedule another.
      getList.mockResolvedValue(
        makeList([{ id: 'a', analysisStatus: 'completed' }])
      );
      await vi.advanceTimersByTimeAsync(5000);
      await waitFor(() => expect(getList).toHaveBeenCalledTimes(2));

      await vi.advanceTimersByTimeAsync(15000);
      expect(getList).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

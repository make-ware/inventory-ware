import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getList = vi.fn();
const getOne = vi.fn();

/** See use-items.test.tsx for the shape; `emit` replays an SSE event. */
const unsubscribe = vi.fn();
const handlers: ((event: {
  action: string;
  record: Record<string, unknown>;
}) => void)[] = [];
const subscribe = vi.fn(async (_topic, handler, _options?: unknown) => {
  handlers.push(handler);
  return unsubscribe;
});
const emit = (action: string, record: Record<string, unknown>) => {
  for (const handler of handlers) handler({ action, record });
};

vi.mock('@/lib/pocketbase-client', () => ({
  default: {
    collection: () => ({ getList, getOne, subscribe }),
  },
}));

import { useImage, useImages, IMAGES_FETCH_LIMIT } from './use-images';
import { qk } from '@/lib/query';

beforeEach(() => {
  handlers.length = 0;
  subscribe.mockClear();
  unsubscribe.mockClear();
});

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

describe('useImage', () => {
  beforeEach(() => {
    getList.mockReset();
    getOne.mockReset();
  });

  it('paints from the cached grid row instead of waiting on a read', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    client.setQueryData(qk.images('u1'), makeList([{ id: 'a' }]));

    const { result } = renderHook(() => useImage('a'), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    // The row was already on screen on the grid, so there is nothing to spin
    // for — the background refetch settles the copy afterwards.
    expect(result.current.isPending).toBe(false);
    expect(result.current.image).toMatchObject({ id: 'a' });
    await waitFor(() => expect(result.current.isFetching).toBe(false));
  });

  it('reports an id PocketBase has no record for as missing, not failed', async () => {
    getOne.mockRejectedValue(
      Object.assign(new Error('not found'), { status: 404 })
    );

    const { result } = renderHook(() => useImage('gone'), { wrapper });

    await waitFor(() => expect(result.current.isMissing).toBe(true));
    expect(result.current.isError).toBe(false);
    expect(result.current.image).toBeNull();
  });

  it('stays idle without an image id', async () => {
    const { result } = renderHook(() => useImage(null), { wrapper });

    await waitFor(() => expect(result.current.image).toBeNull());
    expect(getOne).not.toHaveBeenCalled();
  });
});

describe('useImages — realtime', () => {
  // A stable client, so the cache survives the re-render an event triggers.
  let client: QueryClient;

  function liveWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }

  const image = (
    id: string,
    created: string,
    extra: Record<string, unknown> = {}
  ) => ({
    id,
    created,
    updated: created,
    UserRef: 'u1',
    analysisStatus: 'pending',
    ...extra,
  });

  const A = image('a', '2026-08-01 00:00:00.000Z');

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    getList.mockReset();
    getList.mockResolvedValue({
      page: 1,
      perPage: IMAGES_FETCH_LIMIT,
      totalItems: 1,
      totalPages: 1,
      items: [A],
    });
  });

  async function renderSettled() {
    const view = renderHook(() => useImages('u1'), { wrapper: liveWrapper });
    await waitFor(() => {
      expect(view.result.current.images).toHaveLength(1);
      expect(view.result.current.isFetching).toBe(false);
    });
    return view;
  }

  it('subscribes to the Images collection scoped to the signed-in user', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await renderSettled();

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(subscribe.mock.calls[0][2]).toMatchObject({
      filter: 'UserRef="u1"',
    });
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate.mock.calls[0][0]).toEqual({ queryKey: qk.images('u1') });
  });

  it('folds an analysis-status change into the cached library', async () => {
    const { result } = await renderSettled();
    const settled = getList.mock.calls.length;

    act(() =>
      emit('update', {
        ...A,
        analysisStatus: 'completed',
        updated: '2026-08-02 00:00:00.000Z',
      })
    );

    // The single envelope is merged in place — no second read of a
    // thousand-row library just to learn one field flipped.
    await waitFor(() =>
      expect(result.current.images[0].analysisStatus).toBe('completed')
    );
    expect(result.current.images).toHaveLength(1);
    expect(getList).toHaveBeenCalledTimes(settled);
  });

  it('prepends an upload from another tab, newest first', async () => {
    const { result } = await renderSettled();

    act(() => emit('create', image('b', '2026-08-02 00:00:00.000Z')));

    await waitFor(() =>
      expect(result.current.images.map((i) => i.id)).toEqual(['b', 'a'])
    );
  });
});

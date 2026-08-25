import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getList = vi.fn();
const getOne = vi.fn();

/**
 * PocketBase realtime, mocked at the SDK boundary. `subscribe` resolves to the
 * unsubscribe function the hooks hold onto, and `emit` plays an event back
 * through every registered handler, which is how a "another tab wrote this"
 * case is expressed in a unit test.
 */
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
    files: { getURL: () => 'http://localhost:8090/file.png' },
  },
}));

import { useItemsInfinite, useItem, useAllItems } from './use-items';
import { qk } from '@/lib/query';

beforeEach(() => {
  handlers.length = 0;
  subscribe.mockClear();
  unsubscribe.mockClear();
});

function makePage(page: number, totalPages: number, ids: string[]) {
  return {
    page,
    perPage: 12,
    totalItems: totalPages * 12,
    totalPages,
    items: ids.map((id) => ({ id })),
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

describe('useItemsInfinite', () => {
  beforeEach(() => {
    getList.mockReset();
    getList.mockResolvedValue(makePage(1, 1, ['a', 'b']));
  });

  it('asks PocketBase for one page of ITEMS_PER_PAGE rows', async () => {
    const { result } = renderHook(
      () => useItemsInfinite({ userId: 'u1', sort: '+itemLabel' }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.pages).toHaveLength(1));

    expect(getList).toHaveBeenCalledTimes(1);
    expect(getList.mock.calls[0].slice(0, 2)).toEqual([1, 12]);
    expect(lastListOptions()).toMatchObject({
      sort: '+itemLabel',
      expand: 'ImageRef',
    });
    expect(result.current.itemsForPage(1).map((item) => item.id)).toEqual([
      'a',
      'b',
    ]);
    expect(result.current.totalItems).toBe(12);
  });

  it('lets the mutator escape the search text instead of interpolating it', async () => {
    const { result } = renderHook(
      () =>
        useItemsInfinite({
          userId: 'u1',
          q: 'ha"ck',
          filters: { functional: 'lighting' },
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.pages).toHaveLength(1));

    const { filter } = lastListOptions();
    expect(filter).toContain('ha\\"ck');
    expect(filter).toContain('categoryFunctional="lighting"');
  });

  it('walks forward one server page at a time', async () => {
    getList.mockResolvedValueOnce(makePage(1, 2, ['a']));
    getList.mockResolvedValueOnce(makePage(2, 2, ['b']));

    const { result } = renderHook(() => useItemsInfinite({ userId: 'u1' }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.pages).toHaveLength(2));

    expect(getList.mock.calls[1][0]).toBe(2);
    expect(result.current.itemsForPage(2).map((item) => item.id)).toEqual([
      'b',
    ]);
    expect(result.current.hasNextPage).toBe(false);
    // A page that was never requested reads as empty, not as a crash.
    expect(result.current.itemsForPage(9)).toEqual([]);
  });

  it('stays idle until there is an authenticated user', async () => {
    const { result } = renderHook(() => useItemsInfinite({ userId: null }), {
      wrapper,
    });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(getList).not.toHaveBeenCalled();
    expect(result.current.pages).toEqual([]);
  });

  it('withholds a search PocketBase cannot parse rather than 400ing', async () => {
    const { result } = renderHook(
      () => useItemsInfinite({ userId: 'u1', q: 'C:\\' }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isRejectedQuery).toBe(true));
    expect(getList).not.toHaveBeenCalled();
    expect(result.current.itemsForPage(1)).toEqual([]);
  });
});

describe('useItem', () => {
  // One client for the whole test, unlike `wrapper` above: these cases are
  // about what the cache already holds, so it has to survive re-renders.
  let client: QueryClient;

  function cachingWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    getList.mockReset();
    getOne.mockReset();
  });

  it('fetches the item with its image expanded', async () => {
    getOne.mockResolvedValue({ id: 'i1', itemLabel: 'Drill' });

    const { result } = renderHook(() => useItem('i1'), {
      wrapper: cachingWrapper,
    });

    await waitFor(() => expect(result.current.item?.id).toBe('i1'));
    expect(getOne.mock.calls[0][0]).toBe('i1');
    expect(getOne.mock.calls[0][1]).toMatchObject({ expand: 'ImageRef' });
  });

  it('paints from a cached list page instead of refetching', () => {
    client.setQueryData(
      qk.itemsInfinite('u1', {
        q: '',
        filters: {
          functional: undefined,
          specific: undefined,
          itemType: undefined,
        },
        sort: '-created',
      }),
      { pages: [makePage(1, 1, ['i1'])], pageParams: [1] }
    );

    const { result } = renderHook(() => useItem('i1'), {
      wrapper: cachingWrapper,
    });

    // Seeded synchronously — no pending state, no request in flight.
    expect(result.current.item?.id).toBe('i1');
    expect(result.current.isPending).toBe(false);
  });

  it('reports an id PocketBase has no record for as missing, not as an error', async () => {
    getOne.mockRejectedValue(
      Object.assign(new Error('Not found'), { status: 404 })
    );

    const { result } = renderHook(() => useItem('gone'), {
      wrapper: cachingWrapper,
    });

    await waitFor(() => expect(result.current.isMissing).toBe(true));
    expect(result.current.isError).toBe(false);
    expect(result.current.item).toBeNull();
  });
});

describe('useAllItems', () => {
  beforeEach(() => {
    getList.mockReset();
  });

  it('asks for the unfiltered pool the container picker offers', async () => {
    getList.mockResolvedValue(makePage(1, 1, ['a', 'b']));

    const { result } = renderHook(() => useAllItems('u1'), { wrapper });

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    // An empty query must not become `itemLabel~""`, which would match nothing
    // useful; the mutator omits the text clause entirely.
    expect(getList.mock.calls[0][2]?.filter).toBeUndefined();
  });

  it('stays idle until there is an authenticated user', async () => {
    const { result } = renderHook(() => useAllItems(null), { wrapper });

    await waitFor(() => expect(result.current.items).toEqual([]));
    expect(getList).not.toHaveBeenCalled();
  });
});

describe('useItemsInfinite — realtime', () => {
  // One client for the whole test, unlike `wrapper` above: these cases are
  // about what the cache holds across renders.
  let client: QueryClient;

  function liveWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }

  const item = (id: string, created: string, extra = {}) => ({
    id,
    created,
    updated: created,
    UserRef: 'u1',
    itemLabel: id,
    itemName: '',
    itemNotes: '',
    itemManufacturer: '',
    ...extra,
  });

  const page = (items: ReturnType<typeof item>[]) => ({
    page: 1,
    perPage: 12,
    totalItems: items.length,
    totalPages: 1,
    items,
  });

  const A = item('a', '2026-08-01 00:00:00.000Z');

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    getList.mockReset();
    getList.mockResolvedValue(page([A]));
  });

  /** Render, then wait until the initial fetch and the gap heal have settled. */
  async function renderSettled(props: { userId: string | null; q?: string }) {
    const view = renderHook((p: typeof props) => useItemsInfinite(p), {
      wrapper: liveWrapper,
      initialProps: props,
    });
    await waitFor(() => {
      expect(view.result.current.pages).toHaveLength(1);
      expect(view.result.current.isFetching).toBe(false);
    });
    return view;
  }

  it('subscribes to the Items collection scoped to the signed-in user', async () => {
    await renderSettled({ userId: 'u1' });

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(subscribe.mock.calls[0][0]).toBe('*');
    expect(subscribe.mock.calls[0][2]).toMatchObject({
      filter: 'UserRef="u1"',
      expand: 'ImageRef',
    });
  });

  it('heals the gap between the first read and the first event exactly once', async () => {
    // Asserted on the invalidation rather than on a request count: TanStack
    // folds the heal into the initial fetch when that is still in flight, so
    // the observable contract is "one invalidation per mount", not "one extra
    // round trip".
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await renderSettled({ userId: 'u1' });

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate.mock.calls[0][0]).toEqual({
      queryKey: qk.itemsInfinitePrefix('u1'),
    });
  });

  it("folds another client's create into the cached page instead of refetching", async () => {
    const { result } = await renderSettled({ userId: 'u1' });
    const settled = getList.mock.calls.length;

    act(() => emit('create', item('b', '2026-08-02 00:00:00.000Z')));

    // Newest first under the default sort, and the total stays honest.
    await waitFor(() =>
      expect(result.current.itemsForPage(1).map((i) => i.id)).toEqual([
        'b',
        'a',
      ])
    );
    expect(result.current.totalItems).toBe(2);
    expect(getList).toHaveBeenCalledTimes(settled);
  });

  it('drops a record whose edit moved it out of the active search', async () => {
    const { result } = await renderSettled({ userId: 'u1', q: 'a' });

    act(() =>
      emit('update', {
        ...A,
        itemLabel: 'zzz',
        updated: '2026-08-03 00:00:00.000Z',
      })
    );

    await waitFor(() => expect(result.current.itemsForPage(1)).toEqual([]));
    expect(result.current.totalItems).toBe(0);
  });

  it('ignores the echo of a write already in the cache', async () => {
    const { result } = await renderSettled({ userId: 'u1' });
    const before = result.current.itemsForPage(1);

    await act(async () => {
      emit('update', { ...A });
    });

    // Same reference: the merge was a no-op, so no observer was notified.
    expect(result.current.itemsForPage(1)).toBe(before);
  });

  it('does not resubscribe while the search is being typed', async () => {
    const { rerender } = await renderSettled({ userId: 'u1', q: '' });

    rerender({ userId: 'u1', q: 'dri' });
    rerender({ userId: 'u1', q: 'drill' });
    await waitFor(() => expect(getList.mock.calls.length).toBeGreaterThan(2));

    // The feed's identity is the user, not the query.
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('releases the subscription on unmount', async () => {
    const { unmount } = await renderSettled({ userId: 'u1' });

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('stays unsubscribed until there is a signed-in user', async () => {
    renderHook(() => useItemsInfinite({ userId: null }), {
      wrapper: liveWrapper,
    });

    await waitFor(() => expect(getList).not.toHaveBeenCalled());
    expect(subscribe).not.toHaveBeenCalled();
  });
});

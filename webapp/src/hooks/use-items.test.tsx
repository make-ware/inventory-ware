import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getList = vi.fn();
const getOne = vi.fn();

vi.mock('@/lib/pocketbase-client', () => ({
  default: {
    collection: () => ({ getList, getOne }),
    files: { getURL: () => 'http://localhost:8090/file.png' },
  },
}));

import {
  useItemsInfinite,
  useItemCategories,
  useItem,
  useAllItems,
} from './use-items';
import { qk } from '@/lib/query';

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

describe('useItemCategories', () => {
  beforeEach(() => {
    getList.mockReset();
  });

  it('derives the filter dropdown vocabulary from the items', async () => {
    getList.mockResolvedValue({
      page: 1,
      perPage: 5000,
      totalItems: 2,
      totalPages: 1,
      items: [
        {
          id: 'a',
          categoryFunctional: 'lighting',
          categorySpecific: 'lamps',
          itemType: 'desk-lamp',
        },
        {
          id: 'b',
          categoryFunctional: 'lighting',
          categorySpecific: 'bulbs',
          itemType: 'led',
        },
      ],
    });

    const { result } = renderHook(() => useItemCategories('u1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.categories).toEqual({
      functional: ['lighting'],
      specific: ['bulbs', 'lamps'],
      itemType: ['desk-lamp', 'led'],
    });
  });

  it('reports an empty library before the query has run', () => {
    const { result } = renderHook(() => useItemCategories(null), { wrapper });

    expect(getList).not.toHaveBeenCalled();
    expect(result.current.categories).toEqual({
      functional: [],
      specific: [],
      itemType: [],
    });
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

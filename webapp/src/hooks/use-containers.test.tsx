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
  useContainersInfinite,
  useContainer,
  useItemsByContainer,
} from './use-containers';
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

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** The `options` argument of the most recent `collection.getList()` call. */
function lastListOptions() {
  return getList.mock.calls.at(-1)?.[2] ?? {};
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  getList.mockReset();
  getOne.mockReset();
});

describe('useContainersInfinite', () => {
  beforeEach(() => {
    getList.mockResolvedValue(makePage(1, 1, ['a', 'b']));
  });

  it('asks PocketBase for one page of CONTAINERS_PER_PAGE rows', async () => {
    const { result } = renderHook(
      () => useContainersInfinite({ userId: 'u1', sort: '+containerLabel' }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.pages).toHaveLength(1));

    expect(getList).toHaveBeenCalledTimes(1);
    expect(getList.mock.calls[0].slice(0, 2)).toEqual([1, 12]);
    expect(lastListOptions()).toMatchObject({
      sort: '+containerLabel',
      expand: 'ImageRef',
    });
    expect(result.current.containersForPage(1).map((c) => c.id)).toEqual([
      'a',
      'b',
    ]);
    // The totals come from the server envelope, not from a client-side slice.
    expect(result.current.totalPages).toBe(1);
    expect(result.current.totalItems).toBe(12);
  });

  it('lets the mutator escape the search text instead of interpolating it', async () => {
    const { result } = renderHook(
      () => useContainersInfinite({ userId: 'u1', q: 'ha"ck' }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.pages).toHaveLength(1));

    expect(lastListOptions().filter).toContain('ha\\"ck');
  });

  it('walks forward one server page at a time', async () => {
    getList.mockResolvedValueOnce(makePage(1, 2, ['a']));
    getList.mockResolvedValueOnce(makePage(2, 2, ['b']));

    const { result } = renderHook(
      () => useContainersInfinite({ userId: 'u1' }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await act(async () => {
      await result.current.fetchNextPage();
    });

    await waitFor(() => expect(result.current.pages).toHaveLength(2));

    expect(getList.mock.calls[1][0]).toBe(2);
    expect(result.current.containersForPage(2).map((c) => c.id)).toEqual(['b']);
    expect(result.current.hasNextPage).toBe(false);
    // A page that was never requested reads as empty, not as a crash.
    expect(result.current.containersForPage(9)).toEqual([]);
  });

  it('stays idle until there is an authenticated user', async () => {
    const { result } = renderHook(
      () => useContainersInfinite({ userId: null }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(getList).not.toHaveBeenCalled();
    expect(result.current.pages).toEqual([]);
  });

  it('withholds a search PocketBase cannot parse rather than 400ing', async () => {
    const { result } = renderHook(
      () => useContainersInfinite({ userId: 'u1', q: 'C:\\' }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.isRejectedQuery).toBe(true));
    expect(getList).not.toHaveBeenCalled();
    expect(result.current.containersForPage(1)).toEqual([]);
  });
});

describe('useContainer', () => {
  it('fetches the container with its image expanded', async () => {
    getOne.mockResolvedValue({ id: 'c1', containerLabel: 'Bin' });

    const { result } = renderHook(() => useContainer('c1'), { wrapper });

    await waitFor(() => expect(result.current.container?.id).toBe('c1'));
    expect(getOne.mock.calls[0][0]).toBe('c1');
    expect(getOne.mock.calls[0][1]).toMatchObject({ expand: 'ImageRef' });
  });

  it('paints from a cached list page instead of refetching', async () => {
    client.setQueryData(
      qk.containersInfinite('u1', { q: '', sort: '-created' }),
      {
        pages: [makePage(1, 1, ['c1'])],
        pageParams: [1],
      }
    );

    const { result } = renderHook(() => useContainer('c1'), { wrapper });

    // Seeded synchronously — no pending state, no request in flight.
    expect(result.current.container?.id).toBe('c1');
    expect(result.current.isPending).toBe(false);
  });

  it('reports an id PocketBase has no record for as missing, not as an error', async () => {
    getOne.mockRejectedValue(
      Object.assign(new Error('Not found'), { status: 404 })
    );

    const { result } = renderHook(() => useContainer('gone'), { wrapper });

    await waitFor(() => expect(result.current.isMissing).toBe(true));
    expect(result.current.isError).toBe(false);
    expect(result.current.container).toBeNull();
  });

  it('stays idle without an id', async () => {
    const { result } = renderHook(() => useContainer(undefined), { wrapper });

    await waitFor(() => expect(result.current.container).toBeNull());
    expect(getOne).not.toHaveBeenCalled();
  });
});

describe('useItemsByContainer', () => {
  it('filters through the mutator and reports the server total', async () => {
    getList.mockResolvedValue({
      page: 1,
      perPage: 100,
      totalItems: 3,
      totalPages: 1,
      items: [{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }],
    });

    const { result } = renderHook(() => useItemsByContainer('c1'), { wrapper });

    await waitFor(() => expect(result.current.items).toHaveLength(3));
    expect(lastListOptions()).toMatchObject({ expand: 'ImageRef' });
    expect(lastListOptions().filter).toContain('ContainerRef="c1"');
    expect(result.current.totalItems).toBe(3);
  });

  it('stays idle without a container id', async () => {
    const { result } = renderHook(() => useItemsByContainer(null), {
      wrapper,
    });

    await waitFor(() => expect(result.current.items).toEqual([]));
    expect(getList).not.toHaveBeenCalled();
  });
});

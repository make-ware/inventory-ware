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

import {
  useContainersInfinite,
  useContainer,
  useItemsByContainer,
  useContainersByImage,
} from './use-containers';

beforeEach(() => {
  handlers.length = 0;
  subscribe.mockClear();
  unsubscribe.mockClear();
});
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

describe('useContainersByImage', () => {
  it('filters through the mutator, never a string built here', async () => {
    getList.mockResolvedValue({
      page: 1,
      perPage: 100,
      totalItems: 1,
      totalPages: 1,
      items: [{ id: 'c1' }],
    });

    const { result } = renderHook(() => useContainersByImage('img1'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.containers).toHaveLength(1));
    expect(lastListOptions().filter).toContain('ImageRef="img1"');
    expect(result.current.totalItems).toBe(1);
  });

  it('stays idle without an image id', async () => {
    const { result } = renderHook(() => useContainersByImage(undefined), {
      wrapper,
    });

    await waitFor(() => expect(result.current.containers).toEqual([]));
    expect(getList).not.toHaveBeenCalled();
  });
});

describe('useContainersInfinite — realtime', () => {
  let client: QueryClient;

  function liveWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }

  const container = (id: string, created: string, extra = {}) => ({
    id,
    created,
    updated: created,
    UserRef: 'u1',
    containerLabel: id,
    containerNotes: '',
    ...extra,
  });

  const A = container('a', '2026-08-01 00:00:00.000Z');

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    getList.mockReset();
    getList.mockResolvedValue({
      page: 1,
      perPage: 12,
      totalItems: 1,
      totalPages: 1,
      items: [A],
    });
  });

  async function renderSettled() {
    const view = renderHook(() => useContainersInfinite({ userId: 'u1' }), {
      wrapper: liveWrapper,
    });
    await waitFor(() => {
      expect(view.result.current.pages).toHaveLength(1);
      expect(view.result.current.isFetching).toBe(false);
    });
    return view;
  }

  it('subscribes to the Containers collection scoped to the signed-in user', async () => {
    await renderSettled();

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(subscribe.mock.calls[0][2]).toMatchObject({
      filter: 'UserRef="u1"',
      expand: 'ImageRef',
    });
  });

  it("folds another client's write into the cached page instead of refetching", async () => {
    const { result } = await renderSettled();
    const settled = getList.mock.calls.length;

    act(() => emit('create', container('b', '2026-08-02 00:00:00.000Z')));

    await waitFor(() =>
      expect(result.current.containersForPage(1).map((c) => c.id)).toEqual([
        'b',
        'a',
      ])
    );
    expect(result.current.totalItems).toBe(2);
    expect(getList).toHaveBeenCalledTimes(settled);
  });

  it('removes a container another client deleted and keeps the total honest', async () => {
    const { result } = await renderSettled();

    act(() => emit('delete', A));

    await waitFor(() =>
      expect(result.current.containersForPage(1)).toEqual([])
    );
    expect(result.current.totalItems).toBe(0);
  });
});

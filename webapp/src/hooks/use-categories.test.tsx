import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const getList = vi.fn();

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
    collection: () => ({ getList, subscribe }),
  },
}));

import { useCategoryLibrary } from './use-categories';

beforeEach(() => {
  handlers.length = 0;
  subscribe.mockClear();
  unsubscribe.mockClear();
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useCategoryLibrary', () => {
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

    const { result } = renderHook(() => useCategoryLibrary('u1'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.categories).toEqual({
      functional: ['lighting'],
      specific: ['bulbs', 'lamps'],
      itemType: ['desk-lamp', 'led'],
    });
  });

  it('reports an empty library before the query has run', () => {
    const { result } = renderHook(() => useCategoryLibrary(null), { wrapper });

    expect(getList).not.toHaveBeenCalled();
    expect(result.current.categories).toEqual({
      functional: [],
      specific: [],
      itemType: [],
    });
  });
});

describe('useCategoryLibrary — realtime', () => {
  let client: QueryClient;

  function liveWrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }

  const library = (itemType: string) => ({
    page: 1,
    perPage: 5000,
    totalItems: 1,
    totalPages: 1,
    items: [
      {
        id: 'a',
        categoryFunctional: 'lighting',
        categorySpecific: 'lamps',
        itemType,
      },
    ],
  });

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    getList.mockReset();
    getList.mockResolvedValue(library('desk-lamp'));
  });

  it('re-reads the vocabulary when an item changes', async () => {
    const { result } = renderHook(() => useCategoryLibrary('u1'), {
      wrapper: liveWrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(subscribe).toHaveBeenCalledTimes(1);

    // Whether a category is still in use is a fact about every item, so this
    // is the one live surface that answers an event with a refetch.
    getList.mockResolvedValue(library('floor-lamp'));
    act(() => emit('update', { id: 'a', itemType: 'floor-lamp' }));

    await waitFor(() =>
      expect(result.current.categories.itemType).toEqual(['floor-lamp'])
    );
  });

  it('does not subscribe without an authenticated user', () => {
    renderHook(() => useCategoryLibrary(null), { wrapper: liveWrapper });

    expect(subscribe).not.toHaveBeenCalled();
  });
});

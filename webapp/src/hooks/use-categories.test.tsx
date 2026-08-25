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

import { useCategoryLibrary } from './use-categories';

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

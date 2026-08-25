import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ListResult } from 'pocketbase';

const itemsService = { getList: vi.fn(), update: vi.fn() };
const containersService = { create: vi.fn(), update: vi.fn(), delete: vi.fn() };
/** Every PocketBase call in order, so "detach, then delete" is assertable. */
const calls: string[] = [];

vi.mock('@/lib/pocketbase-client', () => ({
  default: {
    collection: (name: string) =>
      name === 'Items' ? itemsService : containersService,
  },
}));

import {
  useDeleteContainer,
  useUpdateContainer,
} from './use-container-mutations';
import { qk } from '@/lib/query';

interface Row {
  id: string;
  containerLabel?: string;
  ContainerRef?: string;
  updated: string;
}

const LIST_OPTIONS = { q: '', sort: '-created' };

function row(id: string, containerLabel = id): Row {
  return { id, containerLabel, updated: '2026-08-25 10:00:00.000Z' };
}

function page(items: Row[], totalItems = items.length): ListResult<Row> {
  return { page: 1, perPage: 12, totalItems, totalPages: 1, items };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function listIds() {
  return client
    .getQueryData<{ pages: ListResult<Row>[] }>(
      qk.containersInfinite('u1', LIST_OPTIONS)
    )!
    .pages[0].items.map((item) => item.id);
}

beforeEach(() => {
  calls.length = 0;
  itemsService.getList.mockReset();
  itemsService.update.mockReset();
  containersService.delete.mockReset();
  containersService.update.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});

  itemsService.getList.mockImplementation(async () => {
    calls.push('items.getList');
    return {
      page: 1,
      perPage: 200,
      totalItems: 2,
      totalPages: 1,
      items: [{ id: 'i1' }, { id: 'i2' }],
    };
  });
  itemsService.update.mockImplementation(async (id: string) => {
    calls.push(`items.update:${id}`);
    return { id };
  });
  containersService.delete.mockImplementation(async () => {
    calls.push('containers.delete');
    return true;
  });

  // Seeded rather than observed, so no `gcTime: 0` — see use-item-mutations.
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  client.setQueryData(qk.containersInfinite('u1', LIST_OPTIONS), {
    pages: [page([row('c1'), row('c2')], 5)],
    pageParams: [1],
  });
  client.setQueryData(qk.containerById('c1'), row('c1'));
});

describe('useDeleteContainer', () => {
  it('detaches every item before deleting the container', async () => {
    const { result } = renderHook(() => useDeleteContainer(), { wrapper });
    act(() => {
      result.current.mutate('c1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // PocketBase does not cascade: deleting first would leave both items
    // pointing at a container that no longer exists.
    expect(calls).toEqual([
      'items.getList',
      'items.update:i1',
      'items.update:i2',
      'containers.delete',
    ]);
    // An undefined field never reaches the JSON body, so the relation has to
    // be cleared with an empty string.
    expect(itemsService.update).toHaveBeenCalledWith('i1', {
      ContainerRef: '',
    });
  });

  it('reads all of the container before writing any of it', async () => {
    itemsService.getList.mockImplementation(async (page: number) => {
      calls.push(`items.getList:${page}`);
      return {
        page,
        perPage: 200,
        totalItems: 3,
        totalPages: 2,
        items: page === 1 ? [{ id: 'i1' }, { id: 'i2' }] : [{ id: 'i3' }],
      };
    });

    const { result } = renderHook(() => useDeleteContainer(), { wrapper });
    act(() => {
      result.current.mutate('c1');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Detaching as it pages would skip rows: an item that loses its
    // `ContainerRef` leaves the filter, sliding the rest forward a page.
    expect(calls.slice(0, 2)).toEqual(['items.getList:1', 'items.getList:2']);
    expect(itemsService.update).toHaveBeenCalledTimes(3);
  });

  it('removes the card on the click and evicts the detail key on success', async () => {
    const gate = deferred<boolean>();
    containersService.delete.mockReturnValue(gate.promise);

    const { result } = renderHook(() => useDeleteContainer(), { wrapper });
    act(() => {
      result.current.mutate('c1');
    });

    await waitFor(() => expect(listIds()).toEqual(['c2']));
    expect(client.getQueryData(qk.containerById('c1'))).toEqual(row('c1'));

    gate.resolve(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(qk.containerById('c1'))).toBeUndefined();
  });

  it('puts the container back when the delete fails', async () => {
    containersService.delete.mockRejectedValue(new Error('403'));

    const { result } = renderHook(() => useDeleteContainer(), { wrapper });
    act(() => {
      result.current.mutate('c1');
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Failed to delete container');
    expect(listIds()).toEqual(['c1', 'c2']);
  });
});

describe('useUpdateContainer', () => {
  it('shows the edit before the request resolves and rolls it back on failure', async () => {
    const gate = deferred<Row>();
    containersService.update.mockReturnValue(gate.promise);

    const { result } = renderHook(() => useUpdateContainer(), { wrapper });
    act(() => {
      result.current.mutate({ id: 'c1', data: { containerLabel: 'edited' } });
    });

    await waitFor(() =>
      expect(
        client.getQueryData<Row>(qk.containerById('c1'))?.containerLabel
      ).toBe('edited')
    );

    gate.reject(new Error('validation failed'));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData<Row>(qk.containerById('c1'))).toEqual(row('c1'));
  });
});

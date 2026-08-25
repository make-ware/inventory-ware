import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ListResult } from 'pocketbase';

const create = vi.fn();
const update = vi.fn();
const remove = vi.fn();

vi.mock('@/lib/pocketbase-client', () => ({
  default: {
    collection: () => ({ create, update, delete: remove }),
  },
}));

import {
  useBulkDeleteItems,
  useBulkUpdateItems,
  useDeleteItem,
  useRemoveItemFromContainer,
  useUpdateItem,
} from './use-item-mutations';
import { qk } from '@/lib/query';

interface Row {
  id: string;
  itemLabel: string;
  ContainerRef?: string;
  updated: string;
}

const LIST_OPTIONS = { q: '', filters: {}, sort: '-created' };

function row(id: string, itemLabel = id, ContainerRef?: string): Row {
  return { id, itemLabel, ContainerRef, updated: '2026-08-25 10:00:00.000Z' };
}

function page(items: Row[], totalItems = items.length): ListResult<Row> {
  return { page: 1, perPage: 12, totalItems, totalPages: 1, items };
}

/** A promise plus the handle to settle it, so a test controls when a write lands. */
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
      qk.itemsInfinite('u1', LIST_OPTIONS)
    )!
    .pages[0].items.map((item) => item.id);
}

function listRow(id: string) {
  return client
    .getQueryData<{ pages: ListResult<Row>[] }>(
      qk.itemsInfinite('u1', LIST_OPTIONS)
    )!
    .pages[0].items.find((item) => item.id === id);
}

beforeEach(() => {
  create.mockReset();
  update.mockReset();
  remove.mockReset();
  // The mutator layer logs every rejection itself; the tests below provoke
  // several deliberately.
  vi.spyOn(console, 'error').mockImplementation(() => {});

  // No `gcTime: 0` here: these entries are seeded rather than observed, and a
  // zero collection time would sweep them before the mutation could patch them.
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  client.setQueryData(qk.itemsInfinite('u1', LIST_OPTIONS), {
    pages: [page([row('a'), row('b')], 30)],
    pageParams: [1],
  });
  client.setQueryData(qk.itemById('a'), row('a'));
});

describe('useDeleteItem', () => {
  it('drops the row before the request resolves', async () => {
    const gate = deferred<boolean>();
    remove.mockReturnValue(gate.promise);

    const { result } = renderHook(() => useDeleteItem(), { wrapper });
    act(() => {
      result.current.mutate('a');
    });

    await waitFor(() => expect(listIds()).toEqual(['b']));
    // "Showing X of Y" has to shrink with the row, not wait for a refetch.
    expect(
      client.getQueryData<{ pages: ListResult<Row>[] }>(
        qk.itemsInfinite('u1', LIST_OPTIONS)
      )!.pages[0].totalItems
    ).toBe(29);

    gate.resolve(true);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The record is gone, so its detail key is evicted rather than refetched.
    expect(client.getQueryData(qk.itemById('a'))).toBeUndefined();
  });

  it('puts the row back when the delete fails', async () => {
    // PocketBase rejects, and `BaseMutator.delete` answers `false` for it —
    // which a mutation would otherwise read as a success.
    remove.mockRejectedValue(new Error('403'));

    const { result } = renderHook(() => useDeleteItem(), { wrapper });
    act(() => {
      result.current.mutate('a');
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Failed to delete item');
    expect(listIds()).toEqual(['a', 'b']);
    expect(client.getQueryData<Row>(qk.itemById('a'))).toEqual(row('a'));
  });
});

describe('useBulkDeleteItems', () => {
  it('drops the whole selection at once and restores it together', async () => {
    // One delete succeeds and the other is held open, so the failure lands
    // after the optimistic removal is observable rather than racing it.
    const gate = deferred<boolean>();
    remove.mockResolvedValueOnce(true).mockReturnValueOnce(gate.promise);

    const { result } = renderHook(() => useBulkDeleteItems(), { wrapper });
    act(() => {
      result.current.mutate(['a', 'b']);
    });

    await waitFor(() => expect(listIds()).toEqual([]));

    gate.reject(new Error('403'));
    await waitFor(() => expect(result.current.isError).toBe(true));
    // A partial rollback would need a per-id record of what actually happened;
    // the invalidation that follows re-reads the truth either way.
    expect(listIds()).toEqual(['a', 'b']);
  });
});

describe('useUpdateItem', () => {
  it('shows the edit in the list and the detail entry immediately', async () => {
    const gate = deferred<Row>();
    update.mockReturnValue(gate.promise);

    const { result } = renderHook(() => useUpdateItem(), { wrapper });
    act(() => {
      result.current.mutate({ id: 'a', data: { itemLabel: 'edited' } });
    });

    await waitFor(() => expect(listRow('a')?.itemLabel).toBe('edited'));
    expect(client.getQueryData<Row>(qk.itemById('a'))?.itemLabel).toBe(
      'edited'
    );

    gate.resolve(row('a', 'edited'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('rolls the edit back when the write is refused', async () => {
    update.mockRejectedValue(new Error('validation failed'));

    const { result } = renderHook(() => useUpdateItem(), { wrapper });
    act(() => {
      result.current.mutate({ id: 'a', data: { itemLabel: 'edited' } });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(listRow('a')?.itemLabel).toBe('a');
    expect(client.getQueryData<Row>(qk.itemById('a'))?.itemLabel).toBe('a');
  });
});

describe('useBulkUpdateItems', () => {
  it('patches every selected row', async () => {
    update.mockImplementation(async (id: string) => row(id, 'edited'));

    const { result } = renderHook(() => useBulkUpdateItems(), { wrapper });
    act(() => {
      result.current.mutate({ ids: ['a', 'b'], data: { itemLabel: 'edited' } });
    });

    await waitFor(() =>
      expect(listIds().map((id) => listRow(id)?.itemLabel)).toEqual([
        'edited',
        'edited',
      ])
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(update).toHaveBeenCalledTimes(2);
  });
});

describe('useRemoveItemFromContainer', () => {
  beforeEach(() => {
    client.setQueryData(qk.itemsByContainer('c1'), page([row('a', 'a', 'c1')]));
    client.setQueryData(qk.itemsInfinite('u1', LIST_OPTIONS), {
      pages: [page([row('a', 'a', 'c1'), row('b')], 30)],
      pageParams: [1],
    });
  });

  it('clears the relation with an empty string, not undefined', async () => {
    update.mockResolvedValue(row('a'));

    const { result } = renderHook(() => useRemoveItemFromContainer(), {
      wrapper,
    });
    act(() => {
      result.current.mutate({ itemId: 'a', containerId: 'c1' });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // An undefined field never reaches PocketBase's JSON body, so it would
    // leave the item filed exactly where it was.
    expect(update).toHaveBeenCalledWith('a', { ContainerRef: '' });
  });

  it('takes the card out of the container list and patches it elsewhere', async () => {
    const gate = deferred<Row>();
    update.mockReturnValue(gate.promise);

    const { result } = renderHook(() => useRemoveItemFromContainer(), {
      wrapper,
    });
    act(() => {
      result.current.mutate({ itemId: 'a', containerId: 'c1' });
    });

    await waitFor(() =>
      expect(
        client.getQueryData<ListResult<Row>>(qk.itemsByContainer('c1'))!.items
      ).toEqual([])
    );
    expect(listRow('a')?.ContainerRef).toBe('');

    gate.resolve(row('a'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('restores both when the write fails', async () => {
    update.mockRejectedValue(new Error('403'));

    const { result } = renderHook(() => useRemoveItemFromContainer(), {
      wrapper,
    });
    act(() => {
      result.current.mutate({ itemId: 'a', containerId: 'c1' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(
      client
        .getQueryData<ListResult<Row>>(qk.itemsByContainer('c1'))!
        .items.map((item) => item.id)
    ).toEqual(['a']);
    expect(listRow('a')?.ContainerRef).toBe('c1');
  });
});

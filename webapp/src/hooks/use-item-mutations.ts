'use client';

/**
 * The item write path: one `useMutation` per operation, each patching the query
 * cache before the request leaves and invalidating what it touched once the
 * request lands.
 *
 * Nothing here refetches a list by hand. A write used to end with "drop
 * everything and read the page again", which cost a round trip before the
 * screen could change and repainted rows that had not moved; now the cache is
 * edited in place (see `@/lib/query/mutations` for the merge rules and why they
 * are not the realtime merges), the UI follows immediately, and the
 * invalidation that runs on success is what makes the server the final word.
 * The SSE echo of the same write is a second route to that correction, so an
 * event that arrives late — or not at all — changes nothing.
 *
 * Failure rolls back: `onMutate` snapshots every key it is about to touch and
 * `onError` puts the snapshot back, so a rejected write leaves the screen
 * exactly as it was rather than showing a row that no longer exists.
 *
 * Creates are deliberately *not* optimistic. There is no id, no `created`
 * stamp and no server-side defaulting to guess at before the record exists, and
 * every create in this app navigates to the record it just made — so an
 * inserted placeholder would be replaced by the real row a moment later without
 * anyone seeing it.
 */
import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { ItemMutator } from '@project/shared';
import type { Item, ItemInput } from '@project/shared';
import pb from '@/lib/pocketbase-client';
import {
  cancelAndSnapshot,
  dropCachedRecords,
  invalidateItemCaches,
  itemCacheFilters,
  patchCachedRecords,
  qk,
  restoreQueries,
  type CacheSnapshot,
} from '@/lib/query';
import { BULK_CONCURRENCY, mapWithConcurrency } from '@/lib/concurrency';

/** Fields an item write may set; `UserRef` is fixed at creation. */
export type ItemPatch = Partial<Omit<ItemInput, 'UserRef'>>;

export interface UpdateItemVariables {
  id: string;
  data: ItemPatch;
}

export interface BulkUpdateItemsVariables {
  ids: readonly string[];
  data: ItemPatch;
}

export interface ItemContainerVariables {
  itemId: string;
  containerId: string;
}

/** What `onMutate` hands `onError` so a failed write can be undone. */
interface OptimisticContext {
  previous: CacheSnapshot;
}

/**
 * `BaseMutator.delete` answers `false` for a rejected delete instead of
 * throwing, which would reach a mutation as a success: the row would stay
 * optimistically removed and the caller would announce a delete that never
 * happened. Turn it back into a rejection so `onError` rolls it back.
 */
async function deletedOrThrow(
  deleting: Promise<boolean>,
  message: string
): Promise<true> {
  if (!(await deleting)) throw new Error(message);
  return true;
}

/** Cancel, snapshot, then merge `patch` into every cached copy of `ids`. */
async function beginPatch(
  queryClient: QueryClient,
  ids: readonly string[],
  patch: Partial<Item>
): Promise<OptimisticContext> {
  const filters = itemCacheFilters(ids);
  const previous = await cancelAndSnapshot(queryClient, filters);
  patchCachedRecords<Item>(queryClient, filters, ids, patch);
  return { previous };
}

/**
 * Cancel, snapshot, then drop `ids` from the cached lists.
 *
 * Only the lists: a detail key for a record that is going away is evicted once
 * the delete succeeds, because a page still mounted on it would read an
 * optimistic `null` as "this record does not exist".
 */
async function beginDrop(
  queryClient: QueryClient,
  ids: readonly string[]
): Promise<OptimisticContext> {
  const filters = itemCacheFilters();
  const previous = await cancelAndSnapshot(queryClient, filters);
  dropCachedRecords<Item>(queryClient, filters, ids);
  return { previous };
}

function rollback(
  queryClient: QueryClient,
  context: OptimisticContext | undefined
): void {
  if (context) restoreQueries(queryClient, context.previous);
}

/** A memoised `ItemMutator` over the shared client. */
function useItemMutator(): ItemMutator {
  return useMemo(() => new ItemMutator(pb), []);
}

/** Create an item. Callers supply `UserRef`; see the note on creates above. */
export function useCreateItem() {
  const queryClient = useQueryClient();
  const itemMutator = useItemMutator();

  return useMutation({
    mutationFn: (input: ItemInput) => itemMutator.create(input),
    onSuccess: (item) => invalidateItemCaches(queryClient, [item.id]),
  });
}

/** Edit one item, in place in every list and detail entry holding it. */
export function useUpdateItem() {
  const queryClient = useQueryClient();
  const itemMutator = useItemMutator();

  return useMutation({
    mutationFn: ({ id, data }: UpdateItemVariables) =>
      itemMutator.update(id, data),
    onMutate: ({ id, data }) =>
      beginPatch(queryClient, [id], data as Partial<Item>),
    onError: (_error, _variables, context) => rollback(queryClient, context),
    onSuccess: (_item, { id }) => invalidateItemCaches(queryClient, [id]),
  });
}

/** Delete one item; it leaves the visible lists before the request returns. */
export function useDeleteItem() {
  const queryClient = useQueryClient();
  const itemMutator = useItemMutator();

  return useMutation({
    mutationFn: (id: string) =>
      deletedOrThrow(itemMutator.delete(id), 'Failed to delete item'),
    onMutate: (id) => beginDrop(queryClient, [id]),
    onError: (_error, _id, context) => rollback(queryClient, context),
    onSuccess: (_deleted, id) => {
      // Evict rather than invalidate: the record is gone, so refetching its
      // detail key would only produce a 404.
      queryClient.removeQueries({ queryKey: qk.itemById(id), exact: true });
      return invalidateItemCaches(queryClient);
    },
  });
}

/**
 * Delete a selection of items.
 *
 * The whole selection disappears on the click and comes back together if any
 * one of the deletes fails — a partial rollback would need a per-id record of
 * what actually happened, and the invalidation that follows re-reads the truth
 * either way.
 */
export function useBulkDeleteItems() {
  const queryClient = useQueryClient();
  const itemMutator = useItemMutator();

  return useMutation({
    mutationFn: (ids: readonly string[]) =>
      mapWithConcurrency(ids, BULK_CONCURRENCY, (id) =>
        deletedOrThrow(itemMutator.delete(id), 'Failed to delete item')
      ),
    onMutate: (ids) => beginDrop(queryClient, ids),
    onError: (_error, _ids, context) => rollback(queryClient, context),
    onSuccess: (_deleted, ids) => {
      for (const id of ids) {
        queryClient.removeQueries({ queryKey: qk.itemById(id), exact: true });
      }
      return invalidateItemCaches(queryClient);
    },
  });
}

/** Apply the same edit to a selection of items (the bulk edit dialog). */
export function useBulkUpdateItems() {
  const queryClient = useQueryClient();
  const itemMutator = useItemMutator();

  return useMutation({
    mutationFn: ({ ids, data }: BulkUpdateItemsVariables) =>
      mapWithConcurrency(ids, BULK_CONCURRENCY, (id) =>
        itemMutator.update(id, data)
      ),
    onMutate: ({ ids, data }) =>
      beginPatch(queryClient, ids, data as Partial<Item>),
    onError: (_error, _variables, context) => rollback(queryClient, context),
    onSuccess: (_items, { ids }) => invalidateItemCaches(queryClient, ids),
  });
}

/**
 * File an item under a container.
 *
 * The optimistic half is the item's own `ContainerRef`, which is what the
 * container page's picker filters on, so the item leaves the "add" dropdown at
 * once. It appears in the container's item list on the invalidation below
 * rather than being inserted here: that list is a server-ordered window, and
 * where a row belongs in it is the server's answer to give.
 */
export function useAddItemToContainer() {
  const queryClient = useQueryClient();
  const itemMutator = useItemMutator();

  return useMutation({
    mutationFn: ({ itemId, containerId }: ItemContainerVariables) =>
      itemMutator.update(itemId, { ContainerRef: containerId }),
    onMutate: ({ itemId, containerId }) =>
      beginPatch(queryClient, [itemId], { ContainerRef: containerId }),
    onError: (_error, _variables, context) => rollback(queryClient, context),
    onSuccess: (_item, { itemId }) =>
      invalidateItemCaches(queryClient, [itemId]),
  });
}

/**
 * Take an item out of its container.
 *
 * `ContainerRef` is cleared with an empty string, not `undefined`: an
 * undefined field is absent from the JSON body PocketBase receives, so it would
 * leave the relation exactly as it was.
 */
export function useRemoveItemFromContainer() {
  const queryClient = useQueryClient();
  const itemMutator = useItemMutator();

  return useMutation({
    mutationFn: ({ itemId }: ItemContainerVariables) =>
      itemMutator.update(itemId, { ContainerRef: '' }),
    onMutate: async ({ itemId, containerId }) => {
      const context = await beginPatch(queryClient, [itemId], {
        ContainerRef: '',
      });
      // The container's own list is the one place the row should not merely
      // change but leave, so the card goes with the click. The snapshot above
      // covers this key too — it is under the same `items` prefix.
      dropCachedRecords<Item>(
        queryClient,
        [{ queryKey: qk.itemsByContainer(containerId), exact: true }],
        [itemId]
      );
      return context;
    },
    onError: (_error, _variables, context) => rollback(queryClient, context),
    onSuccess: (_item, { itemId }) =>
      invalidateItemCaches(queryClient, [itemId]),
  });
}

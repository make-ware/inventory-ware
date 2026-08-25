'use client';

/**
 * The container write path, built the same way as `@/hooks/use-item-mutations`:
 * patch the cache, run the request, invalidate what moved, roll back on
 * failure. Read that module's header for the reasoning — this one only differs
 * where containers do.
 *
 * Where they differ is deletion. A container is the target of every
 * `Items.ContainerRef` pointing at it, and PocketBase does not cascade, so
 * deleting the record alone would leave those items holding a relation to
 * nothing. Every delete here therefore detaches first and deletes second, and
 * the detach is the part that has to be complete: it reads *all* of the
 * container's items before writing any of them, because each write removes a
 * row from the very filter the pages are being read through.
 */
import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { ContainerMutator, ItemMutator } from '@project/shared';
import type { Container, ContainerInput, Item } from '@project/shared';
import pb from '@/lib/pocketbase-client';
import {
  cancelAndSnapshot,
  containerCacheFilters,
  dropCachedRecords,
  invalidateContainerCaches,
  invalidateItemCaches,
  patchCachedRecords,
  qk,
  restoreQueries,
  type CacheSnapshot,
} from '@/lib/query';
import { BULK_CONCURRENCY, mapWithConcurrency } from '@/lib/concurrency';

/** Fields a container write may set; `UserRef` is fixed at creation. */
export type ContainerPatch = Partial<Omit<ContainerInput, 'UserRef'>>;

export interface UpdateContainerVariables {
  id: string;
  data: ContainerPatch;
}

/** What `onMutate` hands `onError` so a failed write can be undone. */
interface OptimisticContext {
  previous: CacheSnapshot;
}

/** Rows read per request while collecting a container's items to detach. */
const DETACH_PAGE_SIZE = 200;

/**
 * `BaseMutator.delete` answers `false` for a rejected delete instead of
 * throwing; see the same helper in `@/hooks/use-item-mutations`.
 */
async function deletedOrThrow(
  deleting: Promise<boolean>,
  message: string
): Promise<true> {
  if (!(await deleting)) throw new Error(message);
  return true;
}

/**
 * Every item filed under `containerId`, read to the end before anything is
 * written. Paging while detaching would skip rows: an item that loses its
 * `ContainerRef` leaves the filtered result set, sliding the rest forward a
 * page.
 */
async function readItemsInContainer(
  itemMutator: ItemMutator,
  containerId: string
): Promise<Item[]> {
  const items: Item[] = [];
  for (let page = 1; ; page++) {
    const result = await itemMutator.getByContainer(containerId, {
      page,
      perPage: DETACH_PAGE_SIZE,
    });
    items.push(...result.items);
    if (result.items.length === 0 || result.page >= result.totalPages) {
      return items;
    }
  }
}

/**
 * Detach every item, then delete the container.
 *
 * `ContainerRef` is cleared with an empty string rather than `undefined`: an
 * undefined field never reaches PocketBase's JSON body, so the relation would
 * survive the delete it was meant to be released from.
 */
async function detachAndDelete(
  itemMutator: ItemMutator,
  containerMutator: ContainerMutator,
  containerId: string
): Promise<string[]> {
  const items = await readItemsInContainer(itemMutator, containerId);
  await mapWithConcurrency(items, BULK_CONCURRENCY, (item) =>
    itemMutator.update(item.id, { ContainerRef: '' })
  );
  await deletedOrThrow(
    containerMutator.delete(containerId),
    'Failed to delete container'
  );
  return items.map((item) => item.id);
}

/** Cancel, snapshot, then drop `ids` from the cached container lists. */
async function beginDrop(
  queryClient: QueryClient,
  ids: readonly string[]
): Promise<OptimisticContext> {
  const filters = containerCacheFilters();
  const previous = await cancelAndSnapshot(queryClient, filters);
  dropCachedRecords<Container>(queryClient, filters, ids);
  return { previous };
}

function rollback(
  queryClient: QueryClient,
  context: OptimisticContext | undefined
): void {
  if (context) restoreQueries(queryClient, context.previous);
}

/**
 * Forget the deleted containers and re-read everything they touched.
 *
 * The items go too: each one that was detached on the way out now holds a
 * different `ContainerRef` than any cached copy says.
 */
function settleDeletion(
  queryClient: QueryClient,
  ids: readonly string[]
): Promise<unknown> {
  for (const id of ids) {
    // Evict rather than invalidate: the record is gone, so refetching its
    // detail key would only produce a 404.
    queryClient.removeQueries({ queryKey: qk.containerById(id), exact: true });
  }
  return Promise.all([
    invalidateContainerCaches(queryClient),
    invalidateItemCaches(queryClient),
  ]);
}

function useContainerMutator(): ContainerMutator {
  return useMemo(() => new ContainerMutator(pb), []);
}

function useDetachingItemMutator(): ItemMutator {
  return useMemo(() => new ItemMutator(pb), []);
}

/** Create a container. Callers supply `UserRef`. */
export function useCreateContainer() {
  const queryClient = useQueryClient();
  const containerMutator = useContainerMutator();

  return useMutation({
    mutationFn: (input: ContainerInput) => containerMutator.create(input),
    onSuccess: (container) =>
      invalidateContainerCaches(queryClient, [container.id]),
  });
}

/** Edit one container, in place in every list and detail entry holding it. */
export function useUpdateContainer() {
  const queryClient = useQueryClient();
  const containerMutator = useContainerMutator();

  return useMutation({
    mutationFn: ({ id, data }: UpdateContainerVariables) =>
      containerMutator.update(id, data),
    onMutate: async ({ id, data }) => {
      const filters = containerCacheFilters([id]);
      const previous = await cancelAndSnapshot(queryClient, filters);
      patchCachedRecords<Container>(
        queryClient,
        filters,
        [id],
        data as Partial<Container>
      );
      return { previous };
    },
    onError: (_error, _variables, context) => rollback(queryClient, context),
    onSuccess: (_container, { id }) =>
      invalidateContainerCaches(queryClient, [id]),
  });
}

/** Detach the container's items, then delete it. */
export function useDeleteContainer() {
  const queryClient = useQueryClient();
  const containerMutator = useContainerMutator();
  const itemMutator = useDetachingItemMutator();

  return useMutation({
    mutationFn: (id: string) =>
      detachAndDelete(itemMutator, containerMutator, id),
    onMutate: (id) => beginDrop(queryClient, [id]),
    onError: (_error, _id, context) => rollback(queryClient, context),
    onSuccess: (_detachedItemIds, id) => settleDeletion(queryClient, [id]),
  });
}

/**
 * Delete a selection of containers, each detaching its own items first.
 *
 * As with the bulk item delete, the selection disappears together and comes
 * back together: a partial rollback would need a per-container record of what
 * actually happened, and the invalidation re-reads the truth regardless.
 */
export function useBulkDeleteContainers() {
  const queryClient = useQueryClient();
  const containerMutator = useContainerMutator();
  const itemMutator = useDetachingItemMutator();

  return useMutation({
    mutationFn: (ids: readonly string[]) =>
      mapWithConcurrency(ids, BULK_CONCURRENCY, (id) =>
        detachAndDelete(itemMutator, containerMutator, id)
      ),
    onMutate: (ids) => beginDrop(queryClient, ids),
    onError: (_error, _ids, context) => rollback(queryClient, context),
    onSuccess: (_detached, ids) => settleDeletion(queryClient, ids),
  });
}

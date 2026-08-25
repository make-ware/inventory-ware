/**
 * Cache surgery shared by the write hooks (`@/hooks/use-item-mutations` and
 * `@/hooks/use-container-mutations`).
 *
 * Every mutation follows one shape: patch the cache before the request goes
 * out so the UI moves immediately, keep a snapshot to put back if the request
 * fails, then invalidate the affected keys on success so the server's copy
 * wins. The realtime echo (see `@/lib/live-list`) is a second, independent
 * route to that same correction — nothing here assumes it arrives in time, or
 * at all.
 *
 * Two things separate these patches from the SSE merges next door:
 *
 * - A local patch carries the *cached* record's `updated` stamp, because the
 *   server has not written a new one yet. `isRecordNewer` — the rule that makes
 *   the realtime merges idempotent — would therefore reject every optimistic
 *   patch, so the merges here are unconditional.
 * - Rows are patched in place, never repositioned. An edit that changes the
 *   sort key (or that moves a row out of the current filter) leaves the window
 *   briefly out of order, and the invalidation that follows — or the SSE event,
 *   whichever lands first — is what settles it. Guessing the new position would
 *   be a second implementation of the server's ORDER BY for a window that is
 *   about to be refetched anyway.
 *
 * One known transient: a local delete counts `totalItems` down, and the same
 * delete's realtime echo — arriving for a record no longer in the window —
 * counts it down a second time, so "showing X of Y" can undershoot by one until
 * the invalidation the delete fires comes back. That is the price of the row
 * leaving the grid on the click instead of a round trip later.
 *
 * Cached data comes in three shapes and every helper dispatches on the one it
 * finds: the infinite lists hold `{pages: ListResult[]}`, the unpaged lists
 * hold a single `ListResult`, and the detail queries hold one record.
 */
import type {
  QueryClient,
  QueryFilters,
  QueryKey,
} from '@tanstack/react-query';
import type { ListResult } from 'pocketbase';
import {
  removeManyFromList,
  type LiveListData,
  type LiveListRecord,
} from '@/lib/live-list';
import { qk } from '@/lib/query/keys';

/** Cache entries as they were before a mutation touched them. */
export type CacheSnapshot = [QueryKey, unknown][];

/**
 * Run a page-shaped merge against a single `ListResult`.
 *
 * One envelope is an infinite list with one page, so the merges are shared
 * rather than reimplemented — and because they return the same reference on a
 * no-op, so does this.
 */
function asOnePage<T extends LiveListRecord>(
  page: ListResult<T>,
  merge: (data: LiveListData<T>) => LiveListData<T>
): ListResult<T> {
  return merge({ pages: [page], pageParams: [page.page] }).pages[0];
}

/** Merge `patch` into the matching rows, keeping references for the rest. */
function patchPages<T extends LiveListRecord>(
  data: LiveListData<T>,
  ids: ReadonlySet<string>,
  patch: Partial<T>
): LiveListData<T> {
  let changed = false;
  const pages = data.pages.map((page) => {
    let pageChanged = false;
    const items = page.items.map((item) => {
      if (!ids.has(item.id)) return item;
      pageChanged = true;
      return { ...item, ...patch };
    });
    if (!pageChanged) return page;
    changed = true;
    return { ...page, items };
  });
  return changed ? { ...data, pages } : data;
}

function patchEntry<T extends LiveListRecord>(
  data: unknown,
  ids: ReadonlySet<string>,
  patch: Partial<T>
): unknown {
  if (!data || typeof data !== 'object') return data;

  const infinite = data as LiveListData<T>;
  if (Array.isArray(infinite.pages)) return patchPages(infinite, ids, patch);

  const envelope = data as ListResult<T>;
  if (Array.isArray(envelope.items)) {
    return asOnePage(envelope, (pages) => patchPages(pages, ids, patch));
  }

  const record = data as T;
  if (typeof record.id === 'string' && ids.has(record.id)) {
    return { ...record, ...patch };
  }
  return data;
}

function dropFromEntry<T extends LiveListRecord>(
  data: unknown,
  ids: readonly string[]
): unknown {
  if (!data || typeof data !== 'object') return data;

  const infinite = data as LiveListData<T>;
  if (Array.isArray(infinite.pages)) return removeManyFromList(infinite, ids);

  const envelope = data as ListResult<T>;
  if (Array.isArray(envelope.items)) {
    return asOnePage(envelope, (pages) => removeManyFromList(pages, ids));
  }

  // A detail entry for a deleted record is evicted once the delete lands
  // (`removeQueries`), not nulled here: a null would read as "this record does
  // not exist" to a page that is still mounted, which is what a rollback would
  // then have to undo.
  return data;
}

/**
 * Stop in-flight fetches for the keys about to be patched, then snapshot them.
 *
 * Without the cancel, a list request that was already on its way back would
 * land after the optimistic patch and overwrite it with pre-write rows.
 */
export async function cancelAndSnapshot(
  queryClient: QueryClient,
  filters: readonly QueryFilters[]
): Promise<CacheSnapshot> {
  await Promise.all(filters.map((filter) => queryClient.cancelQueries(filter)));
  return filters.flatMap((filter) => queryClient.getQueriesData(filter));
}

/** Put a snapshot back, undoing an optimistic patch whose write failed. */
export function restoreQueries(
  queryClient: QueryClient,
  snapshot: CacheSnapshot
): void {
  for (const [key, data] of snapshot) {
    queryClient.setQueryData(key, data);
  }
}

/**
 * Merge `patch` into every cached copy of `ids` under `filters`.
 *
 * Filters are expected not to overlap: a row reachable through two of them
 * would be rebuilt twice, which costs a render for no change.
 */
export function patchCachedRecords<T extends LiveListRecord>(
  queryClient: QueryClient,
  filters: readonly QueryFilters[],
  ids: readonly string[],
  patch: Partial<T>
): void {
  if (ids.length === 0) return;
  const idSet = new Set(ids);
  for (const filter of filters) {
    queryClient.setQueriesData<unknown>(filter, (data: unknown) =>
      patchEntry<T>(data, idSet, patch)
    );
  }
}

/** Drop `ids` from every cached list under `filters`, adjusting the totals. */
export function dropCachedRecords<T extends LiveListRecord>(
  queryClient: QueryClient,
  filters: readonly QueryFilters[],
  ids: readonly string[]
): void {
  if (ids.length === 0) return;
  for (const filter of filters) {
    queryClient.setQueriesData<unknown>(filter, (data: unknown) =>
      dropFromEntry<T>(data, ids)
    );
  }
}

/**
 * The item keys a write can move: every list under the `items` prefix (paged,
 * unpaged and by-container alike) plus the detail key of each record touched.
 * The two do not overlap — detail records cache under `['item', id]`.
 */
export function itemCacheFilters(ids: readonly string[] = []): QueryFilters[] {
  return [
    { queryKey: qk.itemsPrefix() },
    ...ids.map((id) => ({ queryKey: qk.itemById(id), exact: true })),
  ];
}

/** The container equivalent of `itemCacheFilters`. */
export function containerCacheFilters(
  ids: readonly string[] = []
): QueryFilters[] {
  return [
    { queryKey: qk.containersPrefix() },
    ...ids.map((id) => ({ queryKey: qk.containerById(id), exact: true })),
  ];
}

/**
 * Mark everything an item write can have changed as stale.
 *
 * The category library goes with it: its values are read off the items
 * themselves, so a create, an edit or a delete can add or retire one.
 */
export function invalidateItemCaches(
  queryClient: QueryClient,
  ids: readonly string[] = []
): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: qk.itemsPrefix() }),
    queryClient.invalidateQueries({ queryKey: qk.categoriesPrefix() }),
    ...ids.map((id) =>
      queryClient.invalidateQueries({
        queryKey: qk.itemById(id),
        exact: true,
      })
    ),
  ]);
}

/** The container equivalent of `invalidateItemCaches`. */
export function invalidateContainerCaches(
  queryClient: QueryClient,
  ids: readonly string[] = []
): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: qk.containersPrefix() }),
    ...ids.map((id) =>
      queryClient.invalidateQueries({
        queryKey: qk.containerById(id),
        exact: true,
      })
    ),
  ]);
}

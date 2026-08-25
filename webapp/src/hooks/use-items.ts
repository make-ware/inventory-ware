'use client';

/**
 * TanStack Query bindings for the Items list.
 *
 * Paging is done by PocketBase, not by slicing a client-side array: each
 * `useInfiniteQuery` page is one `Items` list request, so the cache holds
 * exactly the pages that were visited and back-navigation repaints from cache
 * instead of refetching the whole collection.
 *
 * The list is live: `useLiveInfiniteList` subscribes to the `Items` collection
 * and folds each SSE event into the cached pages, so another tab's create,
 * edit or delete lands here without a refetch. `itemSpec` below is the client
 * mirror of the filter and sort the *server* ran, and is what decides whether
 * an incoming record belongs in this window and where.
 *
 * Filters are still built in the mutator layer (see CLAUDE.md) — this module
 * hands the free-text query and the category filters to `ItemMutator.search()`
 * and never assembles a filter string itself.
 */
import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ItemMutator,
  ITEM_SEARCH_FIELDS,
  eq,
  isUnrepresentableFilterValue,
} from '@project/shared';
import type { Item } from '@project/shared';
import type { SearchFilters } from '@/components/inventory';
import pb from '@/lib/pocketbase-client';
import { qk, seedFromListCache } from '@/lib/query';
import { useLiveInfiniteList } from '@/hooks/use-live-infinite-list';
import type { LiveListSpec } from '@/lib/live-list';
import {
  buildSortSpec,
  matchesAllFields,
  matchesAnyField,
} from '@/lib/live-list-spec';

/** Page size for the items grid; also the PocketBase `perPage`. */
export const ITEMS_PER_PAGE = 12;

/** Stable empty window, so a withheld query does not hand out a new array each render. */
const EMPTY_PAGES: never[] = [];

/** Stable empty result, for the same reason. */
const EMPTY_ITEMS: Item[] = [];

export interface UseItemsInfiniteOptions {
  /** Authenticated user id; the query stays idle while this is null. */
  userId: string | null;
  /** Free-text query. Debounce before passing it in — it is part of the key. */
  q?: string;
  filters?: SearchFilters;
  sort?: string;
}

/**
 * Normalise the filter object so equivalent filter states hash to one key.
 *
 * `SearchFilter` hands back `{functional: undefined}` when a select is cleared,
 * which is the same query as `{}` but a different object; spelling every field
 * out keeps the key (and the devtools view of it) stable either way.
 */
function normaliseFilters(filters?: SearchFilters): SearchFilters {
  return {
    functional: filters?.functional || undefined,
    specific: filters?.specific || undefined,
    itemType: filters?.itemType || undefined,
  };
}

/**
 * Build the client mirror of the query `ItemMutator.search()` just ran.
 *
 * `matches` mirrors `buildSearchFilter`: the free-text query against the same
 * four fields PocketBase matches it against, then equality on each set
 * category filter. It also re-checks `UserRef`, so a record can never leak
 * across accounts even if the collection's ListRule is ever loosened.
 *
 * `compare`/`canCompare` come from the sort string, and the `id` tiebreak they
 * carry is load-bearing: `applyListEvent` reads "compares equal" as "this
 * update did not move the row".
 */
function itemSpec(
  userId: string,
  q: string,
  filters: SearchFilters,
  sort: string
): LiveListSpec<Item> {
  const { compare, canCompare } = buildSortSpec<Item>(sort);
  return {
    matches: (record) =>
      record.UserRef === userId &&
      matchesAnyField(record, ITEM_SEARCH_FIELDS, q) &&
      matchesAllFields(record, {
        categoryFunctional: filters.functional,
        categorySpecific: filters.specific,
        itemType: filters.itemType,
      }),
    compare,
    canCompare,
  };
}

/**
 * Paged items list, one PocketBase request per page, kept live by SSE.
 *
 * `isRejectedQuery` reports the one search string PocketBase cannot parse (a
 * trailing backslash — see `isUnrepresentableFilterValue`). The request is
 * withheld in that case rather than sent to be 400'd, so a half-typed Windows
 * path does not surface as a load failure. The subscription is deliberately
 * *not* withheld with it: the feed's identity is the user, not the search.
 */
export function useItemsInfinite({
  userId,
  q = '',
  filters,
  sort = '-created',
}: UseItemsInfiniteOptions) {
  const itemMutator = useMemo(() => new ItemMutator(pb), []);
  const normalisedFilters = useMemo(() => normaliseFilters(filters), [filters]);
  const isRejectedQuery = isUnrepresentableFilterValue(q);

  const spec = useMemo(
    () => itemSpec(userId ?? '', q, normalisedFilters, sort),
    [userId, q, normalisedFilters, sort]
  );

  const subscription = useMemo(
    () =>
      userId
        ? {
            collection: 'Items',
            topic: '*',
            // Coarse and stable: everything volatile (search, category
            // filters, sort) lives in `spec`, so typing never resubscribes.
            // `expand` is what keeps a live-updated card's thumbnail — SSE
            // payloads carry no expand unless it is asked for.
            options: { filter: eq('UserRef', userId), expand: 'ImageRef' },
            key: `items:${userId}`,
            gapHealKey: qk.itemsInfinitePrefix(userId),
          }
        : null,
    [userId]
  );

  const list = useLiveInfiniteList<Item>({
    // `userId` is only ever '' while the query is disabled, so nothing is
    // cached under the placeholder — see the note in @/lib/query/keys.
    queryKey: qk.itemsInfinite(userId ?? '', {
      q,
      filters: normalisedFilters,
      sort,
    }),
    enabled: !!userId && !isRejectedQuery,
    fetchPage: (page) =>
      itemMutator.search(q, {
        page,
        perPage: ITEMS_PER_PAGE,
        filters: {
          categoryFunctional: normalisedFilters.functional,
          categorySpecific: normalisedFilters.specific,
          itemType: normalisedFilters.itemType,
        },
        sort,
        expand: 'ImageRef',
      }),
    spec,
    subscription,
  });

  // A rejected search leaves the query disabled, and `placeholderData` would
  // otherwise keep the previous search's rows on screen as if they matched.
  const pages = isRejectedQuery ? EMPTY_PAGES : list.pages;
  const lastPage = pages[pages.length - 1];

  return {
    pages,
    isRejectedQuery,
    totalItems: lastPage?.totalItems ?? 0,
    totalPages: lastPage?.totalPages ?? 0,
    /** The rows PocketBase returned for `page`, or [] if it is not loaded yet. */
    itemsForPage: (page: number) =>
      pages.find((entry) => entry.page === page)?.items ?? [],
    isLoading: list.isLoading,
    isFetching: list.isFetching,
    isError: list.isError,
    error: list.error,
    fetchStatus: list.fetchStatus,
    hasNextPage: list.hasNextPage,
    isFetchingNextPage: list.isFetchingNextPage,
    fetchNextPage: list.fetchNextPage,
    refetch: list.refetch,
    /** Optimistically drop rows from the cached window (bulk delete). */
    removeFromCache: list.removeFromCache,
  };
}

/**
 * One item, expanded the same way the list expands it.
 *
 * `getById` resolves to `null` for an id PocketBase has no record for rather
 * than throwing, so `isMissing` is reported separately from `isError`: callers
 * generally treat both as a dead end but only one of them is a failed request.
 */
export function useItem(itemId: string | null | undefined) {
  const itemMutator = useMemo(() => new ItemMutator(pb), []);
  const queryClient = useQueryClient();

  // Looked up on every render rather than memoised: `initialData` is consulted
  // only while the key holds nothing, and the row it returns is the cache's own
  // object, so a repeat lookup cannot churn the query's identity.
  const seed = itemId
    ? seedFromListCache<Item>(queryClient, qk.itemsPrefix(), itemId)
    : undefined;

  const query = useQuery({
    queryKey: qk.itemById(itemId ?? ''),
    queryFn: () => itemMutator.getById(itemId as string, 'ImageRef'),
    enabled: !!itemId,
    initialData: seed?.data,
    initialDataUpdatedAt: seed?.updatedAt,
  });

  return {
    item: query.data ?? null,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    /** The request succeeded and PocketBase has no such item. */
    isMissing: query.isSuccess && query.data === null,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Every item in one unpaged request.
 *
 * This backs the container detail page's "add item" picker, which is a single
 * `<Select>` and so cannot page. It is deliberately separate from
 * `useItemsInfinite`: that query's pages are 12 rows of whatever the current
 * search says, which is not the pool the picker needs to offer.
 */
export function useAllItems(userId: string | null) {
  const itemMutator = useMemo(() => new ItemMutator(pb), []);

  const query = useQuery({
    queryKey: qk.itemsAll(userId ?? ''),
    queryFn: () => itemMutator.search(''),
    enabled: !!userId,
  });

  return {
    items: query.data?.items ?? [],
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
  };
}

/**
 * The items analysis filed against one image.
 *
 * An image carries at most a handful of these, so it is one unpaged request
 * rather than a window — but `totalItems` still comes back with it, so a
 * caller that wants a count does not have to trust `items.length`. The filter
 * is `ItemMutator`'s (`filters.image`), never a string assembled here.
 */
export function useItemsByImage(imageId: string | null | undefined) {
  const itemMutator = useMemo(() => new ItemMutator(pb), []);

  const query = useQuery({
    queryKey: qk.itemsByImage(imageId ?? ''),
    queryFn: () =>
      itemMutator.search('', { filters: { image: imageId as string } }),
    enabled: !!imageId,
  });

  return {
    items: query.data?.items ?? EMPTY_ITEMS,
    totalItems: query.data?.totalItems ?? 0,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
  };
}

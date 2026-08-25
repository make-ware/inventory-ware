'use client';

/**
 * TanStack Query bindings for the Items list.
 *
 * Paging is done by PocketBase, not by slicing a client-side array: each
 * `useInfiniteQuery` page is one `Items` list request, so the cache holds
 * exactly the pages that were visited and back-navigation repaints from cache
 * instead of refetching the whole collection.
 *
 * Filters are still built in the mutator layer (see CLAUDE.md) — this module
 * hands the free-text query and the category filters to
 * `ItemMutator.search()` and never assembles a filter string itself.
 */
import { useMemo } from 'react';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ItemMutator, isUnrepresentableFilterValue } from '@project/shared';
import type { Item } from '@project/shared';
import type { CategoryLibrary, SearchFilters } from '@/components/inventory';
import pb from '@/lib/pocketbase-client';
import { qk, seedFromListCache } from '@/lib/query';

/** Page size for the items grid; also the PocketBase `perPage`. */
export const ITEMS_PER_PAGE = 12;

const EMPTY_CATEGORIES: CategoryLibrary = {
  functional: [],
  specific: [],
  itemType: [],
};

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
 * Paged items list, one PocketBase request per page.
 *
 * `isRejectedQuery` reports the one search string PocketBase cannot parse (a
 * trailing backslash — see `isUnrepresentableFilterValue`). The request is
 * withheld in that case rather than sent to be 400'd, so a half-typed Windows
 * path does not surface as a load failure.
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

  const query = useInfiniteQuery({
    // `userId` is only ever '' while the query is disabled, so nothing is
    // cached under the placeholder — see the note in @/lib/query/keys.
    queryKey: qk.itemsInfinite(userId ?? '', {
      q,
      filters: normalisedFilters,
      sort,
    }),
    queryFn: ({ pageParam }) =>
      itemMutator.search(q, {
        page: pageParam,
        perPage: ITEMS_PER_PAGE,
        filters: {
          categoryFunctional: normalisedFilters.functional,
          categorySpecific: normalisedFilters.specific,
          itemType: normalisedFilters.itemType,
        },
        sort,
        expand: 'ImageRef',
      }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page < last.totalPages ? last.page + 1 : undefined,
    enabled: !!userId && !isRejectedQuery,
    // Keep the previous result on screen while a new filter/sort loads, so the
    // grid does not blank out between keystrokes.
    placeholderData: (previous) => previous,
  });

  const pages = useMemo(
    () => (isRejectedQuery ? [] : (query.data?.pages ?? [])),
    [isRejectedQuery, query.data]
  );
  // Every page envelope carries the same totals; the last one is the freshest.
  const lastPage = pages[pages.length - 1];

  // Fields are listed rather than spread: `...query` would subscribe the caller
  // to every property of the query state (see @tanstack/query/no-rest-destructuring).
  return {
    pages,
    isRejectedQuery,
    totalItems: lastPage?.totalItems ?? 0,
    totalPages: lastPage?.totalPages ?? 0,
    /** The rows PocketBase returned for `page`, or [] if it is not loaded yet. */
    itemsForPage: (page: number) =>
      pages.find((entry) => entry.page === page)?.items ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    fetchStatus: query.fetchStatus,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: query.fetchNextPage,
    refetch: query.refetch,
  };
}

/**
 * The distinct category values used by the search filters' dropdowns.
 *
 * Separate from the list query because it scans the whole collection and only
 * changes when items are created, edited or deleted — not when the list is
 * paged, sorted or filtered.
 */
export function useItemCategories(userId: string | null) {
  const itemMutator = useMemo(() => new ItemMutator(pb), []);

  const query = useQuery({
    queryKey: qk.categories(userId ?? ''),
    queryFn: () => itemMutator.getDistinctCategories(),
    enabled: !!userId,
  });

  return {
    categories: query.data ?? EMPTY_CATEGORIES,
    isLoading: query.isLoading,
    isSuccess: query.isSuccess,
    isError: query.isError,
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

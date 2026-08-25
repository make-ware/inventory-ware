'use client';

/**
 * Generic "PocketBase list with more pages behind it": a TanStack
 * `useInfiniteQuery` over `ListResult` pages, and nothing else. Plain
 * request/response — pages arrive when the caller asks for them, and the list
 * is only as fresh as its last fetch plus whatever mutations invalidate.
 *
 * This is the default for list surfaces. Pages that must also reflect *other*
 * clients' writes layer a realtime subscription on top via
 * `use-live-infinite-list.ts`, which wraps this hook.
 *
 * Paging is envelope-driven: `fetchPage` takes a 1-based page and the returned
 * `page`/`totalPages` decide whether there is a next one. Callers therefore
 * hold no page state — a filter or search change is a new query key, not a
 * page to reset. `itemsForPage` is what the numbered pagination controls read
 * (this app pages rather than infinite-scrolls); `items` is the same rows
 * flattened, for callers that want the whole loaded window.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { FetchStatus } from '@tanstack/react-query';
import type { ListResult } from 'pocketbase';
// dedupeById/removeManyFromList and the record/page types are paging-generic
// despite living beside the realtime merges.
import {
  dedupeById,
  removeManyFromList,
  type LiveListData,
  type LiveListRecord,
} from '@/lib/live-list';

/** Shared empty result, so an idle query does not hand out a new array each render. */
const EMPTY_PAGES: never[] = [];

export interface UseInfiniteListConfig<T extends LiveListRecord> {
  queryKey: readonly unknown[];
  enabled: boolean;
  /** Fetch one 1-based page; the envelope's page/totalPages drive paging. */
  fetchPage: (page: number) => Promise<ListResult<T>>;
}

export interface UseInfiniteListResult<T extends LiveListRecord> {
  /** Every loaded page, in the order they were fetched. */
  pages: ListResult<T>[];
  /** All loaded pages, flattened and deduped, in server sort order. */
  items: T[];
  /** The rows PocketBase returned for `page`, or [] if it is not loaded yet. */
  itemsForPage: (page: number) => T[];
  /** Freshest server total (0 until the first page arrives). */
  totalItems: number;
  totalPages: number;
  isLoading: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  isError: boolean;
  error: Error | null;
  fetchStatus: FetchStatus;
  hasNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
  /** Fetch the next page, guarded; no-op while showing placeholder data. */
  loadMore: () => void;
  refetch: () => Promise<unknown>;
  /** Optimistically drop records from the current key's cache. */
  removeFromCache: (ids: readonly string[]) => void;
}

export function useInfiniteList<T extends LiveListRecord>(
  config: UseInfiniteListConfig<T>
): UseInfiniteListResult<T> {
  const { queryKey, enabled, fetchPage } = config;
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey,
    enabled,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    getNextPageParam: (lastPage: ListResult<T>) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    // Keep the previous list visible while a filter/sort/search change fetches
    // its first page, avoiding a flicker to empty between keystrokes.
    placeholderData: (prev) => prev,
  });

  // `removeFromCache` must write to the key the list is CURRENTLY showing, not
  // the one captured when the callback was created.
  const queryKeyRef = useRef(queryKey);
  useEffect(() => {
    queryKeyRef.current = queryKey;
  });

  const pages = query.data?.pages ?? EMPTY_PAGES;

  const items = useMemo(
    () => dedupeById(pages.flatMap((page) => page.items)),
    [pages]
  );

  const itemsForPage = useCallback(
    (page: number) => pages.find((entry) => entry.page === page)?.items ?? [],
    [pages]
  );

  // Every page envelope carries the same totals; the last one is the freshest.
  const lastPage = pages[pages.length - 1];

  const { fetchNextPage, isPlaceholderData, isFetchingNextPage, hasNextPage } =
    query;
  const loadMore = useCallback(() => {
    // While showing another key's placeholder data, "page 2" would belong to
    // that other result set — wait for the real first page.
    if (isPlaceholderData || isFetchingNextPage || !hasNextPage) return;
    void fetchNextPage();
  }, [fetchNextPage, isPlaceholderData, isFetchingNextPage, hasNextPage]);

  const removeFromCache = useCallback(
    (ids: readonly string[]) => {
      queryClient.setQueryData<LiveListData<T>>(queryKeyRef.current, (prev) =>
        prev ? removeManyFromList(prev, ids) : prev
      );
    },
    [queryClient]
  );

  // Fields are listed rather than spread: `...query` would subscribe the caller
  // to every property of the query state (see @tanstack/query/no-rest-destructuring).
  return {
    pages,
    items,
    itemsForPage,
    totalItems: lastPage?.totalItems ?? 0,
    totalPages: lastPage?.totalPages ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isFetchingNextPage,
    isError: query.isError,
    error: query.error,
    fetchStatus: query.fetchStatus,
    hasNextPage: hasNextPage ?? false,
    fetchNextPage,
    loadMore,
    refetch: query.refetch,
    removeFromCache,
  };
}

'use client';

/**
 * TanStack Query bindings for Containers, plus the two detail-page reads that
 * hang off a container (the container itself and the items inside it).
 *
 * Paging is done by PocketBase, not by slicing a client-side array: each
 * `useInfiniteQuery` page is one `Containers` list request, so `totalPages`
 * comes from the server and back-navigation repaints from cache instead of
 * refetching the whole collection.
 *
 * Filters are still built in the mutator layer (see CLAUDE.md) — this module
 * hands the free-text query to `ContainerMutator.search()` and never assembles
 * a filter string itself.
 */
import { useMemo } from 'react';
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  ContainerMutator,
  ItemMutator,
  isUnrepresentableFilterValue,
} from '@project/shared';
import type { Container } from '@project/shared';
import pb from '@/lib/pocketbase-client';
import { qk, seedFromListCache } from '@/lib/query';

/** Page size for the containers grid; also the PocketBase `perPage`. */
export const CONTAINERS_PER_PAGE = 12;

export interface UseContainersInfiniteOptions {
  /** Authenticated user id; the query stays idle while this is null. */
  userId: string | null;
  /** Free-text query. Debounce before passing it in — it is part of the key. */
  q?: string;
  sort?: string;
}

/**
 * Paged containers list, one PocketBase request per page.
 *
 * `isRejectedQuery` reports the one search string PocketBase cannot parse (a
 * trailing backslash — see `isUnrepresentableFilterValue`). The request is
 * withheld in that case rather than sent to be 400'd, so a half-typed Windows
 * path does not surface as a load failure.
 */
export function useContainersInfinite({
  userId,
  q = '',
  sort = '-created',
}: UseContainersInfiniteOptions) {
  const containerMutator = useMemo(() => new ContainerMutator(pb), []);
  const isRejectedQuery = isUnrepresentableFilterValue(q);

  const query = useInfiniteQuery({
    // `userId` is only ever '' while the query is disabled, so nothing is
    // cached under the placeholder — see the note in @/lib/query/keys.
    queryKey: qk.containersInfinite(userId ?? '', { q, sort }),
    queryFn: ({ pageParam }) =>
      containerMutator.search(q, {
        page: pageParam,
        perPage: CONTAINERS_PER_PAGE,
        sort,
        expand: 'ImageRef',
      }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.page < last.totalPages ? last.page + 1 : undefined,
    enabled: !!userId && !isRejectedQuery,
    // Keep the previous result on screen while a new search/sort loads, so the
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
    containersForPage: (page: number) =>
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
 * One container, expanded the same way the list expands it.
 *
 * `getById` resolves to `null` for an id PocketBase has no record for rather
 * than throwing, so `isMissing` is reported separately from `isError`: callers
 * generally treat both as a dead end but only one of them is a failed request.
 */
export function useContainer(containerId: string | null | undefined) {
  const containerMutator = useMemo(() => new ContainerMutator(pb), []);
  const queryClient = useQueryClient();

  // Looked up on every render rather than memoised: `initialData` is consulted
  // only while the key holds nothing, and the row it returns is the cache's own
  // object, so a repeat lookup cannot churn the query's identity.
  const seed = containerId
    ? seedFromListCache<Container>(
        queryClient,
        qk.containersPrefix(),
        containerId
      )
    : undefined;

  const query = useQuery({
    queryKey: qk.containerById(containerId ?? ''),
    queryFn: () => containerMutator.getById(containerId as string, 'ImageRef'),
    enabled: !!containerId,
    initialData: seed?.data,
    initialDataUpdatedAt: seed?.updatedAt,
  });

  return {
    container: query.data ?? null,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    /** The request succeeded and PocketBase has no such container. */
    isMissing: query.isSuccess && query.data === null,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * The items filed under a container.
 *
 * `totalItems` is the server's count, so the "Items (n)" heading stays right
 * even for a container holding more rows than one page returns.
 */
export function useItemsByContainer(containerId: string | null | undefined) {
  const itemMutator = useMemo(() => new ItemMutator(pb), []);

  const query = useQuery({
    queryKey: qk.itemsByContainer(containerId ?? ''),
    queryFn: () =>
      itemMutator.getByContainer(containerId as string, {
        expand: 'ImageRef',
      }),
    enabled: !!containerId,
  });

  return {
    items: query.data?.items ?? [],
    totalItems: query.data?.totalItems ?? 0,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

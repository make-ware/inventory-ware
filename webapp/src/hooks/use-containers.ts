'use client';

/**
 * TanStack Query bindings for Containers, plus the detail-page reads that hang
 * off one: the container itself, the items inside it, and the containers an
 * image was analysed into.
 *
 * Paging is done by PocketBase, not by slicing a client-side array: each
 * `useInfiniteQuery` page is one `Containers` list request, so `totalPages`
 * comes from the server and back-navigation repaints from cache instead of
 * refetching the whole collection.
 *
 * The list is live: `useLiveInfiniteList` subscribes to the `Containers`
 * collection and folds each SSE event into the cached pages, so another tab's
 * write lands here without a refetch. See `@/hooks/use-items` for the same
 * wiring with the fuller filter set.
 *
 * Filters are still built in the mutator layer (see CLAUDE.md) — this module
 * hands the free-text query to `ContainerMutator.search()` and never assembles
 * a filter string itself.
 */
import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ContainerMutator,
  CONTAINER_SEARCH_FIELDS,
  ItemMutator,
  eq,
  isUnrepresentableFilterValue,
} from '@project/shared';
import type { Container } from '@project/shared';
import pb from '@/lib/pocketbase-client';
import { qk, seedFromListCache } from '@/lib/query';
import { useLiveInfiniteList } from '@/hooks/use-live-infinite-list';
import type { LiveListSpec } from '@/lib/live-list';
import { buildSortSpec, matchesAnyField } from '@/lib/live-list-spec';

/** Page size for the containers grid; also the PocketBase `perPage`. */
export const CONTAINERS_PER_PAGE = 12;

/** Stable empty window, so a withheld query does not hand out a new array each render. */
const EMPTY_PAGES: never[] = [];

/** Stable empty result, for the same reason. */
const EMPTY_CONTAINERS: Container[] = [];

export interface UseContainersInfiniteOptions {
  /** Authenticated user id; the query stays idle while this is null. */
  userId: string | null;
  /** Free-text query. Debounce before passing it in — it is part of the key. */
  q?: string;
  sort?: string;
}

/**
 * Client mirror of the query `ContainerMutator.search()` just ran: the
 * free-text match against the same two fields, plus the owning user, plus the
 * sort with its `id` tiebreak. See `itemSpec` in `@/hooks/use-items`.
 */
function containerSpec(
  userId: string,
  q: string,
  sort: string
): LiveListSpec<Container> {
  const { compare, canCompare } = buildSortSpec<Container>(sort);
  return {
    matches: (record) =>
      record.UserRef === userId &&
      matchesAnyField(record, CONTAINER_SEARCH_FIELDS, q),
    compare,
    canCompare,
  };
}

/**
 * Paged containers list, one PocketBase request per page, kept live by SSE.
 *
 * `isRejectedQuery` reports the one search string PocketBase cannot parse (a
 * trailing backslash — see `isUnrepresentableFilterValue`). The request is
 * withheld in that case rather than sent to be 400'd, so a half-typed Windows
 * path does not surface as a load failure. The subscription is deliberately
 * *not* withheld with it: the feed's identity is the user, not the search.
 */
export function useContainersInfinite({
  userId,
  q = '',
  sort = '-created',
}: UseContainersInfiniteOptions) {
  const containerMutator = useMemo(() => new ContainerMutator(pb), []);
  const isRejectedQuery = isUnrepresentableFilterValue(q);

  const spec = useMemo(
    () => containerSpec(userId ?? '', q, sort),
    [userId, q, sort]
  );

  const subscription = useMemo(
    () =>
      userId
        ? {
            collection: 'Containers',
            topic: '*',
            options: { filter: eq('UserRef', userId), expand: 'ImageRef' },
            key: `containers:${userId}`,
            gapHealKey: qk.containersInfinitePrefix(userId),
          }
        : null,
    [userId]
  );

  const list = useLiveInfiniteList<Container>({
    // `userId` is only ever '' while the query is disabled, so nothing is
    // cached under the placeholder — see the note in @/lib/query/keys.
    queryKey: qk.containersInfinite(userId ?? '', { q, sort }),
    enabled: !!userId && !isRejectedQuery,
    fetchPage: (page) =>
      containerMutator.search(q, {
        page,
        perPage: CONTAINERS_PER_PAGE,
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
    containersForPage: (page: number) =>
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
    /** Optimistically drop rows from the cached window. */
    removeFromCache: list.removeFromCache,
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

/**
 * The containers analysis filed against one image.
 *
 * The container half of `useItemsByImage` — same shape, same reasoning, and
 * the same `filters.image` built inside `ContainerMutator`.
 */
export function useContainersByImage(imageId: string | null | undefined) {
  const containerMutator = useMemo(() => new ContainerMutator(pb), []);

  const query = useQuery({
    queryKey: qk.containersByImage(imageId ?? ''),
    queryFn: () =>
      containerMutator.search('', { filters: { image: imageId as string } }),
    enabled: !!imageId,
  });

  return {
    containers: query.data?.items ?? EMPTY_CONTAINERS,
    totalItems: query.data?.totalItems ?? 0,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
  };
}

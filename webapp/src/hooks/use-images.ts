'use client';

/**
 * TanStack Query bindings for Images.
 *
 * Unlike items and containers, the images grid is not server-paged: its search
 * box matches on filename and id, and its type/status selects narrow a set the
 * user is expected to scan, so the page holds one fetch and filters it in
 * memory. The query therefore asks for a single large page and the cache — not
 * a component's `useState` — is what the grid renders from, which is what makes
 * navigating away and back repaint instead of refetching.
 *
 * That shape is why this stays a `useQuery` rather than moving to
 * `useLiveInfiniteList` like the items and containers lists: there are no pages
 * to keep live, only one envelope. It still gets the same realtime treatment —
 * `applyPageEvent` is `applyListEvent` over a one-page window, so the merge
 * rules (echo suppression, stale-stamp drop, honest totals, same reference on
 * a no-op) are shared rather than reimplemented here.
 */
import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImageMutator, eq } from '@project/shared';
import type { Image } from '@project/shared';
import type { ListResult, RecordSubscription } from 'pocketbase';
import pb from '@/lib/pocketbase-client';
import { qk, seedFromListCache } from '@/lib/query';
import { useRealtimeSubscription } from '@/hooks/use-realtime-subscription';
import { applyPageEvent, type LiveListSpec } from '@/lib/live-list';
import { buildSortSpec } from '@/lib/live-list-spec';

/**
 * Upper bound on the images fetched in one go.
 *
 * The grid filters and pages this set client-side, so the cap is the real
 * ceiling on how many images the page can show; server paging is the fix if a
 * library ever outgrows it.
 */
export const IMAGES_FETCH_LIMIT = 1000;

/** How often to re-read the list while PocketBase is still analysing an image. */
const PROCESSING_POLL_MS = 5000;

const EMPTY_IMAGES: Image[] = [];

/** The images list is always `-created`; the id tiebreak makes the order total. */
const IMAGE_SORT = buildSortSpec<Image>('-created');

/**
 * Every image, newest first, kept live by SSE.
 *
 * Analysis happens out of band (the `/api-next/process-image` routes hand the
 * work to the AI provider and return), so an image sitting in `processing` used
 * to have nothing to wait on but a timer. The subscription is what actually
 * delivers the status flip now; the interval is kept as the fallback for the
 * case the socket is down or the ListRule drops the event, and it costs nothing
 * once no image is processing.
 */
export function useImages(userId: string | null) {
  const imageMutator = useMemo(() => new ImageMutator(pb), []);
  const queryClient = useQueryClient();

  const query = useQuery({
    // `userId` is only ever '' while the query is disabled, so nothing is
    // cached under the placeholder — see the note in @/lib/query/keys.
    queryKey: qk.images(userId ?? ''),
    queryFn: () =>
      imageMutator.getList({ perPage: IMAGES_FETCH_LIMIT, sort: '-created' }),
    enabled: !!userId,
    refetchInterval: (query) =>
      query.state.data?.items.some(
        (image) => image.analysisStatus === 'processing'
      )
        ? PROCESSING_POLL_MS
        : false,
  });

  const spec = useMemo<LiveListSpec<Image>>(
    () => ({
      // The only server-side narrowing is the collection's ListRule.
      matches: (record) => record.UserRef === userId,
      compare: IMAGE_SORT.compare,
      canCompare: IMAGE_SORT.canCompare,
    }),
    [userId]
  );

  const onEvent = useCallback(
    (event: RecordSubscription<Image>) => {
      queryClient.setQueryData<ListResult<Image>>(
        qk.images(userId ?? ''),
        (prev) =>
          prev ? applyPageEvent(prev, event.action, event.record, spec) : prev
      );
    },
    [queryClient, userId, spec]
  );

  useRealtimeSubscription<Image>({
    subscription: userId
      ? {
          collection: 'Images',
          topic: '*',
          options: { filter: eq('UserRef', userId) },
          key: `images:${userId}`,
          gapHealKey: qk.images(userId),
        }
      : null,
    onEvent,
  });

  // Fields are listed rather than spread: `...query` would subscribe the caller
  // to every property of the query state (see @tanstack/query/no-rest-destructuring).
  return {
    images: query.data?.items ?? EMPTY_IMAGES,
    /** True only while a request is actually in flight, so a signed-out visitor
     * gets the empty state rather than a spinner that never resolves. */
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * One image, seeded from whichever list already holds it.
 *
 * The detail page's own reason to re-read is the same one the grid has: an
 * image left `processing` flips to `completed` out of band, and neither the
 * flip nor the items it created come back through the POST that started it.
 * The grid's SSE subscription covers the case where both are mounted; this
 * query keeps the poll so a detail page opened on its own still settles.
 */
export function useImage(imageId: string | null | undefined) {
  const imageMutator = useMemo(() => new ImageMutator(pb), []);
  const queryClient = useQueryClient();

  // Looked up on every render rather than memoised: `initialData` is consulted
  // only while the key holds nothing — see `seedFromListCache`.
  const seed = imageId
    ? seedFromListCache<Image>(queryClient, qk.imagesPrefix(), imageId)
    : undefined;

  const query = useQuery({
    queryKey: qk.imageById(imageId ?? ''),
    queryFn: () => imageMutator.getById(imageId as string),
    enabled: !!imageId,
    initialData: seed?.data,
    initialDataUpdatedAt: seed?.updatedAt,
    refetchInterval: (query) =>
      query.state.data?.analysisStatus === 'processing'
        ? PROCESSING_POLL_MS
        : false,
  });

  return {
    image: query.data ?? null,
    isPending: query.isPending,
    isFetching: query.isFetching,
    isError: query.isError,
    /** The request succeeded and PocketBase has no such image. */
    isMissing: query.isSuccess && query.data === null,
    error: query.error,
    refetch: query.refetch,
  };
}

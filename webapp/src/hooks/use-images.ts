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
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ImageMutator } from '@project/shared';
import type { Image } from '@project/shared';
import pb from '@/lib/pocketbase-client';
import { qk } from '@/lib/query';

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

/**
 * Every image, newest first.
 *
 * Analysis happens out of band (the `/api-next/process-image` routes hand the
 * work to the AI provider and return), so an image sitting in `processing` has
 * no completion event to wait on. While at least one is in that state the query
 * re-reads on an interval and stops again once none are — polling that follows
 * the data rather than a timer the component has to remember to clear.
 */
export function useImages(userId: string | null) {
  const imageMutator = useMemo(() => new ImageMutator(pb), []);

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

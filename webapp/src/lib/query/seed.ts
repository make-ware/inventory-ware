/**
 * Seeding a detail query from a list the cache already holds.
 *
 * Clicking a card on a list page navigates to the record that was just
 * rendered, so the row is sitting in the cache under the list key. Handing it
 * to the detail query as `initialData` paints the page immediately instead of
 * flashing a spinner for a record we already have — and because both queries
 * expand `ImageRef`, the seeded row is the same shape the detail fetch returns.
 *
 * The seed carries the list's `dataUpdatedAt` with it. Without that, TanStack
 * timestamps `initialData` as of now and a row lifted from a list fetched ten
 * minutes ago would look fresh; with it, an aged row still refetches in the
 * background while the stale copy stays on screen.
 */
import type { QueryClient, QueryKey } from '@tanstack/react-query';

export interface CacheSeed<T> {
  data: T;
  /** When the list this came from was fetched; 0 when that is unknowable. */
  updatedAt: number;
}

/**
 * The pages of a cached list, whichever shape it was stored in.
 *
 * A `useInfiniteQuery` caches `{pages: ListResult[]}` and a plain `useQuery`
 * caches the single `ListResult`; both are worth searching, and anything else
 * under the prefix (a count, a detail record) yields no pages and is skipped.
 */
function cachedPages(data: unknown): { items?: unknown[] }[] {
  if (!data || typeof data !== 'object') return [];
  const pages = (data as { pages?: unknown }).pages;
  if (Array.isArray(pages)) return pages as { items?: unknown[] }[];
  if (Array.isArray((data as { items?: unknown }).items)) {
    return [data as { items?: unknown[] }];
  }
  return [];
}

/** Find `id` in any cached list under `prefix`. */
export function seedFromListCache<T extends { id: string }>(
  queryClient: QueryClient,
  prefix: QueryKey,
  id: string
): CacheSeed<T> | undefined {
  for (const [key, data] of queryClient.getQueriesData({ queryKey: prefix })) {
    for (const page of cachedPages(data)) {
      const match = (page?.items as T[] | undefined)?.find(
        (row) => row?.id === id
      );
      if (!match) continue;
      return {
        data: match,
        updatedAt: queryClient.getQueryState(key)?.dataUpdatedAt ?? 0,
      };
    }
  }

  return undefined;
}

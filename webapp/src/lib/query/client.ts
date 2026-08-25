/**
 * TanStack Query client for the webapp.
 *
 * All PocketBase data in this app is fetched client-side through the shared
 * mutators (see CLAUDE.md — no SSR PocketBase), so a single browser-lifetime
 * QueryClient is enough; there is no server render to hydrate from.
 *
 * Defaults, and why:
 * - `staleTime: 30_000`   — collapses the burst of refetches that happen while
 *   navigating between inventory pages without letting data rot.
 * - `gcTime: 5 * 60_000`  — keeps unmounted list pages warm for a short while so
 *   back-navigation paints from cache.
 * - `retry: 1`            — PocketBase errors here are usually 4xx (auth/rules);
 *   retrying them repeatedly just delays the error surfacing.
 * - `refetchOnWindowFocus: false` — freshness will come from PocketBase realtime
 *   subscriptions folded into the cache, so focus refetches would be redundant
 *   traffic (and would fight the live merge).
 * - `refetchOnReconnect: true`    — the one case realtime cannot cover: while the
 *   socket was down we may have missed events, so re-fetch on reconnect.
 */
import { QueryClient } from '@tanstack/react-query';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/**
 * Singleton accessor. On the server every call returns a fresh client so that
 * no cache is shared between requests; in the browser the same instance is
 * reused for the lifetime of the tab.
 */
export function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    return createQueryClient();
  }

  browserQueryClient ??= createQueryClient();
  return browserQueryClient;
}

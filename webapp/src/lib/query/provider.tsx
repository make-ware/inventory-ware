'use client';

/**
 * App-wide TanStack Query provider.
 *
 * Mounted in `app/layout.tsx` above every other provider, so the auth and
 * upload contexts and every page under them consume one cache. The whole tree
 * below stays client-only — see `docs/PB_SSR.md`: this app deliberately does
 * not fetch PocketBase data during server rendering, so there is nothing to
 * dehydrate/hydrate here.
 *
 * Cache defaults (and the reasoning for `refetchOnWindowFocus: false`) live in
 * `./client`.
 */
import type { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from './client';

// Dev-only: `process.env.NODE_ENV` is inlined at build time, so the production
// bundle keeps the `() => null` branch and drops the devtools chunk entirely.
const ReactQueryDevtools =
  process.env.NODE_ENV === 'production'
    ? () => null
    : dynamic(
        () =>
          import('@tanstack/react-query-devtools').then((mod) => ({
            default: mod.ReactQueryDevtools,
          })),
        { ssr: false }
      );

export function QueryProvider({ children }: { children: ReactNode }) {
  // Not `useState(createQueryClient)`: the singleton must survive the remounts
  // React does in StrictMode / Fast Refresh, or the cache resets under the app.
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
    </QueryClientProvider>
  );
}

'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { buildLoginUrl } from '@/lib/auth/return-url';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Login route to bounce to. Overridden only by tests and by future flows. */
  redirectTo?: string;
  /** Shown while the auth store is being verified. */
  fallback?: React.ReactNode;
}

/**
 * Gate for anything that needs a signed-in user. Unauthenticated visitors are
 * sent to the login page with their intended destination attached, so signing
 * in puts them back where they were headed instead of on the home page.
 *
 * Wrap a *layout* where one exists (see `app/inventory/layout.tsx`) — one guard
 * covers every route beneath it, and a page added later inherits the
 * protection instead of having to remember it.
 */
export function ProtectedRoute({
  children,
  redirectTo = '/login',
  fallback,
}: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // The auth store is read asynchronously on mount; redirecting before it
    // settles would bounce a signed-in visitor on every hard refresh.
    if (isLoading || isAuthenticated) return;

    // The query string comes from `window` rather than `useSearchParams` on
    // purpose: the hook would force every layout mounting this guard behind
    // its own Suspense boundary, and this effect only ever runs on the client,
    // where `window.location` is exactly as accurate.
    const search = typeof window === 'undefined' ? '' : window.location.search;

    // `replace`, not `push` — leaving the protected URL in history means Back
    // from the login page lands on it, gets bounced here again, and the
    // visitor cannot navigate backwards out of the login screen.
    router.replace(buildLoginUrl(`${pathname ?? '/'}${search}`, redirectTo));
  }, [isAuthenticated, isLoading, router, pathname, redirectTo]);

  if (isLoading) {
    return (
      <>
        {fallback ?? (
          <div className="flex items-center justify-center min-h-[50vh]">
            <div
              className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"
              role="status"
              aria-label="Loading authentication status"
            >
              <span className="sr-only">Loading...</span>
            </div>
          </div>
        )}
      </>
    );
  }

  // Nothing renders for a signed-out visitor — the effect above is redirecting.
  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}

export default ProtectedRoute;

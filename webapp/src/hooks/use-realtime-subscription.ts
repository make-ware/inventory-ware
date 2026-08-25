'use client';

/**
 * One PocketBase realtime (SSE) subscription, held for as long as its `key`
 * stays the same.
 *
 * This is the only place in the webapp that calls `pb.collection(...).subscribe`
 * for a collection feed, and it exists so the rules below are written once
 * rather than re-derived per list:
 *
 * - **Identity is `key`, nothing else.** The effect resubscribes only when
 *   `key` changes, so typing in a search box — which changes the query key, the
 *   filter mirror, everything except the collection being watched — never costs
 *   a `POST /api/realtime`. Volatile inputs reach the handler through a ref.
 * - **Per-subscription unsubscribe.** The function returned by `subscribe` is
 *   what tears the listener down, never the collection-global
 *   `unsubscribe('*')`, which would silently kill a sibling list's feed.
 * - **StrictMode-safe.** React 19 mounts effects twice in development; a
 *   `disposed` flag releases a subscription whose round-trip resolved after
 *   cleanup instead of leaking it.
 * - **Gap heal.** Events landing between a list's first server read and the
 *   subscription coming live would be lost, so `gapHealKey` is invalidated
 *   once — and only once — after `subscribe` resolves.
 * - **Read-only handlers.** `onEvent` folds into the query cache. It never
 *   writes to PocketBase; a handler that mutates is a feedback loop with the
 *   other tabs listening to the same collection.
 *
 * Access control is PocketBase's: a collection subscription is filtered by the
 * collection's ListRule, so `Items`/`Containers`/`Images`
 * (`UserRef = @request.auth.id`) already only deliver the caller's own rows.
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type PocketBase from 'pocketbase';
import type { RecordSubscription } from 'pocketbase';
import pb from '@/lib/pocketbase-client';
import { createLogger, errorMessage } from '@/lib/logger';

const log = createLogger('realtime');

export interface LiveListSubscription {
  /** PocketBase collection name. */
  collection: string;
  /** Subscription topic; defaults to '*' (all records in the collection). */
  topic?: string;
  /**
   * Server-side options. Keep the filter coarse and stable (e.g. the owning
   * user) — fine-grained, volatile filtering belongs in `spec.matches`, or the
   * subscription would churn on every keystroke.
   */
  options?: { filter?: string; expand?: string };
  /**
   * Stable subscription identity: the effect (re)subscribes ONLY when this
   * changes. Client-side filters/search/sort must NOT be part of it.
   */
  key: string;
  /**
   * Query-key prefix invalidated once after the subscription is live, to close
   * the gap between the first fetch and the first event. Omit for subscribers
   * that have no window of their own to heal.
   */
  gapHealKey?: readonly unknown[];
}

export interface UseRealtimeSubscriptionConfig<T> {
  /** Realtime wiring; null disables the subscription entirely. */
  subscription: LiveListSubscription | null;
  /** Called for every event. Must only touch the query cache. */
  onEvent: (event: RecordSubscription<T>) => void;
}

export function useRealtimeSubscription<T>({
  subscription,
  onEvent,
}: UseRealtimeSubscriptionConfig<T>): void {
  const queryClient = useQueryClient();

  // The handler is created once per subscription but must always run the
  // CURRENT callback against the CURRENT config — hence refs rather than
  // effect dependencies, which would resubscribe.
  const onEventRef = useRef(onEvent);
  const subscriptionRef = useRef(subscription);
  useEffect(() => {
    onEventRef.current = onEvent;
    subscriptionRef.current = subscription;
  });

  const subscriptionKey = subscription?.key ?? null;

  useEffect(() => {
    if (!subscriptionKey) return;
    const target = subscriptionRef.current;
    if (!target) return;

    let disposed = false;
    let unsubscribe: (() => Promise<void> | void) | null = null;

    const handler = (event: RecordSubscription<T>) => {
      onEventRef.current(event);
    };

    // Upcast to the base client: this hook is collection-agnostic, so the name
    // is a runtime string rather than a TypedPocketBase literal.
    const subscribed = (pb as PocketBase)
      .collection(target.collection)
      .subscribe<T>(target.topic ?? '*', handler, target.options);

    subscribed
      .then((unsub) => {
        // StrictMode / fast unmount: the effect may be cleaned up before the
        // subscribe round-trip resolves — release immediately.
        if (disposed) void unsub();
        else unsubscribe = unsub;
      })
      .catch((err) => {
        log.error('subscription failed', {
          collection: target.collection,
          error: errorMessage(err),
        });
      });

    if (target.gapHealKey) {
      const gapHealKey = target.gapHealKey;
      void subscribed
        .then(() => {
          if (disposed) return undefined;
          return queryClient.invalidateQueries({ queryKey: gapHealKey });
        })
        .catch(() => undefined);
    }

    return () => {
      disposed = true;
      if (unsubscribe) void unsubscribe();
    };
  }, [subscriptionKey, queryClient]);
}

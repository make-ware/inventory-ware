'use client';

/**
 * `useInfiniteList` plus a PocketBase realtime subscription: the same paging,
 * kept fresh by SSE events folded into the query cache through the pure merges
 * in `@/lib/live-list`.
 *
 * Paging lives entirely in `use-infinite-list.ts` and the subscription rules
 * in `use-realtime-subscription.ts`; this hook is the join between them. A list
 * that does not need other clients' writes to appear without a refresh should
 * use `useInfiniteList` directly rather than passing `subscription: null` here,
 * since `spec` is meaningless without a subscription to apply it to.
 *
 * Note the subscription is gated on `subscription` alone, NOT on the query's
 * `enabled`: this app disables the query for a search string PocketBase cannot
 * parse (a trailing backslash), and tying the feed to that would tear the
 * socket down and rebuild it mid-keystroke.
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ListResult, RecordSubscription } from 'pocketbase';
import {
  useInfiniteList,
  type UseInfiniteListResult,
} from '@/hooks/use-infinite-list';
import {
  useRealtimeSubscription,
  type LiveListSubscription,
} from '@/hooks/use-realtime-subscription';
import {
  applyListEvent,
  type LiveListData,
  type LiveListRecord,
  type LiveListSpec,
} from '@/lib/live-list';

export type { LiveListSubscription };

export interface UseLiveInfiniteListConfig<T extends LiveListRecord> {
  queryKey: readonly unknown[];
  enabled: boolean;
  /** Fetch one 1-based page; the envelope's page/totalPages drive paging. */
  fetchPage: (page: number) => Promise<ListResult<T>>;
  /** Client mirror of the server filter + sort (see LiveListSpec). */
  spec: LiveListSpec<T>;
  /** Pure, synchronous mapping applied to SSE records before merging. */
  mapEvent?: (record: T) => T;
  /** Realtime wiring; null disables the subscription. */
  subscription: LiveListSubscription | null;
}

export type UseLiveInfiniteListResult<T extends LiveListRecord> =
  UseInfiniteListResult<T>;

export function useLiveInfiniteList<T extends LiveListRecord>(
  config: UseLiveInfiniteListConfig<T>
): UseLiveInfiniteListResult<T> {
  const { queryKey, enabled, fetchPage, spec, mapEvent, subscription } = config;
  const queryClient = useQueryClient();

  const list = useInfiniteList<T>({ queryKey, enabled, fetchPage });

  // Volatile inputs flow to the (stable) subscription handler through refs so
  // events always merge into the CURRENT filter's cache entry with the CURRENT
  // matches/compare — without ever resubscribing.
  const queryKeyRef = useRef(queryKey);
  const specRef = useRef(spec);
  const mapEventRef = useRef(mapEvent);
  useEffect(() => {
    queryKeyRef.current = queryKey;
    specRef.current = spec;
    mapEventRef.current = mapEvent;
  });

  useRealtimeSubscription<T>({
    subscription,
    onEvent: (event: RecordSubscription<T>) => {
      const record = mapEventRef.current
        ? mapEventRef.current(event.record)
        : event.record;
      queryClient.setQueryData<LiveListData<T>>(queryKeyRef.current, (prev) =>
        prev
          ? applyListEvent(prev, event.action, record, specRef.current)
          : prev
      );
    },
  });

  return list;
}

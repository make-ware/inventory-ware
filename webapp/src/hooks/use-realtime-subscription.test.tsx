import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const unsubscribe = vi.fn();
const handlers: ((event: {
  action: string;
  record: Record<string, unknown>;
}) => void)[] = [];
let subscribeResult: (() => void) | Error = unsubscribe;
const subscribe = vi.fn(async (_topic, handler) => {
  if (subscribeResult instanceof Error) throw subscribeResult;
  handlers.push(handler);
  return subscribeResult;
});

vi.mock('@/lib/pocketbase-client', () => ({
  default: { collection: () => ({ subscribe }) },
}));

import { useRealtimeSubscription } from './use-realtime-subscription';

let client: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const feed = (key: string) => ({
  collection: 'Items',
  topic: '*',
  key,
  gapHealKey: ['items', 'infinite', 'u1'] as const,
});

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  handlers.length = 0;
  subscribe.mockClear();
  unsubscribe.mockClear();
  subscribeResult = unsubscribe;
});

describe('useRealtimeSubscription', () => {
  it('subscribes once and delivers events to the current handler', async () => {
    const first = vi.fn();
    const second = vi.fn();

    const { rerender } = renderHook(
      ({ onEvent }: { onEvent: () => void }) =>
        useRealtimeSubscription({ subscription: feed('items:u1'), onEvent }),
      { wrapper, initialProps: { onEvent: first } }
    );
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1));

    // A new handler identity every render is the normal case (it closes over
    // the query key and the filter mirror) and must not cost a resubscribe.
    rerender({ onEvent: second });
    act(() => {
      for (const handler of handlers) handler({ action: 'create', record: {} });
    });

    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('resubscribes only when the key changes', async () => {
    const { rerender } = renderHook(
      ({ key }: { key: string }) =>
        useRealtimeSubscription({ subscription: feed(key), onEvent: vi.fn() }),
      { wrapper, initialProps: { key: 'items:u1' } }
    );
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1));

    rerender({ key: 'items:u1' });
    expect(subscribe).toHaveBeenCalledTimes(1);

    rerender({ key: 'items:u2' });
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(2));
    // The old feed is released by its own unsubscribe, never by a
    // collection-wide unsubscribe('*') that would kill a sibling list.
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('invalidates the gap-heal key once the subscription is live', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    renderHook(
      () =>
        useRealtimeSubscription({
          subscription: feed('items:u1'),
          onEvent: vi.fn(),
        }),
      { wrapper }
    );

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    expect(invalidate.mock.calls[0][0]).toEqual({
      queryKey: ['items', 'infinite', 'u1'],
    });
  });

  it('skips the gap heal when no key is given', async () => {
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    renderHook(
      () =>
        useRealtimeSubscription({
          subscription: {
            collection: 'Items',
            topic: '*',
            key: 'categories:u1',
          },
          onEvent: vi.fn(),
        }),
      { wrapper }
    );

    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1));
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('does nothing without a subscription', () => {
    renderHook(
      () => useRealtimeSubscription({ subscription: null, onEvent: vi.fn() }),
      { wrapper }
    );

    expect(subscribe).not.toHaveBeenCalled();
  });

  it('releases a subscription whose round trip resolved after unmount', async () => {
    // StrictMode's double mount, or a fast navigation, can tear the effect
    // down while `subscribe` is still in flight. The late unsubscribe has to
    // be called rather than dropped, or the feed leaks for the tab's lifetime.
    let land: (unsub: () => void) => void = () => {};
    subscribe.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          land = resolve;
        })
    );
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    const { unmount } = renderHook(
      () =>
        useRealtimeSubscription({
          subscription: feed('items:u1'),
          onEvent: vi.fn(),
        }),
      { wrapper }
    );
    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1));

    unmount();
    expect(unsubscribe).not.toHaveBeenCalled();

    act(() => land(unsubscribe));

    await waitFor(() => expect(unsubscribe).toHaveBeenCalledTimes(1));
    // Nothing left to heal: the list that asked for the feed is gone.
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('survives a subscription the server refuses', async () => {
    subscribeResult = new Error('403');
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    renderHook(
      () =>
        useRealtimeSubscription({
          subscription: feed('items:u1'),
          onEvent: vi.fn(),
        }),
      { wrapper }
    );

    await waitFor(() => expect(subscribe).toHaveBeenCalledTimes(1));
    // The list stays on its last fetch rather than the hook throwing through
    // the render tree, and nothing is healed against a feed that never came up.
    expect(invalidate).not.toHaveBeenCalled();
  });
});

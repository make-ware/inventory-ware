import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useQueryClient } from '@tanstack/react-query';
import { createQueryClient, getQueryClient } from './client';
import { QueryProvider } from './provider';
import { qk } from './keys';

describe('createQueryClient', () => {
  it('applies the shared cache defaults', () => {
    const defaults = createQueryClient().getDefaultOptions().queries;

    expect(defaults).toMatchObject({
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    });
  });

  it('returns a fresh client each call', () => {
    expect(createQueryClient()).not.toBe(createQueryClient());
  });
});

describe('getQueryClient', () => {
  it('reuses one client in the browser so remounts keep the cache', () => {
    expect(getQueryClient()).toBe(getQueryClient());
  });
});

describe('QueryProvider', () => {
  it('provides the singleton client to descendants', () => {
    function Probe() {
      const client = useQueryClient();
      return <span>{String(client === getQueryClient())}</span>;
    }

    render(
      <QueryProvider>
        <Probe />
      </QueryProvider>
    );

    expect(screen.getByText('true')).toBeInTheDocument();
  });
});

describe('qk', () => {
  const options = {
    q: 'lamp',
    filters: { functional: 'lighting' },
    sort: '-created',
  };

  it('scopes list keys by user so a different login cannot read the cache', () => {
    expect(qk.items('user-a', options)).not.toEqual(
      qk.items('user-b', options)
    );
  });

  it('is stable for equal inputs', () => {
    expect(qk.items('user-a', { ...options })).toEqual(
      qk.items('user-a', { ...options })
    );
  });

  it('keeps list keys under an invalidatable prefix', () => {
    expect(qk.items('user-a', options).slice(0, 1)).toEqual(['items']);
    expect(qk.itemsInfinite('user-a', options).slice(0, 2)).toEqual([
      'items',
      'infinite',
    ]);
    expect(qk.itemsByContainer('c1')).toEqual(['items', 'byContainer', 'c1']);
  });

  it('builds single-record and per-user keys', () => {
    expect(qk.itemById('i1')).toEqual(['item', 'i1']);
    expect(qk.containerById('c1')).toEqual(['container', 'c1']);
    expect(qk.images('user-a')).toEqual(['images', 'user-a']);
    expect(qk.categories('user-a')).toEqual(['categories', 'user-a']);
  });
});

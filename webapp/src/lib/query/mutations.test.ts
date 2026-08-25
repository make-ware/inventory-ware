import { describe, it, expect } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { ListResult } from 'pocketbase';
import { qk } from './keys';
import {
  cancelAndSnapshot,
  dropCachedRecords,
  itemCacheFilters,
  patchCachedRecords,
  restoreQueries,
} from './mutations';

interface Row {
  id: string;
  itemLabel: string;
  updated?: string;
}

const LIST_OPTIONS = { q: '', filters: {}, sort: '-created' };

function page(items: Row[], totalItems = items.length): ListResult<Row> {
  return { page: 1, perPage: 12, totalItems, totalPages: 1, items };
}

function row(id: string, itemLabel = id): Row {
  return { id, itemLabel, updated: '2026-08-25 10:00:00.000Z' };
}

/** A client holding one of every cached shape a write has to reach. */
function seededClient() {
  const client = new QueryClient();
  client.setQueryData(qk.itemsInfinite('u1', LIST_OPTIONS), {
    pages: [page([row('a'), row('b')])],
    pageParams: [1],
  });
  client.setQueryData(qk.itemsAll('u1'), page([row('a'), row('b')]));
  client.setQueryData(qk.itemsByContainer('c1'), page([row('a')]));
  client.setQueryData(qk.itemById('a'), row('a'));
  return client;
}

function infinitePages(client: QueryClient) {
  return client.getQueryData<{ pages: ListResult<Row>[] }>(
    qk.itemsInfinite('u1', LIST_OPTIONS)
  )!.pages;
}

describe('patchCachedRecords', () => {
  it('merges the patch into every cached shape holding the record', () => {
    const client = seededClient();

    patchCachedRecords<Row>(client, itemCacheFilters(['a']), ['a'], {
      itemLabel: 'edited',
    });

    expect(infinitePages(client)[0].items[0].itemLabel).toBe('edited');
    expect(
      client.getQueryData<ListResult<Row>>(qk.itemsAll('u1'))!.items[0]
        .itemLabel
    ).toBe('edited');
    expect(
      client.getQueryData<ListResult<Row>>(qk.itemsByContainer('c1'))!.items[0]
        .itemLabel
    ).toBe('edited');
    expect(client.getQueryData<Row>(qk.itemById('a'))!.itemLabel).toBe(
      'edited'
    );
  });

  it('leaves untouched rows, pages and entries at the same reference', () => {
    const client = seededClient();
    const before = infinitePages(client);
    const untouched = before[0].items[1];
    const otherEntry = client.getQueryData(qk.itemsByContainer('c1'));

    patchCachedRecords<Row>(client, itemCacheFilters(), ['a'], {
      itemLabel: 'edited',
    });

    // Structural sharing is what suppresses the render for rows that did not
    // move, so a no-op has to be reference-identical, not merely equal.
    expect(infinitePages(client)[0].items[1]).toBe(untouched);
    expect(client.getQueryData(qk.itemsByContainer('c1'))).not.toBe(otherEntry);

    const idle = seededClient();
    const idlePages = infinitePages(idle);
    patchCachedRecords<Row>(idle, itemCacheFilters(), ['missing'], {
      itemLabel: 'edited',
    });
    expect(infinitePages(idle)).toBe(idlePages);
  });

  it('does nothing without ids', () => {
    const client = seededClient();
    const before = infinitePages(client);
    patchCachedRecords<Row>(client, itemCacheFilters(), [], {
      itemLabel: 'edited',
    });
    expect(infinitePages(client)).toBe(before);
  });
});

describe('dropCachedRecords', () => {
  it('removes the rows and shrinks the totals', () => {
    const client = new QueryClient();
    client.setQueryData(qk.itemsInfinite('u1', LIST_OPTIONS), {
      pages: [page([row('a'), row('b')], 30)],
      pageParams: [1],
    });

    dropCachedRecords<Row>(client, itemCacheFilters(), ['a']);

    const [first] = infinitePages(client);
    expect(first.items.map((item) => item.id)).toEqual(['b']);
    expect(first.totalItems).toBe(29);
  });

  it('leaves a detail entry alone — a deleted record is evicted, not nulled', () => {
    const client = seededClient();

    dropCachedRecords<Row>(client, itemCacheFilters(['a']), ['a']);

    expect(client.getQueryData<Row>(qk.itemById('a'))).toEqual(row('a'));
  });
});

describe('cancelAndSnapshot / restoreQueries', () => {
  it('puts every touched entry back exactly as it was', async () => {
    const client = seededClient();
    const filters = itemCacheFilters(['a']);
    const before = infinitePages(client);

    const snapshot = await cancelAndSnapshot(client, filters);
    dropCachedRecords<Row>(client, filters, ['a']);
    patchCachedRecords<Row>(client, filters, ['b'], { itemLabel: 'edited' });
    expect(infinitePages(client)[0].items.map((item) => item.id)).toEqual([
      'b',
    ]);

    restoreQueries(client, snapshot);

    // Deep equality, not identity: writing the snapshot back runs through the
    // cache's own structural sharing, which rebuilds what actually changed.
    expect(infinitePages(client)).toEqual(before);
    expect(client.getQueryData<Row>(qk.itemById('a'))).toEqual(row('a'));
  });
});

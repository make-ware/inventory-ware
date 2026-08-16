import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ListResult, RecordModel } from 'pocketbase';
import { ALL_MAX_ITEMS } from './options.js';
import { executeQuery, renderQuery } from './run.js';
import type { ParsedQuery } from './options.js';
import { ITEM_SPEC } from './spec.js';

type Row = RecordModel & { itemLabel: string };

const row = (id: string): Row =>
  ({ id, itemLabel: `item-${id}` }) as unknown as Row;

const page = (
  items: Row[],
  overrides: Partial<ListResult<Row>> = {}
): ListResult<Row> => ({
  page: 1,
  perPage: 100,
  totalItems: items.length,
  totalPages: 1,
  items,
  ...overrides,
});

const query = (overrides: Partial<ParsedQuery> = {}): ParsedQuery => ({
  search: '',
  filters: {},
  sort: '-created',
  expand: undefined,
  fields: [...ITEM_SPEC.defaultColumns],
  columns: ITEM_SPEC.defaultColumns.map((key) => [key, key.toUpperCase()]),
  page: 1,
  perPage: 100,
  all: false,
  count: false,
  json: false,
  ...overrides,
});

describe('executeQuery', () => {
  it('fetches exactly one page by default', async () => {
    const fetch = vi.fn().mockResolvedValue(page([row('a')]));

    const result = await executeQuery(query({ page: 2, perPage: 20 }), fetch);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith({
      page: 2,
      perPage: 20,
      sort: '-created',
      expand: undefined,
    });
    expect(result.items).toHaveLength(1);
  });

  it('asks for a single record when counting', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(page([row('a')], { totalItems: 137 }));

    const result = await executeQuery(query({ count: true }), fetch);

    expect(fetch).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, perPage: 1 })
    );
    expect(result.totalItems).toBe(137);
    expect(result.items).toEqual([]);
  });

  it('walks every page for --all', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        page([row('a'), row('b')], { totalItems: 3, totalPages: 2 })
      )
      .mockResolvedValueOnce(
        page([row('c')], { page: 2, totalItems: 3, totalPages: 2 })
      );

    const result = await executeQuery(query({ all: true, perPage: 2 }), fetch);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ page: 2 })
    );
    expect(result.items.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(result.totalItems).toBe(3);
    expect(result.truncated).toBeUndefined();
  });

  it('stops at the safety cap and says so', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    const big = Array.from({ length: ALL_MAX_ITEMS }, (_, i) => row(String(i)));
    const fetch = vi
      .fn()
      .mockResolvedValue(page(big, { totalItems: 24_310, totalPages: 3 }));

    const result = await executeQuery(
      query({ all: true, perPage: ALL_MAX_ITEMS }),
      fetch
    );

    expect(result.truncated).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/--all stopped at 10000 of 24310/)
    );
  });

  it('does not loop forever when the response omits totalPages', async () => {
    // A thin mock or an unusual response must not hang the --all loop.
    const fetch = vi.fn().mockResolvedValue({
      items: [row('a')],
      totalItems: 1,
    } as unknown as ListResult<Row>);

    const result = await executeQuery(query({ all: true }), fetch);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.items).toHaveLength(1);
  });
});

describe('renderQuery', () => {
  let lines: string[];

  beforeEach(() => {
    lines = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.join(' '));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits the same envelope shape for --json', () => {
    renderQuery(
      query({ json: true, fields: ['id', 'itemLabel'] }),
      page([row('a')], { totalItems: 1 })
    );

    const payload = JSON.parse(lines.join('\n'));
    expect(payload).toMatchObject({
      page: 1,
      perPage: 100,
      totalItems: 1,
      totalPages: 1,
    });
    expect(payload.items).toEqual([{ id: 'a', itemLabel: 'item-a' }]);
  });

  it('projects --fields in JSON output', () => {
    renderQuery(query({ json: true, fields: ['id'] }), page([row('a')]));
    expect(JSON.parse(lines.join('\n')).items).toEqual([{ id: 'a' }]);
  });

  it('prints just the number for --count', () => {
    renderQuery(query({ count: true }), page([], { totalItems: 42 }));
    expect(lines).toEqual(['42']);
  });

  it('prints a count object for --count --json', () => {
    renderQuery(
      query({ count: true, json: true }),
      page([], { totalItems: 42 })
    );
    expect(JSON.parse(lines.join('\n'))).toEqual({ totalItems: 42 });
  });

  it('marks a truncated --all run in the envelope', () => {
    renderQuery(query({ json: true }), {
      ...page([row('a')]),
      truncated: true,
    });
    expect(JSON.parse(lines.join('\n')).truncated).toBe(true);
  });
});

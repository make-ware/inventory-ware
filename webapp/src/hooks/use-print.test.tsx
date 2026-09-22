import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { toast } from 'sonner';
import { ContainerMutator, ItemMutator } from '@project/shared';

const getList = vi.fn();
const getOne = vi.fn();

vi.mock('@/lib/pocketbase-client', () => ({
  default: {
    authStore: { token: 'mock-token' },
    collection: () => ({ getList, getOne }),
    files: { getURL: () => 'http://localhost:8090/file.png' },
  },
}));

const win = {
  close: vi.fn(),
  document: { open: vi.fn(), write: vi.fn(), close: vi.fn() },
};

import pb from '@/lib/pocketbase-client';
import {
  EXPORT_PAGE_SIZE,
  PRINT_ITEM_EXPAND,
  containersQuerySource,
  formatPrintLabel,
  itemsByIdSource,
  itemsQuerySource,
  usePrint,
} from './use-print';
import { buildItemSearchOptions } from './use-items';

const itemMutator = new ItemMutator(pb);
const containerMutator = new ContainerMutator(pb);

function makeItem(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    itemLabel: `Item ${id}`,
    itemType: 'drill',
    categoryFunctional: 'tools',
    categorySpecific: 'power-tools',
    created: '2026-01-01T00:00:00Z',
    updated: '2026-01-01T00:00:00Z',
    UserRef: 'u1',
    ...extra,
  };
}

function makeContainer(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    containerLabel: `Container ${id}`,
    containerNotes: '',
    created: '2026-01-01T00:00:00Z',
    updated: '2026-01-01T00:00:00Z',
    UserRef: 'u1',
    ...extra,
  };
}

function makePage<T>(page: number, totalPages: number, items: T[]) {
  return {
    page,
    perPage: EXPORT_PAGE_SIZE,
    totalItems: items.length,
    totalPages,
    items,
  };
}

/** Everything written into the export window after the placeholder. */
function writtenHtml() {
  return win.document.write.mock.calls.at(-1)?.[0] as string;
}

const pages = (html: string) => html.match(/class="page"/g)?.length ?? 0;

beforeEach(() => {
  getList.mockReset();
  getOne.mockReset();
  win.close.mockReset();
  win.document.write.mockReset();
  vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
});

describe('itemsQuerySource', () => {
  it('walks every page with the grid’s filter and sort, deduped', async () => {
    getList
      .mockResolvedValueOnce(
        makePage(1, 2, [
          makeItem('a'),
          makeItem('b'),
          makeItem('x', { UserRef: 'u2' }),
        ])
      )
      .mockResolvedValueOnce(makePage(2, 2, [makeItem('b'), makeItem('c')]));

    const filters = { itemType: 'drill', functional: '' };
    const source = itemsQuerySource(itemMutator, {
      userId: 'u1',
      q: 'dew',
      filters,
      sort: '-itemLabel',
      sortLabel: 'Name (Z-A)',
    });
    const records = await source.load();

    expect(getList).toHaveBeenCalledTimes(2);
    const expected = buildItemSearchOptions({ filters, sort: '-itemLabel' });
    const [page, perPage, options] = getList.mock.calls[1];
    expect(page).toBe(2);
    expect(perPage).toBe(EXPORT_PAGE_SIZE);
    expect(options.sort).toBe(expected.sort);
    expect(options.expand).toBe(PRINT_ITEM_EXPAND);
    expect(options.filter).toContain('itemType');
    expect(options.filter).not.toContain('categoryFunctional');

    // Deduped, in server order, and never another user's row.
    expect(records.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(source.entity).toBe('item');
    expect(source.title).toBe('Inventory items');
    expect(source.scope).toEqual({
      query: 'dew',
      filters: [{ label: 'Type', value: 'drill' }],
      sortLabel: 'Name (Z-A)',
    });
  });

  it('sends no request for a query the grid would withhold', async () => {
    const rejected = itemsQuerySource(itemMutator, { userId: 'u1', q: 'C:\\' });
    expect(await rejected.load()).toEqual([]);

    const signedOut = itemsQuerySource(itemMutator, { userId: null });
    expect(await signedOut.load()).toEqual([]);

    expect(getList).not.toHaveBeenCalled();
  });
});

describe('containersQuerySource', () => {
  it('walks the containers query with its image expanded', async () => {
    getList.mockResolvedValueOnce(makePage(1, 1, [makeContainer('c1')]));

    const source = containersQuerySource(containerMutator, {
      userId: 'u1',
      q: 'gar',
      sort: '+containerLabel',
      sortLabel: 'Name (A-Z)',
    });
    const records = await source.load();

    const [, , options] = getList.mock.calls[0];
    expect(options.sort).toBe('+containerLabel');
    expect(options.expand).toBe('ImageRef');
    expect(options.filter).toContain('gar');
    expect(records.map((container) => container.id)).toEqual(['c1']);
    expect(source.scope).toEqual({ query: 'gar', sortLabel: 'Name (A-Z)' });
  });
});

describe('itemsByIdSource', () => {
  it('keeps selection order and drops missing records', async () => {
    getOne.mockImplementation(async (id: string) => {
      if (id === 'gone')
        throw Object.assign(new Error('Not found'), { status: 404 });
      return makeItem(id);
    });

    const records = await itemsByIdSource(itemMutator, [
      'z',
      'gone',
      'a',
    ]).load();

    expect(records.map((item) => item.id)).toEqual(['z', 'a']);
    expect(getOne).toHaveBeenCalledWith(
      'z',
      expect.objectContaining({ expand: PRINT_ITEM_EXPAND })
    );
  });
});

describe('printSummary', () => {
  it('resolves an item’s container label when it did not arrive expanded', async () => {
    getOne.mockImplementation(async (id: string) => makeContainer(id));
    const { result } = renderHook(() => usePrint());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.printSummary({
        entity: 'item',
        records: [
          makeItem('a', { ContainerRef: 'c1' }),
          makeItem('b', { ContainerRef: 'c1' }),
          makeItem('c', {
            ContainerRef: 'c2',
            expand: {
              ContainerRef: makeContainer('c2', { containerLabel: 'Expanded' }),
            },
          }),
        ] as never,
      });
    });

    expect(ok).toBe(true);
    // One fetch per distinct container that was not expanded.
    expect(getOne).toHaveBeenCalledTimes(1);
    expect(getOne).toHaveBeenCalledWith('c1', expect.anything());
    const html = writtenHtml();
    expect(pages(html)).toBe(3);
    expect(html.match(/Container c1/g)).toHaveLength(2);
    expect(html).toContain('Expanded');
    expect(html).toContain('<title>Inventory items</title>');
    expect(html).toContain('<dt>Items</dt><dd>3</dd>');
    expect(result.current.isPrinting).toBe(false);
  });

  it('titles a single record by its own name and honours a given title', async () => {
    const { result } = renderHook(() => usePrint());

    await act(async () => {
      await result.current.printSummary({
        entity: 'item',
        records: [makeItem('a')] as never,
      });
    });
    expect(writtenHtml()).toContain('<title>Item a</title>');

    await act(async () => {
      await result.current.printSummary(
        { entity: 'item', records: [makeItem('a')] as never },
        { title: 'Selected items', scope: { query: 'dew' } }
      );
    });
    expect(writtenHtml()).toContain('<title>Selected items</title>');
    expect(writtenHtml()).toContain('<dt>Search</dt><dd>dew</dd>');
  });

  it('loads every page of a container’s contents', async () => {
    getList
      .mockResolvedValueOnce(makePage(1, 2, [makeItem('a')]))
      .mockResolvedValueOnce(makePage(2, 2, [makeItem('b')]));
    const { result } = renderHook(() => usePrint());

    await act(async () => {
      await result.current.printSummary({
        entity: 'container',
        records: [makeContainer('c1')] as never,
      });
    });

    expect(getList).toHaveBeenCalledTimes(2);
    expect(getList.mock.calls[0][2].filter).toContain('ContainerRef="c1"');
    expect(getList.mock.calls[0][2].sort).toBe('itemLabel');
    const html = writtenHtml();
    expect(html).toContain('Contents (2)');
    expect(html).toContain('<dt>Containers</dt><dd>1</dd>');
    expect(html).toContain('<title>Container c1</title>');
  });

  it('loads what analysis filed against an image', async () => {
    getList
      .mockResolvedValueOnce(makePage(1, 1, [makeItem('a')]))
      .mockResolvedValueOnce(makePage(1, 1, [makeContainer('c1')]));
    const { result } = renderHook(() => usePrint());

    await act(async () => {
      await result.current.printSummary({
        entity: 'image',
        records: [
          {
            id: 'img1',
            file: 'x.jpg',
            imageType: 'item',
            analysisStatus: 'completed',
            created: '',
            updated: '',
            UserRef: 'u1',
          },
        ] as never,
      });
    });

    expect(getList).toHaveBeenCalledTimes(2);
    expect(getList.mock.calls[0][2].filter).toContain('ImageRef="img1"');
    expect(getList.mock.calls[1][2].filter).toContain('ImageRef="img1"');
    const html = writtenHtml();
    expect(html).toContain('<li>Item a</li>');
    expect(html).toContain('<li>Container c1</li>');
  });

  it('closes the window and says so when there is nothing to print', async () => {
    const { result } = renderHook(() => usePrint());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.printSummary({
        entity: 'container',
        records: [],
      });
    });

    expect(ok).toBe(true);
    expect(win.close).toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith('There are no containers to print');
  });

  it('reports a blocked pop-up without fetching', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const { result } = renderHook(() => usePrint());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.printSummary({
        entity: 'item',
        records: [makeItem('a', { ContainerRef: 'c1' })] as never,
      });
    });

    expect(ok).toBe(false);
    expect(getOne).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/Pop-up blocked/)
    );
  });

  it('closes the window and stays failed when a fetch throws', async () => {
    getOne.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => usePrint());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.printSummary({
        entity: 'item',
        records: [makeItem('a', { ContainerRef: 'c1' })] as never,
      });
    });

    expect(ok).toBe(false);
    expect(win.close).toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('offline');
  });
});

describe('printLabels', () => {
  it('fetches one label per id, for the given entity, into one job', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => ({
      ok: true,
      json: async () => ({
        svg: `<svg data-id="${JSON.parse(init.body as string).targetId}"></svg>`,
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const progress: [number, number][] = [];
    const { result } = renderHook(() => usePrint());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.printLabels('image', ['i1', 'i2'], 'qr-only', {
        onProgress: (current, total) => progress.push([current, total]),
      });
    });

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [index, id] of ['i1', 'i2'].entries()) {
      const [url, init] = fetchMock.mock.calls[index];
      expect(url).toBe('/api-next/labels/generate');
      expect(JSON.parse(init.body as string)).toEqual({
        targetId: id,
        targetType: 'image',
        format: 'qr-only',
      });
    }
    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
    expect(writtenHtml().match(/data-id=/g)).toHaveLength(2);
    vi.unstubAllGlobals();
  });

  it('closes the window and says so when there is nothing to print', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => usePrint());

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.printLabels('item', [], 'shipping-4x6');
    });

    expect(ok).toBe(true);
    expect(win.close).toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith('There are no items to print');
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('formatPrintLabel', () => {
  it('appends a positive count', () => {
    expect(formatPrintLabel('Items', 2)).toBe('Print Items [2]');
    expect(formatPrintLabel(undefined, 3)).toBe('Print [3]');
  });

  it('omits a missing or zero count', () => {
    expect(formatPrintLabel('Items')).toBe('Print Items');
    expect(formatPrintLabel('Items', 0)).toBe('Print Items');
    expect(formatPrintLabel()).toBe('Print');
  });

  it('works for other entities', () => {
    expect(formatPrintLabel('Containers', 5)).toBe('Print Containers [5]');
  });
});

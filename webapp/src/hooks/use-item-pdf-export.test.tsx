import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const getList = vi.fn();
const getOne = vi.fn();

vi.mock('@/lib/pocketbase-client', () => ({
  default: {
    collection: () => ({ getList, getOne }),
    files: { getURL: () => 'http://localhost:8090/file.png' },
  },
}));

const toast = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const win = {
  close: vi.fn(),
  document: { open: vi.fn(), write: vi.fn(), close: vi.fn() },
};

import {
  useItemPdfExport,
  formatPrintLabel,
  EXPORT_PAGE_SIZE,
} from './use-item-pdf-export';
import { buildItemSearchOptions } from './use-items';

function makeItem(id: string, userId = 'u1') {
  return {
    id,
    itemLabel: `Item ${id}`,
    itemType: 'drill',
    categoryFunctional: 'tools',
    categorySpecific: 'power-tools',
    created: '2026-01-01T00:00:00Z',
    updated: '2026-01-01T00:00:00Z',
    UserRef: userId,
  };
}

function makePage(page: number, totalPages: number, ids: string[]) {
  return {
    page,
    perPage: EXPORT_PAGE_SIZE,
    totalItems: ids.length,
    totalPages,
    items: ids.map((id) => makeItem(id)),
  };
}

/** Everything written into the export window after the placeholder. */
function writtenHtml() {
  return win.document.write.mock.calls.at(-1)?.[0] as string;
}

beforeEach(() => {
  getList.mockReset();
  getOne.mockReset();
  toast.info.mockReset();
  toast.error.mockReset();
  win.close.mockReset();
  win.document.write.mockReset();
  vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
});

describe('exportFiltered', () => {
  it('walks every page with the grid’s filter and sort', async () => {
    getList
      .mockResolvedValueOnce(makePage(1, 2, ['a', 'b']))
      .mockResolvedValueOnce(makePage(2, 2, ['b', 'c']));
    const { result } = renderHook(() => useItemPdfExport());

    const filters = { itemType: 'drill', functional: '' };
    await act(() =>
      result.current.exportFiltered({
        userId: 'u1',
        q: 'dew',
        filters,
        sort: '-itemLabel',
        sortLabel: 'Name (Z-A)',
      })
    );

    expect(getList).toHaveBeenCalledTimes(2);
    const expected = buildItemSearchOptions({ filters, sort: '-itemLabel' });
    const [page, perPage, options] = getList.mock.calls[1];
    expect(page).toBe(2);
    expect(perPage).toBe(EXPORT_PAGE_SIZE);
    expect(options.sort).toBe(expected.sort);
    expect(options.expand).toBe('ImageRef,ContainerRef');
    expect(options.filter).toContain('itemType');
    expect(options.filter).not.toContain('categoryFunctional');

    const html = writtenHtml();
    // Deduped, in server order.
    expect(html.match(/class="item-page"/g)).toHaveLength(3);
    expect(html.indexOf('Item a')).toBeLessThan(html.indexOf('Item c'));
    expect(html).toContain('Name (Z-A)');
    expect(result.current.isExporting).toBe(false);
  });

  it('closes the window and says so when nothing matches', async () => {
    getList.mockResolvedValue(makePage(1, 0, []));
    const { result } = renderHook(() => useItemPdfExport());

    await act(() => result.current.exportFiltered({ userId: 'u1' }));

    expect(win.close).toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith('There are no items to export');
  });

  it('sends no request for a query the grid would withhold', async () => {
    const { result } = renderHook(() => useItemPdfExport());

    await act(() => result.current.exportFiltered({ userId: 'u1', q: 'C:\\' }));

    expect(getList).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith('There are no items to export');
  });

  it('reports a blocked pop-up without fetching', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const { result } = renderHook(() => useItemPdfExport());

    await act(() => result.current.exportFiltered({ userId: 'u1' }));

    expect(getList).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/Pop-up blocked/)
    );
  });
});

describe('exportSelected', () => {
  it('keeps selection order and drops missing records', async () => {
    getOne.mockImplementation(async (id: string) => {
      if (id === 'gone')
        throw Object.assign(new Error('Not found'), { status: 404 });
      return makeItem(id);
    });
    const { result } = renderHook(() => useItemPdfExport());

    await act(() => result.current.exportSelected(['z', 'gone', 'a']));

    const html = writtenHtml();
    expect(html.match(/class="item-page"/g)).toHaveLength(2);
    expect(html.indexOf('Item z')).toBeLessThan(html.indexOf('Item a'));
    expect(html).toContain('Selected items (2)');
  });
});

describe('formatPrintLabel', () => {
  it('appends a positive count', () => {
    expect(formatPrintLabel('Items', 2)).toBe('Print Items [2]');
  });

  it('omits a missing or zero count', () => {
    expect(formatPrintLabel('Items')).toBe('Print Items');
    expect(formatPrintLabel('Items', 0)).toBe('Print Items');
    expect(formatPrintLabel('Item')).toBe('Print Item');
  });

  it('works for other entities', () => {
    expect(formatPrintLabel('Containers', 5)).toBe('Print Containers [5]');
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/lib/pocketbase-client', () => ({
  default: { files: { getURL: () => 'http://localhost:8090/file.png' } },
}));

import type { Item } from '@project/shared';
import {
  buildItemsExportHtml,
  escapeHtml,
  openExportWindow,
  optionalValueFields,
} from '../item-pdf-export';
import type { ExportSummary } from '../item-pdf-export';

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'i1',
    collectionId: 'c',
    collectionName: 'Items',
    created: '2026-01-02T03:04:05.000Z',
    updated: '2026-02-03T04:05:06.000Z',
    itemLabel: 'Cordless Drill',
    itemName: 'DCD771',
    itemNotes: '',
    categoryFunctional: 'tools',
    categorySpecific: 'power-tools',
    itemType: 'drill',
    itemManufacturer: 'DeWalt',
    itemAttributes: [],
    UserRef: 'u1',
    ...overrides,
  } as Item;
}

const summary: ExportSummary = {
  title: 'Inventory items',
  generatedAt: new Date('2026-09-21T10:00:00Z'),
  count: 1,
};

describe('escapeHtml', () => {
  it('escapes markup characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;'
    );
  });
});

describe('buildItemsExportHtml', () => {
  it('renders user content inert', () => {
    const html = buildItemsExportHtml(
      [
        makeItem({
          itemLabel: '<script>alert(1)</script>',
          itemNotes: '<img src=x onerror=alert(2)>',
        }),
      ],
      summary
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('shows the placeholder without an image and the image with one', () => {
    expect(buildItemsExportHtml([makeItem()], summary)).toContain(
      'No primary image'
    );

    const withImage = makeItem({
      ImageRef: 'img1',
      expand: { ImageRef: { id: 'img1', file: 'a.png' } as never },
    });
    const html = buildItemsExportHtml([withImage], summary);
    expect(html).toContain('src="http://localhost:8090/file.png"');
    expect(html).not.toContain('No primary image');
  });

  it('renders one page per item with its fields', () => {
    const html = buildItemsExportHtml(
      [
        makeItem({
          itemAttributes: [{ name: 'voltage', value: '20v' }],
          expand: { ContainerRef: { containerLabel: 'Garage Shelf' } as never },
        }),
        makeItem({ id: 'i2', itemLabel: 'Hammer' }),
      ],
      { ...summary, count: 2 }
    );
    expect(html.match(/class="item-page"/g)).toHaveLength(2);
    expect(html).toContain('Garage Shelf');
    expect(html).toContain('DeWalt');
    expect(html).toContain('voltage');
    expect(html).toContain('@page { size: A4');
  });

  it('prefers the caller-supplied container label', () => {
    const html = buildItemsExportHtml(
      [
        {
          ...makeItem({
            expand: { ContainerRef: { containerLabel: 'Old' } as never },
          }),
          exportContainerLabel: 'New',
        },
      ],
      summary
    );
    expect(html).toContain('New');
    expect(html).not.toContain('>Old<');
  });

  it('summarises the query, filters and sort, or says None', () => {
    const empty = buildItemsExportHtml([makeItem()], summary);
    expect(empty).toContain('<dt>Search</dt><dd>None</dd>');
    expect(empty).toContain('<dt>Filters</dt><dd>None</dd>');
    expect(empty).toContain('<dt>Sort</dt><dd>None</dd>');

    const full = buildItemsExportHtml([makeItem()], {
      ...summary,
      count: 7,
      query: 'drill',
      filters: [{ label: 'Type', value: 'Drill' }],
      sortLabel: 'Name (Z-A)',
    });
    expect(full).toContain('<dt>Items</dt><dd>7</dd>');
    expect(full).toContain('<dt>Search</dt><dd>drill</dd>');
    expect(full).toContain('Type: Drill');
    expect(full).toContain('Name (Z-A)');
  });

  it('renders estimated value only when the record has one', () => {
    expect(buildItemsExportHtml([makeItem()], summary)).not.toContain(
      'Estimated value'
    );
    const valued = {
      ...makeItem(),
      estimatedValue: 120,
      estimatedValueCurrency: 'USD',
    };
    expect(optionalValueFields(valued)).toEqual([
      { label: 'Estimated value', value: '120 USD' },
    ]);
    expect(buildItemsExportHtml([valued], summary)).toContain('120 USD');
  });
});

describe('openExportWindow', () => {
  afterEach(() => vi.restoreAllMocks());

  it('throws a pop-up-blocked error when window.open is refused', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    expect(() => openExportWindow()).toThrow(/Pop-up blocked/);
  });
});

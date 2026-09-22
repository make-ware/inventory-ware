import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/lib/pocketbase-client', () => ({
  default: { files: { getURL: () => 'http://localhost:8090/file.png' } },
}));

import { formatItemValue } from '@project/shared';
import type { Container, Image, Item } from '@project/shared';
import {
  buildPreviewHtml,
  buildSummaryHtml,
  escapeHtml,
  openExportWindow,
  optionalValueFields,
  recordTitle,
} from '../print-summary';
import type { SummaryHeader } from '../print-summary';

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

function makeContainer(overrides: Partial<Container> = {}): Container {
  return {
    id: 'c1',
    collectionId: 'c',
    collectionName: 'Containers',
    created: '2026-01-02T03:04:05.000Z',
    updated: '2026-02-03T04:05:06.000Z',
    containerLabel: 'Garage Shelf',
    containerNotes: 'Top shelf\nleft side',
    UserRef: 'u1',
    ...overrides,
  } as Container;
}

function makeImage(overrides: Partial<Image> = {}): Image {
  return {
    id: 'img1',
    collectionId: 'c',
    collectionName: 'Images',
    created: '2026-01-02T03:04:05.000Z',
    updated: '2026-02-03T04:05:06.000Z',
    file: 'garage_abc123.jpg',
    imageType: 'container',
    analysisStatus: 'completed',
    UserRef: 'u1',
    ...overrides,
  } as Image;
}

const header: SummaryHeader = {
  title: 'Inventory items',
  generatedAt: new Date('2026-09-21T10:00:00Z'),
  count: 1,
  countLabel: 'Items',
};

const pages = (html: string) => html.match(/class="page"/g)?.length ?? 0;

describe('escapeHtml', () => {
  it('escapes markup characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;'
    );
  });
});

describe('recordTitle', () => {
  it('names each entity by its own label', () => {
    expect(recordTitle('item', makeItem())).toBe('Cordless Drill');
    expect(recordTitle('container', makeContainer())).toBe('Garage Shelf');
    expect(recordTitle('image', makeImage())).toBe('garage_abc123.jpg');
  });
});

describe('buildSummaryHtml', () => {
  it('renders user content inert', () => {
    const html = buildSummaryHtml(
      [
        {
          entity: 'item',
          record: makeItem({
            itemLabel: '<script>alert(1)</script>',
            itemNotes: '<img src=x onerror=alert(2)>',
          }),
        },
      ],
      header
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('shows the placeholder without an image and the image with one', () => {
    expect(
      buildSummaryHtml([{ entity: 'item', record: makeItem() }], header)
    ).toContain('No primary image');

    const withImage = makeItem({
      ImageRef: 'img1',
      expand: { ImageRef: { id: 'img1', file: 'a.png' } as never },
    });
    const html = buildSummaryHtml(
      [{ entity: 'item', record: withImage }],
      header
    );
    expect(html).toContain('src="http://localhost:8090/file.png"');
    expect(html).not.toContain('No primary image');
  });

  it('renders one page per item with its fields', () => {
    const html = buildSummaryHtml(
      [
        {
          entity: 'item',
          record: makeItem({
            itemAttributes: [{ name: 'voltage', value: '20v' }],
            expand: {
              ContainerRef: { containerLabel: 'Garage Shelf' } as never,
            },
          }),
        },
        { entity: 'item', record: makeItem({ id: 'i2', itemLabel: 'Hammer' }) },
      ],
      { ...header, count: 2 }
    );
    expect(pages(html)).toBe(2);
    expect(html).toContain('Garage Shelf');
    expect(html).toContain('DeWalt');
    expect(html).toContain('voltage');
    expect(html).toContain('<dt>Item ID</dt><dd>i1</dd>');
    expect(html).toContain('@page { size: A4');
  });

  it('prefers the caller-supplied container label', () => {
    const html = buildSummaryHtml(
      [
        {
          entity: 'item',
          record: makeItem({
            expand: { ContainerRef: { containerLabel: 'Old' } as never },
          }),
          containerLabel: 'New',
        },
      ],
      header
    );
    expect(html).toContain('New');
    expect(html).not.toContain('>Old<');
  });

  it('describes the scope only for a list export', () => {
    const none = buildSummaryHtml(
      [{ entity: 'item', record: makeItem() }],
      header
    );
    expect(none).toContain('<dt>Items</dt><dd>1</dd>');
    expect(none).not.toContain('<dt>Search</dt>');

    const empty = buildSummaryHtml([{ entity: 'item', record: makeItem() }], {
      ...header,
      scope: {},
    });
    expect(empty).toContain('<dt>Search</dt><dd>None</dd>');
    expect(empty).toContain('<dt>Filters</dt><dd>None</dd>');
    expect(empty).toContain('<dt>Sort</dt><dd>None</dd>');

    const full = buildSummaryHtml([{ entity: 'item', record: makeItem() }], {
      ...header,
      count: 7,
      scope: {
        query: 'drill',
        filters: [{ label: 'Type', value: 'Drill' }],
        sortLabel: 'Name (Z-A)',
      },
    });
    expect(full).toContain('<dt>Items</dt><dd>7</dd>');
    expect(full).toContain('<dt>Search</dt><dd>drill</dd>');
    expect(full).toContain('Type: Drill');
    expect(full).toContain('Name (Z-A)');
  });

  it('renders value rows only when the record has them', () => {
    const none = buildSummaryHtml(
      [
        {
          entity: 'item',
          record: makeItem({ itemValue: 0, estimatedValue: 0 }),
        },
      ],
      header
    );
    expect(none).not.toContain('<dt>Value</dt>');
    expect(none).not.toContain('Estimated value');

    const valued = makeItem({
      itemValue: 120,
      estimatedValue: 99.5,
      valueCurrency: 'EUR',
    });
    expect(optionalValueFields(valued)).toEqual([
      { label: 'Value', value: formatItemValue(120, 'EUR') },
      { label: 'Estimated value', value: formatItemValue(99.5, 'EUR') },
    ]);
    const html = buildSummaryHtml([{ entity: 'item', record: valued }], header);
    expect(html).toContain('<dt>Value</dt>');
    expect(html).toContain('<dt>Estimated value</dt>');
  });

  it('renders a container page with its notes and contents', () => {
    const html = buildSummaryHtml(
      [
        {
          entity: 'container',
          record: makeContainer(),
          items: [
            makeItem(),
            makeItem({ id: 'i2', itemLabel: 'Hammer', itemManufacturer: '' }),
          ],
        },
      ],
      { ...header, title: 'Containers', countLabel: 'Containers' }
    );
    expect(pages(html)).toBe(1);
    expect(html).toContain('data-entity="container"');
    expect(html).toContain('<h2>Garage Shelf</h2>');
    expect(html).toContain('Top shelf\nleft side');
    expect(html).toContain('<dt>Items</dt><dd>2</dd>');
    expect(html).toContain('<dt>Container ID</dt><dd>c1</dd>');
    expect(html).toContain('Contents (2)');
    expect(html).toContain(
      '<td>Cordless Drill</td><td>drill</td><td>DeWalt</td>'
    );
    expect(html).toContain('<td>Hammer</td>');
    expect(html).toContain('No image');
  });

  it('says when a container is empty, and omits contents it was not given', () => {
    const empty = buildSummaryHtml(
      [{ entity: 'container', record: makeContainer(), items: [] }],
      header
    );
    expect(empty).toContain('No items in this container');

    const unknown = buildSummaryHtml(
      [{ entity: 'container', record: makeContainer() }],
      header
    );
    expect(unknown).not.toContain('Contents');
    expect(unknown).toContain(
      '<dt>Items</dt><dd><span class="empty">—</span></dd>'
    );
  });

  it('renders an image page with its analysis results', () => {
    const html = buildSummaryHtml(
      [
        {
          entity: 'image',
          record: makeImage(),
          items: [makeItem()],
          containers: [],
        },
      ],
      { ...header, title: 'Images', countLabel: 'Images' }
    );
    expect(html).toContain('data-entity="image"');
    expect(html).toContain('<h2>garage_abc123.jpg</h2>');
    expect(html).toContain('src="http://localhost:8090/file.png"');
    expect(html).toContain('<dt>Type</dt><dd>Container</dd>');
    expect(html).toContain('<dt>Analysis status</dt><dd>Completed</dd>');
    expect(html).toContain('Analysis results');
    expect(html).toContain('<li>Cordless Drill</li>');
    expect(html).toContain(
      '<dt>Containers</dt><dd><span class="empty">None</span></dd>'
    );
  });
});

describe('buildPreviewHtml', () => {
  it('renders one page with no header and no print script', () => {
    const html = buildPreviewHtml({ entity: 'item', record: makeItem() });
    expect(pages(html)).toBe(1);
    expect(html).not.toContain('class="summary"');
    expect(html).not.toContain('window.print');
    expect(html).toContain('<title>Cordless Drill</title>');
  });
});

describe('openExportWindow', () => {
  afterEach(() => vi.restoreAllMocks());

  it('throws a pop-up-blocked error when window.open is refused', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    expect(() => openExportWindow()).toThrow(/Pop-up blocked/);
  });
});

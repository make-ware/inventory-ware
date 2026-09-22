/**
 * Printable summary pages for items, containers and images.
 *
 * "PDF" here means the browser's own print-to-PDF: the export is an HTML
 * document written into a new window that prints itself once its images have
 * settled. Nothing is fetched in this module — callers (see
 * `@/hooks/use-print`) hand it records that already went through the
 * mutators, plus whatever they resolved alongside (a container's contents, an
 * image's analysis results), so the HTML is a pure function of its input.
 *
 * The window is opened separately from the render because browsers only
 * honour `window.open` inside the click that asked for it: open first,
 * fetch, then write into the window you already hold.
 *
 * Deliberately not re-exported from the `@/services` barrel — it touches
 * `window` and the client PocketBase singleton.
 */
import {
  formatCategoryLabel,
  formatItemValue,
  hasItemValue,
  resolveItemCurrency,
} from '@project/shared';
import type { Container, Image, Item } from '@project/shared';
import { getExpandedImageUrl, getImageFileUrl } from '@/lib/image-utils';

export type PrintEntity = 'item' | 'container' | 'image';

export interface ItemPrintTarget {
  entity: 'item';
  record: Item;
  /** Overrides `expand.ContainerRef.containerLabel` when the caller has it. */
  containerLabel?: string;
}

export interface ContainerPrintTarget {
  entity: 'container';
  record: Container;
  /** The container's contents; the section is omitted when not loaded. */
  items?: Item[];
}

export interface ImagePrintTarget {
  entity: 'image';
  record: Image;
  /** What analysis filed against the image; omitted when not loaded. */
  items?: Item[];
  containers?: Container[];
}

/** One record plus anything the caller resolved for it outside the record. */
export type PrintTarget =
  ItemPrintTarget | ContainerPrintTarget | ImagePrintTarget;

/** The record type behind each entity. */
export type PrintRecord<E extends PrintEntity = PrintEntity> = E extends 'item'
  ? Item
  : E extends 'container'
    ? Container
    : Image;

export const PRINT_ENTITY_NOUNS: Record<
  PrintEntity,
  { singular: string; plural: string }
> = {
  item: { singular: 'item', plural: 'items' },
  container: { singular: 'container', plural: 'containers' },
  image: { singular: 'image', plural: 'images' },
};

/** The document title when several records print together. */
export const PRINT_DEFAULT_TITLES: Record<PrintEntity, string> = {
  item: 'Inventory items',
  container: 'Containers',
  image: 'Images',
};

/** How the print was narrowed, for the summary header of a list export. */
export interface SummaryScope {
  query?: string;
  filters?: { label: string; value: string }[];
  sortLabel?: string;
}

export interface SummaryHeader {
  title: string;
  generatedAt: Date;
  count: number;
  /** Noun for the count row, e.g. "Items". */
  countLabel: string;
  /**
   * Present for a list export, whose header then always shows the search,
   * filter and sort rows (with "None" where unset); absent for a print that
   * started from a record or a selection, which have no query to describe.
   */
  scope?: SummaryScope;
}

const POPUP_BLOCKED_MESSAGE =
  'Pop-up blocked. Please allow pop-ups to export a PDF.';

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value: string | Date | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function capitalise(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

/** The heading a record prints under; also the print dialog's row title. */
export function recordTitle(entity: PrintEntity, record: PrintRecord): string {
  switch (entity) {
    case 'item':
      return (record as Item).itemLabel;
    case 'container':
      return (record as Container).containerLabel;
    case 'image':
      return (record as Image).file;
  }
}

/**
 * The item's value rows: the authoritative value and the AI estimate, each
 * only when recorded (`0` means unset — see `hasItemValue`), formatted in
 * the item's currency by the same helper the detail page uses.
 */
export function optionalValueFields(
  item: Item
): { label: string; value: string }[] {
  const currency = resolveItemCurrency(item);
  const rows: { label: string; value: string }[] = [];
  if (hasItemValue(item.itemValue)) {
    rows.push({
      label: 'Value',
      value: formatItemValue(item.itemValue, currency),
    });
  }
  if (hasItemValue(item.estimatedValue)) {
    rows.push({
      label: 'Estimated value',
      value: formatItemValue(item.estimatedValue, currency),
    });
  }
  return rows;
}

function field(label: string, value: unknown): string {
  const text = isPresent(value)
    ? escapeHtml(value)
    : '<span class="empty">—</span>';
  return `<div class="field"><dt>${escapeHtml(label)}</dt><dd>${text}</dd></div>`;
}

function image(url: string | undefined, alt: string, placeholder: string) {
  return url
    ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" />`
    : `<div class="no-image">${escapeHtml(placeholder)}</div>`;
}

function notesSection(notes: unknown): string {
  return isPresent(notes)
    ? `<section><h3>Notes</h3><p class="notes">${escapeHtml(notes)}</p></section>`
    : '';
}

function renderScope(scope: SummaryScope): string {
  const filters = scope.filters?.length
    ? scope.filters
        .map((f) => `${escapeHtml(f.label)}: ${escapeHtml(f.value)}`)
        .join(', ')
    : 'None';
  return `
        <div class="field"><dt>Search</dt><dd>${scope.query ? escapeHtml(scope.query) : 'None'}</dd></div>
        <div class="field"><dt>Filters</dt><dd>${filters}</dd></div>
        <div class="field"><dt>Sort</dt><dd>${scope.sortLabel ? escapeHtml(scope.sortLabel) : 'None'}</dd></div>`;
}

function renderHeader(header: SummaryHeader): string {
  return `
    <header class="summary">
      <h1>${escapeHtml(header.title)}</h1>
      <dl>
        <div class="field"><dt>Generated</dt><dd>${escapeHtml(formatDate(header.generatedAt))}</dd></div>
        <div class="field"><dt>${escapeHtml(header.countLabel)}</dt><dd>${escapeHtml(header.count)}</dd></div>
        ${header.scope ? renderScope(header.scope) : ''}
      </dl>
    </header>`;
}

function renderItem({ record: item, containerLabel }: ItemPrintTarget): string {
  const attributes = item.itemAttributes ?? [];
  const attributeBlock = attributes.length
    ? `<section><h3>Attributes</h3><dl>${attributes
        .map((attr) => field(attr.name, attr.value))
        .join('')}</dl></section>`
    : '';

  return `
    <article class="page" data-entity="item">
      <p class="type">${escapeHtml(formatCategoryLabel(item.itemType))}</p>
      <h2>${escapeHtml(item.itemLabel)}</h2>
      <div class="layout">
        <div class="image">${image(getExpandedImageUrl(item), item.itemLabel, 'No primary image')}</div>
        <dl class="details">
          ${field('Name', item.itemName)}
          ${field('Label', item.itemLabel)}
          ${field('Type', formatCategoryLabel(item.itemType))}
          ${field('Functional category', formatCategoryLabel(item.categoryFunctional))}
          ${field('Specific category', formatCategoryLabel(item.categorySpecific))}
          ${field('Manufacturer', item.itemManufacturer)}
          ${field('Container', containerLabel ?? item.expand?.ContainerRef?.containerLabel)}
          ${field('Item ID', item.id)}
          ${optionalValueFields(item)
            .map((f) => field(f.label, f.value))
            .join('')}
          ${field('Created', formatDate(item.created))}
          ${field('Updated', formatDate(item.updated))}
        </dl>
      </div>
      ${notesSection(item.itemNotes)}
      ${attributeBlock}
    </article>`;
}

function renderContents(items: Item[] | undefined): string {
  if (!items) return '';
  if (items.length === 0) {
    return '<section><h3>Contents</h3><p class="empty">No items in this container</p></section>';
  }
  const rows = items
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.itemLabel)}</td><td>${escapeHtml(
          formatCategoryLabel(item.itemType)
        )}</td><td>${
          isPresent(item.itemManufacturer)
            ? escapeHtml(item.itemManufacturer)
            : '<span class="empty">—</span>'
        }</td></tr>`
    )
    .join('');
  return `
      <section>
        <h3>Contents (${items.length})</h3>
        <table class="contents">
          <thead><tr><th>Item</th><th>Type</th><th>Manufacturer</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`;
}

function renderContainer({ record: container, items }: ContainerPrintTarget) {
  return `
    <article class="page" data-entity="container">
      <p class="type">Container</p>
      <h2>${escapeHtml(container.containerLabel)}</h2>
      <div class="layout">
        <div class="image">${image(getExpandedImageUrl(container), container.containerLabel, 'No image')}</div>
        <dl class="details">
          ${field('Label', container.containerLabel)}
          ${field('Items', items ? items.length : undefined)}
          ${field('Container ID', container.id)}
          ${field('Created', formatDate(container.created))}
          ${field('Updated', formatDate(container.updated))}
        </dl>
      </div>
      ${notesSection(container.containerNotes)}
      ${renderContents(items)}
    </article>`;
}

function renderNameList(
  label: string,
  names: string[] | undefined,
  none: string
): string {
  if (!names) return '';
  const body = names.length
    ? `<ul class="plain">${names
        .map((name) => `<li>${escapeHtml(name)}</li>`)
        .join('')}</ul>`
    : `<span class="empty">${escapeHtml(none)}</span>`;
  return `<div class="field"><dt>${escapeHtml(label)}</dt><dd>${body}</dd></div>`;
}

function renderImage({ record, items, containers }: ImagePrintTarget): string {
  const analysis =
    items || containers
      ? `<section><h3>Analysis results</h3><dl>
          ${renderNameList(
            'Items',
            items?.map((item) => item.itemLabel),
            'None'
          )}
          ${renderNameList(
            'Containers',
            containers?.map((container) => container.containerLabel),
            'None'
          )}
        </dl></section>`
      : '';
  return `
    <article class="page" data-entity="image">
      <p class="type">Image</p>
      <h2>${escapeHtml(record.file)}</h2>
      <div class="image image-wide">${image(getImageFileUrl(record), record.file, 'No file')}</div>
      <dl class="details">
        ${field('File', record.file)}
        ${field('Type', capitalise(record.imageType ?? 'unprocessed'))}
        ${field('Analysis status', capitalise(record.analysisStatus ?? 'pending'))}
        ${field('Image ID', record.id)}
        ${field('Created', formatDate(record.created))}
        ${field('Updated', formatDate(record.updated))}
      </dl>
      ${analysis}
    </article>`;
}

function renderTarget(target: PrintTarget): string {
  switch (target.entity) {
    case 'item':
      return renderItem(target);
    case 'container':
      return renderContainer(target);
    case 'image':
      return renderImage(target);
  }
}

const STYLES = `
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.4;
    color: #111;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  h1 { font-size: 18pt; margin: 0 0 8pt; }
  h2 { font-size: 16pt; margin: 0 0 10pt; overflow-wrap: anywhere; }
  h3 { font-size: 11pt; margin: 12pt 0 4pt; text-transform: uppercase; color: #555; }
  dl { margin: 0; }
  .summary { padding-bottom: 12pt; margin-bottom: 16pt; border-bottom: 1px solid #ccc; }
  .field { display: flex; gap: 8pt; padding: 2pt 0; break-inside: avoid; }
  .field dt { width: 38%; flex-shrink: 0; color: #555; }
  .field dd { margin: 0; overflow-wrap: anywhere; }
  .empty { color: #999; }
  .page { break-after: page; }
  .page:last-child { break-after: auto; }
  .type { margin: 0 0 2pt; font-size: 9pt; text-transform: uppercase; color: #666; }
  .layout { display: flex; gap: 14pt; align-items: flex-start; }
  .image { width: 42%; flex-shrink: 0; }
  .image img { width: 100%; max-height: 90mm; object-fit: contain; border: 1px solid #ddd; }
  .image-wide { width: 100%; margin-bottom: 10pt; }
  .image-wide img { max-height: 150mm; }
  .no-image {
    display: flex; align-items: center; justify-content: center;
    height: 60mm; border: 1px dashed #bbb; color: #888; background: #f6f6f6;
  }
  .details { flex: 1; }
  .notes { white-space: pre-wrap; margin: 0; }
  .contents { width: 100%; border-collapse: collapse; font-size: 10pt; }
  .contents th, .contents td { text-align: left; padding: 3pt 6pt; border-bottom: 1px solid #ddd; vertical-align: top; }
  .contents th { color: #555; font-weight: 600; }
  .contents tr { break-inside: avoid; }
  .plain { margin: 0; padding-left: 14pt; }
`;

/**
 * Print once every image has loaded or failed, so the PDF never captures a
 * half-drawn page. The timeout is a backstop for a request that never settles.
 */
const PRINT_SCRIPT = `
  (function () {
    var printed = false;
    function go() { if (printed) return; printed = true; window.focus(); window.print(); }
    var images = Array.prototype.slice.call(document.images);
    var pending = images.filter(function (img) { return !img.complete; }).length;
    if (pending === 0) { go(); return; }
    images.forEach(function (img) {
      if (img.complete) return;
      function done() { pending -= 1; if (pending <= 0) go(); }
      img.addEventListener('load', done);
      img.addEventListener('error', done);
    });
    setTimeout(go, 10000);
  })();
`;

/** The full printable document: one page per target, headed by `header`. */
export function buildSummaryHtml(
  targets: PrintTarget[],
  header: SummaryHeader
): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(header.title)}</title>
  <style>${STYLES}</style>
</head>
<body>
  ${renderHeader(header)}
  ${targets.map(renderTarget).join('')}
  <script>${PRINT_SCRIPT}</script>
</body>
</html>`;
}

/**
 * One target's page with no summary header and no print script — the print
 * dialog's preview. Rendered into a sandboxed iframe, so it can never print.
 */
export function buildPreviewHtml(target: PrintTarget): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(recordTitle(target.entity, target.record))}</title>
  <style>${STYLES} body { padding: 16mm; }</style>
</head>
<body>
  ${renderTarget(target)}
</body>
</html>`;
}

/**
 * Open the export window. Call this synchronously inside the click handler,
 * before any `await`, or the browser will treat it as an unsolicited pop-up.
 */
export function openExportWindow(
  blockedMessage = POPUP_BLOCKED_MESSAGE
): Window {
  const win = window.open('', '_blank');
  if (!win) {
    throw new Error(blockedMessage);
  }
  win.document.open();
  win.document.write(
    '<!doctype html><title>Preparing export…</title><p style="font-family:sans-serif">Preparing export…</p>'
  );
  win.document.close();
  return win;
}

export function writeExportWindow(win: Window, html: string): void {
  win.document.open();
  win.document.write(html);
  win.document.close();
}

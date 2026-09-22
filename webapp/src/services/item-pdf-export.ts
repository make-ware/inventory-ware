/**
 * Printable item export.
 *
 * "PDF" here means the browser's own print-to-PDF: the export is an HTML
 * document written into a new window that prints itself once its images have
 * settled. Nothing is fetched in this module — callers (see
 * `@/hooks/use-item-pdf-export`) hand it records that already went through
 * `ItemMutator`, so the HTML is a pure function of its input.
 *
 * The window is opened separately from the render because browsers only
 * honour `window.open` inside the click that asked for it: open first,
 * fetch, then write into the window you already hold.
 *
 * Deliberately not re-exported from the `@/services` barrel — it touches
 * `window` and the client PocketBase singleton.
 */
import { formatCategoryLabel } from '@project/shared';
import type { Item } from '@project/shared';
import { getExpandedImageUrl } from '@/lib/image-utils';

/** An item plus anything the caller resolved for it outside the record. */
export type ExportItem = Item & {
  /** Overrides `expand.ContainerRef.containerLabel` when the caller has it. */
  exportContainerLabel?: string;
};

export interface ExportSummary {
  title: string;
  generatedAt: Date;
  count: number;
  query?: string;
  filters?: { label: string; value: string }[];
  sortLabel?: string;
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

/**
 * Estimated-value fields, read only if the record carries them.
 *
 * Nothing in the schema defines these yet; the names are the expected ones,
 * and reading them through a `Partial<Record>` view means their absence is
 * simply "no row", never a type error or a crash.
 */
export function optionalValueFields(
  item: Item
): { label: string; value: string }[] {
  const view = item as unknown as Partial<
    Record<'estimatedValue' | 'estimatedValueCurrency', unknown>
  >;
  if (!isPresent(view.estimatedValue)) return [];
  const currency = isPresent(view.estimatedValueCurrency)
    ? ` ${String(view.estimatedValueCurrency)}`
    : '';
  return [
    {
      label: 'Estimated value',
      value: `${String(view.estimatedValue)}${currency}`,
    },
  ];
}

function field(label: string, value: unknown): string {
  const text = isPresent(value)
    ? escapeHtml(value)
    : '<span class="empty">—</span>';
  return `<div class="field"><dt>${escapeHtml(label)}</dt><dd>${text}</dd></div>`;
}

function renderSummary(summary: ExportSummary): string {
  const filters = summary.filters?.length
    ? summary.filters
        .map((f) => `${escapeHtml(f.label)}: ${escapeHtml(f.value)}`)
        .join(', ')
    : 'None';
  return `
    <header class="summary">
      <h1>${escapeHtml(summary.title)}</h1>
      <dl>
        <div class="field"><dt>Generated</dt><dd>${escapeHtml(formatDate(summary.generatedAt))}</dd></div>
        <div class="field"><dt>Items</dt><dd>${escapeHtml(summary.count)}</dd></div>
        <div class="field"><dt>Search</dt><dd>${summary.query ? escapeHtml(summary.query) : 'None'}</dd></div>
        <div class="field"><dt>Filters</dt><dd>${filters}</dd></div>
        <div class="field"><dt>Sort</dt><dd>${summary.sortLabel ? escapeHtml(summary.sortLabel) : 'None'}</dd></div>
      </dl>
    </header>`;
}

function renderItem(item: ExportItem): string {
  const imageUrl = getExpandedImageUrl(item);
  const containerLabel =
    item.exportContainerLabel ?? item.expand?.ContainerRef?.containerLabel;
  const attributes = item.itemAttributes ?? [];

  const image = imageUrl
    ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.itemLabel)}" />`
    : '<div class="no-image">No primary image</div>';

  const attributeBlock = attributes.length
    ? `<section><h3>Attributes</h3><dl>${attributes
        .map((attr) => field(attr.name, attr.value))
        .join('')}</dl></section>`
    : '';

  const notes = isPresent(item.itemNotes)
    ? `<section><h3>Notes</h3><p class="notes">${escapeHtml(item.itemNotes)}</p></section>`
    : '';

  return `
    <article class="item-page">
      <p class="type">${escapeHtml(formatCategoryLabel(item.itemType))}</p>
      <h2>${escapeHtml(item.itemLabel)}</h2>
      <div class="layout">
        <div class="image">${image}</div>
        <dl class="details">
          ${field('Name', item.itemName)}
          ${field('Label', item.itemLabel)}
          ${field('Type', formatCategoryLabel(item.itemType))}
          ${field('Functional category', formatCategoryLabel(item.categoryFunctional))}
          ${field('Specific category', formatCategoryLabel(item.categorySpecific))}
          ${field('Manufacturer', item.itemManufacturer)}
          ${field('Container', containerLabel)}
          ${optionalValueFields(item)
            .map((f) => field(f.label, f.value))
            .join('')}
          ${field('Created', formatDate(item.created))}
          ${field('Updated', formatDate(item.updated))}
        </dl>
      </div>
      ${notes}
      ${attributeBlock}
    </article>`;
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
  h2 { font-size: 16pt; margin: 0 0 10pt; }
  h3 { font-size: 11pt; margin: 12pt 0 4pt; text-transform: uppercase; color: #555; }
  dl { margin: 0; }
  .summary { padding-bottom: 12pt; margin-bottom: 16pt; border-bottom: 1px solid #ccc; }
  .field { display: flex; gap: 8pt; padding: 2pt 0; break-inside: avoid; }
  .field dt { width: 38%; flex-shrink: 0; color: #555; }
  .field dd { margin: 0; overflow-wrap: anywhere; }
  .empty { color: #999; }
  .item-page { break-after: page; }
  .item-page:last-child { break-after: auto; }
  .type { margin: 0 0 2pt; font-size: 9pt; text-transform: uppercase; color: #666; }
  .layout { display: flex; gap: 14pt; align-items: flex-start; }
  .image { width: 42%; flex-shrink: 0; }
  .image img { width: 100%; max-height: 90mm; object-fit: contain; border: 1px solid #ddd; }
  .no-image {
    display: flex; align-items: center; justify-content: center;
    height: 60mm; border: 1px dashed #bbb; color: #888; background: #f6f6f6;
  }
  .details { flex: 1; }
  .notes { white-space: pre-wrap; margin: 0; }
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

/** The full printable document for `items`, headed by `summary`. */
export function buildItemsExportHtml(
  items: ExportItem[],
  summary: ExportSummary
): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(summary.title)}</title>
  <style>${STYLES}</style>
</head>
<body>
  ${renderSummary(summary)}
  ${items.map(renderItem).join('')}
  <script>${PRINT_SCRIPT}</script>
</body>
</html>`;
}

/**
 * One item's page with no summary header and no print script — the print
 * dialog's preview. Rendered into a sandboxed iframe, so it can never print.
 */
export function buildItemPreviewHtml(item: ExportItem): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(item.itemLabel)}</title>
  <style>${STYLES} body { padding: 16mm; }</style>
</head>
<body>
  ${renderItem(item)}
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

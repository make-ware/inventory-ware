import type { Item } from '@project/shared';
import { getExpandedImageUrl } from '@/lib/image-utils';

type ExportItem = Item & {
  exportContainerLabel?: string;
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

function field(label: string, value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  return `<div class="field"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function itemPage(item: ExportItem, generatedAt: string): string {
  const imageUrl = getExpandedImageUrl(item);
  const attributes = (item.itemAttributes ?? [])
    .map(
      (attribute) =>
        `<li><strong>${escapeHtml(attribute.name)}:</strong> ${escapeHtml(attribute.value)}</li>`
    )
    .join('');
  const image = imageUrl
    ? `<img class="primary-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.itemLabel)}" />`
    : '<div class="image-placeholder">No primary image</div>';

  return `<article class="item-page">
    <header>
      <div>
        <p class="eyebrow">Inventory record</p>
        <h1>${escapeHtml(item.itemLabel || item.itemName || 'Unnamed item')}</h1>
        <p class="record-id">Record ID: ${escapeHtml(item.id)}</p>
      </div>
      <p class="generated">Generated<br />${escapeHtml(generatedAt)}</p>
    </header>
    <div class="layout">
      <section class="image-panel">${image}</section>
      <section>
        <dl>
          ${field('Type', item.itemType)}
          ${field('Product name', item.itemName)}
          ${field('Label', item.itemLabel)}
          ${field('Functional category', item.categoryFunctional)}
          ${field('Specific category', item.categorySpecific)}
          ${field('Manufacturer', item.itemManufacturer)}
          ${field('Container / location', item.exportContainerLabel)}
          ${field('Created', formatDate(item.created))}
          ${field('Last updated', formatDate(item.updated))}
        </dl>
      </section>
    </div>
    ${item.itemNotes ? `<section class="section"><h2>Notes</h2><p>${escapeHtml(item.itemNotes)}</p></section>` : ''}
    ${attributes ? `<section class="section"><h2>Attributes</h2><ul>${attributes}</ul></section>` : ''}
  </article>`;
}

export function printItemsAsPdf(items: ExportItem[]): void {
  if (typeof window === 'undefined' || items.length === 0) return;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    throw new Error('Pop-up blocked. Please allow pop-ups to export a PDF.');
  }

  const generatedAt = new Date().toLocaleString();
  const pages = items.map((item) => itemPage(item, generatedAt)).join('');
  printWindow.document.write(`<!doctype html><html><head><title>Inventory Export</title>
    <style>
      @page { size: A4; margin: 16mm; }
      * { box-sizing: border-box; }
      body { color: #17202a; font: 11pt Georgia, serif; margin: 0; }
      .item-page { break-after: page; min-height: 265mm; }
      .item-page:last-child { break-after: auto; }
      header { align-items: flex-start; border-bottom: 2px solid #17202a; display: flex; justify-content: space-between; padding-bottom: 8mm; }
      h1 { font: bold 25pt Arial, sans-serif; margin: 0 0 3mm; }
      h2 { border-bottom: 1px solid #aab4be; font: bold 13pt Arial, sans-serif; margin: 0 0 4mm; padding-bottom: 2mm; }
      .eyebrow { color: #52606d; font: bold 9pt Arial, sans-serif; letter-spacing: 1px; margin: 0 0 3mm; text-transform: uppercase; }
      .record-id, .generated { color: #52606d; font: 9pt Arial, sans-serif; margin: 0; }
      .generated { text-align: right; }
      .layout { display: grid; gap: 10mm; grid-template-columns: 1fr 1fr; margin-top: 10mm; }
      .image-panel { align-items: center; border: 1px solid #d9e0e6; display: flex; justify-content: center; min-height: 75mm; padding: 5mm; }
      .primary-image { max-height: 90mm; max-width: 100%; object-fit: contain; }
      .image-placeholder { color: #718096; font: 10pt Arial, sans-serif; }
      dl { margin: 0; }
      .field { border-bottom: 1px solid #e5e7eb; display: grid; gap: 4mm; grid-template-columns: 38% 62%; padding: 2.5mm 0; }
      dt { color: #52606d; font: bold 9pt Arial, sans-serif; }
      dd { margin: 0; overflow-wrap: anywhere; }
      .section { margin-top: 9mm; }
      .section p, .section ul { line-height: 1.5; margin: 0; white-space: pre-wrap; }
      .section ul { padding-left: 6mm; }
      @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
    </style></head><body>${pages}<script>
      const images = Array.from(document.images);
      Promise.all(images.map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => { image.onload = resolve; image.onerror = resolve; }))).then(() => { window.print(); });
    </script></body></html>`);
  printWindow.document.close();
}

/**
 * Printable QR labels.
 *
 * The label SVG is rendered server-side by `POST /api-next/labels/generate`
 * (one target per request); this module fetches it and builds the print
 * document around one or more of them. Printing works the same way as the
 * summary export in `@/services/print-summary`: a window opened inside the
 * click, written once every SVG is in hand, that prints itself on load.
 *
 * Deliberately not re-exported from the `@/services` barrel — it touches
 * `window` via its callers and needs the client's auth token.
 */
import type { LabelTargetType } from '@project/shared';
import { escapeHtml } from '@/services/print-summary';

export type LabelFormat = 'shipping-4x6' | 'address-30x100' | 'qr-only';

export type { LabelTargetType };

export const DEFAULT_LABEL_FORMAT: LabelFormat = 'shipping-4x6';

export const LABEL_FORMATS: { value: LabelFormat; label: string }[] = [
  { value: 'shipping-4x6', label: 'Shipping 4×6 in' },
  { value: 'address-30x100', label: 'Address 30×100 mm' },
  { value: 'qr-only', label: 'QR only' },
];

export const PRINT_POPUP_BLOCKED_MESSAGE =
  'Pop-up blocked. Please allow pop-ups to print.';

export interface FetchLabelSvgOptions {
  targetId: string;
  targetType: LabelTargetType;
  format: LabelFormat;
  token: string;
  signal?: AbortSignal;
}

/** One label's SVG markup; throws with the server's reason on failure. */
export async function fetchLabelSvg({
  targetId,
  targetType,
  format,
  token,
  signal,
}: FetchLabelSvgOptions): Promise<string> {
  const res = await fetch('/api-next/labels/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ targetId, targetType, format }),
    signal,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.reason ?? body?.error;
    throw new Error(
      detail
        ? `Failed to generate label (${res.status}): ${detail}`
        : `Failed to generate label (${res.status})`
    );
  }
  const data = await res.json();
  return data.svg;
}

/** The `@page` rule for a label format; `qr-only` leaves the size to the printer. */
export function labelPageStyle(format: string): string {
  if (format === 'shipping-4x6') {
    return '@page { size: 4in 6in; margin: 0; }';
  }
  if (format === 'address-30x100') {
    return '@page { size: 100mm 30mm; margin: 0; }';
  }
  return '';
}

/**
 * One print document holding every label, one per page.
 *
 * A single document rather than one window per label: only the first
 * `window.open` counts as part of the click, so the rest would be blocked.
 */
export function buildLabelsPrintHtml(
  svgs: string[],
  format: string,
  title = svgs.length === 1 ? 'Print Label' : `Print Labels (${svgs.length})`
): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      ${labelPageStyle(format)}
      body { margin: 0; }
      .label { display: flex; justify-content: center; align-items: center; height: 100vh; break-after: page; }
      .label:last-child { break-after: auto; }
      svg { max-width: 100%; height: auto; }
      @media print {
        .label { display: block; height: auto; }
        svg { max-width: none; width: 100%; height: 100%; }
      }
    </style>
  </head>
  <body>
    ${svgs.map((svg) => `<div class="label">${svg}</div>`).join('')}
    <script>
      window.onload = () => {
        window.print();
      };
    </script>
  </body>
</html>`;
}

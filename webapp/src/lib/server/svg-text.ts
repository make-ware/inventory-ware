/**
 * Overflow-proof text layout for server-generated SVG labels.
 *
 * Labels are fixed-geometry documents: no input string may change the size or
 * position of anything on the page. This module provides the three pieces that
 * guarantee it:
 *
 * 1. `estimateTextWidth` — approximate Arial/Helvetica advance widths, biased
 *    to overestimate so text wraps or truncates slightly early rather than
 *    ever escaping its box.
 * 2. `fitTextLines` — grapheme-safe word wrapping into a fixed number of line
 *    slots, with an ellipsis when content is cut.
 * 3. `renderTextElement` — emits `<text>`/`<tspan>` markup at absolute
 *    positions; any line the estimator could not prove fits gets an SVG
 *    `textLength` clamp, so the renderer itself makes overflow impossible.
 */

export function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      case '"':
        return '&quot;';
      default:
        return c;
    }
  });
}

// Per-character advance widths in 1/1000 em for ASCII 32..126, from the
// public-domain Adobe Core 14 Helvetica AFM metrics (metrically compatible
// with Arial, which the labels render in).
// prettier-ignore
const REGULAR_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, // space..'/'
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, // '0'..'?'
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, // '@'..'O'
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, // 'P'..'_'
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, // '`'..'o'
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,      // 'p'..'~'
];

// Helvetica-Bold AFM metrics, same layout.
// prettier-ignore
const BOLD_WIDTHS = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

const ELLIPSIS_WIDTH = 1000; // '…' in both Helvetica weights
const DEFAULT_CHAR_WIDTH = 600;
const WIDE_CHAR_WIDTH = 1000;

// Every estimate is inflated by this factor: overestimating is the safe
// direction (text wraps or truncates slightly early instead of overflowing).
const SAFETY = 1.03;

/** CJK, fullwidth and other ranges rendered at roughly a full em. */
function isWideCodePoint(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x11ff) || // Hangul Jamo
    (cp >= 0x2e80 && cp <= 0xa4cf) || // CJK radicals .. Yi
    (cp >= 0xac00 && cp <= 0xd7a3) || // Hangul syllables
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK compatibility ideographs
    (cp >= 0xff00 && cp <= 0xff60) || // fullwidth forms
    cp >= 0x10000 // astral: emoji, supplementary CJK
  );
}

/** Width of a single code point in 1/1000 em. */
function codePointWidth(cp: number, bold: boolean): number {
  if (cp >= 32 && cp <= 126) {
    return (bold ? BOLD_WIDTHS : REGULAR_WIDTHS)[cp - 32];
  }
  if (cp === 0x2026) return ELLIPSIS_WIDTH;
  if (isWideCodePoint(cp)) return WIDE_CHAR_WIDTH;
  return DEFAULT_CHAR_WIDTH;
}

/**
 * Estimate the rendered width of `text` in the same units as `fontSize`
 * (SVG user units when fontSize is in user units).
 */
export function estimateTextWidth(
  text: string,
  fontSize: number,
  bold = false
): number {
  let units = 0;
  for (const ch of text) {
    units += codePointWidth(ch.codePointAt(0) as number, bold);
  }
  return (units / 1000) * fontSize * SAFETY;
}

export interface FitTextOptions {
  /** Maximum line width in SVG user units. */
  maxWidth: number;
  fontSize: number;
  bold?: boolean;
  /** Maximum number of lines to emit (default 1). */
  maxLines?: number;
  /** Appended to the final line when content is cut (default '…'). */
  ellipsis?: string;
}

export interface FittedLine {
  /** Raw text — NOT XML-escaped; `renderTextElement` escapes. */
  text: string;
  estWidth: number;
  /**
   * Present only when the estimate exceeds maxWidth (a single grapheme wider
   * than the box, or estimation slack at an ellipsized edge). The renderer
   * turns this into an SVG textLength clamp.
   */
  textLength?: number;
}

/** Split into grapheme clusters so truncation never cuts a surrogate pair or combining sequence. */
function graphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter(undefined, {
      granularity: 'grapheme',
    });
    return Array.from(segmenter.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

function clampLine(
  text: string,
  fontSize: number,
  bold: boolean,
  maxWidth: number
): FittedLine {
  const estWidth = estimateTextWidth(text, fontSize, bold);
  return estWidth > maxWidth
    ? { text, estWidth, textLength: maxWidth }
    : { text, estWidth };
}

/** Longest grapheme prefix of `word` that fits in `maxWidth`; at least one grapheme. */
function fittingPrefix(
  word: string[],
  fontSize: number,
  bold: boolean,
  maxWidth: number,
  suffix = ''
): number {
  let taken = 0;
  let current = '';
  for (const g of word) {
    if (
      estimateTextWidth(current + g + suffix, fontSize, bold) > maxWidth &&
      taken > 0
    ) {
      break;
    }
    current += g;
    taken++;
    // A single grapheme may exceed the box on its own; it is taken anyway and
    // clamped by textLength later.
    if (estimateTextWidth(current + suffix, fontSize, bold) > maxWidth) break;
  }
  return taken;
}

/**
 * Lay `text` out into at most `maxLines` lines of at most `maxWidth` units.
 *
 * Always returns at least one line (empty input yields one empty line) so
 * callers can address fixed line slots unconditionally.
 */
export function fitTextLines(
  text: string,
  options: FitTextOptions
): FittedLine[] {
  const { maxWidth, fontSize, bold = false, maxLines = 1 } = options;
  const ellipsis = options.ellipsis ?? '…';

  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [{ text: '', estWidth: 0 }];
  }

  const lines: FittedLine[] = [];
  let remaining: string[] = words;

  while (remaining.length > 0 && lines.length < maxLines) {
    const isLastSlot = lines.length === maxLines - 1;
    let line = '';
    let consumed = 0;

    for (const word of remaining) {
      const candidate = line ? `${line} ${word}` : word;
      if (estimateTextWidth(candidate, fontSize, bold) <= maxWidth) {
        line = candidate;
        consumed++;
      } else {
        break;
      }
    }

    if (consumed === 0) {
      // The next word alone is too wide: break it at a grapheme boundary.
      const word = graphemes(remaining[0]);
      const suffix = isLastSlot ? ellipsis : '';
      const taken = fittingPrefix(word, fontSize, bold, maxWidth, suffix);
      const head = word.slice(0, taken).join('');
      const tail = word.slice(taken).join('');
      if (isLastSlot) {
        lines.push(clampLine(head + ellipsis, fontSize, bold, maxWidth));
        return lines;
      }
      lines.push(clampLine(head, fontSize, bold, maxWidth));
      remaining = tail ? [tail, ...remaining.slice(1)] : remaining.slice(1);
      continue;
    }

    if (isLastSlot && consumed < remaining.length) {
      // Content left over with no slots remaining: ellipsize this line.
      const clusters = graphemes(line);
      const taken = fittingPrefix(clusters, fontSize, bold, maxWidth, ellipsis);
      const head = clusters.slice(0, taken).join('').replace(/\s+$/, '');
      lines.push(clampLine(head + ellipsis, fontSize, bold, maxWidth));
      return lines;
    }

    lines.push(clampLine(line, fontSize, bold, maxWidth));
    remaining = remaining.slice(consumed);
  }

  return lines;
}

export interface TextElementOptions {
  x: number;
  /**
   * Fixed baseline y per line slot. `lines.length` must not exceed
   * `yPositions.length`; unused slots simply stay empty, so layout never
   * shifts with line count.
   */
  yPositions: number[];
  fontSize: number;
  bold?: boolean;
  anchor?: 'start' | 'middle' | 'end';
  fill?: string;
}

/**
 * Render fitted lines as one `<text>` element with absolutely positioned
 * `<tspan>`s. Lines carrying `textLength` get the SVG hard clamp
 * (`lengthAdjust="spacingAndGlyphs"`), which compresses the glyph run to the
 * given length — overflow is physically impossible even if the width estimate
 * was wrong.
 */
export function renderTextElement(
  lines: FittedLine[],
  options: TextElementOptions
): string {
  const { x, yPositions, fontSize, bold = false, anchor = 'start' } = options;
  if (lines.length > yPositions.length) {
    throw new Error(
      `renderTextElement: ${lines.length} lines but only ${yPositions.length} y positions`
    );
  }

  const attrs = [
    `font-family="Arial, sans-serif"`,
    `font-size="${fontSize}"`,
    anchor !== 'start' ? `text-anchor="${anchor}"` : '',
    bold ? `font-weight="bold"` : '',
    options.fill ? `fill="${options.fill}"` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const tspans = lines
    .map((line, i) => {
      const clamp =
        line.textLength !== undefined
          ? ` textLength="${line.textLength}" lengthAdjust="spacingAndGlyphs"`
          : '';
      return `<tspan x="${x}" y="${yPositions[i]}"${clamp}>${escapeXml(line.text)}</tspan>`;
    })
    .join('');

  return `<text ${attrs}>${tspans}</text>`;
}

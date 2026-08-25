import { describe, it, expect } from 'vitest';
import {
  estimateTextWidth,
  fitTextLines,
  renderTextElement,
} from '../svg-text';

const LONE_HIGH_SURROGATE_AT_END = /[\uD800-\uDBFF]$/;
const LONE_LOW_SURROGATE_AT_START = /^[\uDC00-\uDFFF]/;

describe('estimateTextWidth', () => {
  it('is zero for an empty string', () => {
    expect(estimateTextWidth('', 20)).toBe(0);
  });

  it('orders narrow glyphs below wide ones', () => {
    expect(estimateTextWidth('iii', 20)).toBeLessThan(
      estimateTextWidth('WWW', 20)
    );
  });

  it('scales linearly with font size', () => {
    const at10 = estimateTextWidth('Hello world', 10);
    const at20 = estimateTextWidth('Hello world', 20);
    expect(at20).toBeCloseTo(at10 * 2, 6);
  });

  it('is wider in bold for the same text', () => {
    expect(estimateTextWidth('label', 20, true)).toBeGreaterThan(
      estimateTextWidth('label', 20, false)
    );
  });

  it('treats CJK and emoji as full-em glyphs', () => {
    expect(estimateTextWidth('漢', 20)).toBeGreaterThanOrEqual(20);
    expect(estimateTextWidth('📦', 20)).toBeGreaterThanOrEqual(20);
  });
});

describe('fitTextLines', () => {
  it('returns one line without textLength when the text fits', () => {
    const lines = fitTextLines('Short', {
      maxWidth: 360,
      fontSize: 20,
      bold: true,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('Short');
    expect(lines[0].textLength).toBeUndefined();
  });

  it('wraps at spaces within the line budget', () => {
    const lines = fitTextLines(
      'Small Cylindrical Connector Piece Yellow Duplo-Style',
      { maxWidth: 360, fontSize: 20, bold: true, maxLines: 2 }
    );
    expect(lines.length).toBeLessThanOrEqual(2);
    for (const line of lines) {
      expect(
        line.estWidth <= 360 || line.textLength === 360,
        `line "${line.text}" must fit or be clamped`
      ).toBe(true);
    }
    // Wrapping happens at word boundaries: no line starts or ends mid-word
    // with a space adjoining.
    for (const line of lines) {
      expect(line.text).toBe(line.text.trim());
    }
  });

  it('ellipsizes the final line when content exceeds maxLines', () => {
    const lines = fitTextLines(
      'An exceptionally verbose product name that cannot possibly fit on two lines of a shipping label no matter what',
      { maxWidth: 360, fontSize: 20, bold: true, maxLines: 2 }
    );
    expect(lines).toHaveLength(2);
    expect(lines[1].text.endsWith('…')).toBe(true);
    for (const line of lines) {
      expect(line.estWidth <= 360 || line.textLength === 360).toBe(true);
    }
  });

  it('breaks a single unbroken word at grapheme boundaries', () => {
    const word = 'a'.repeat(200);
    const lines = fitTextLines(word, {
      maxWidth: 360,
      fontSize: 20,
      maxLines: 2,
    });
    expect(lines).toHaveLength(2);
    expect(lines[0].estWidth).toBeLessThanOrEqual(360);
    expect(lines[1].text.endsWith('…')).toBe(true);
  });

  it('never splits surrogate pairs', () => {
    const lines = fitTextLines('📦'.repeat(40), {
      maxWidth: 360,
      fontSize: 20,
      maxLines: 2,
    });
    for (const line of lines) {
      expect(line.text).not.toMatch(LONE_HIGH_SURROGATE_AT_END);
      expect(line.text).not.toMatch(LONE_LOW_SURROGATE_AT_START);
    }
  });

  it('keeps combining marks attached to their base character', () => {
    const accented = 'é'.repeat(80); // é as base + combining acute
    const lines = fitTextLines(accented, {
      maxWidth: 100,
      fontSize: 20,
      maxLines: 2,
    });
    for (const line of lines) {
      // A line must never start with a bare combining mark.
      expect(line.text).not.toMatch(/^[̀-ͯ]/);
    }
  });

  it('returns exactly one empty line for empty and whitespace-only input', () => {
    expect(fitTextLines('', { maxWidth: 100, fontSize: 12 })).toEqual([
      { text: '', estWidth: 0 },
    ]);
    expect(fitTextLines('   \t ', { maxWidth: 100, fontSize: 12 })).toEqual([
      { text: '', estWidth: 0 },
    ]);
  });

  it('clamps a single grapheme wider than the box with textLength', () => {
    const lines = fitTextLines('W', { maxWidth: 5, fontSize: 20 });
    expect(lines).toHaveLength(1);
    expect(lines[0].textLength).toBe(5);
  });
});

describe('renderTextElement', () => {
  it('escapes XML special characters after truncation', () => {
    const lines = fitTextLines('A & B <C> "D"', {
      maxWidth: 500,
      fontSize: 12,
    });
    const svg = renderTextElement(lines, {
      x: 10,
      yPositions: [20],
      fontSize: 12,
    });
    expect(svg).toContain('A &amp; B &lt;C&gt; &quot;D&quot;');
    expect(svg).not.toContain('<C>');
  });

  it('emits lengthAdjust exactly when a line carries textLength', () => {
    const clamped = renderTextElement(
      [{ text: 'W', estWidth: 20, textLength: 5 }],
      { x: 0, yPositions: [10], fontSize: 20 }
    );
    expect(clamped).toContain('textLength="5"');
    expect(clamped).toContain('lengthAdjust="spacingAndGlyphs"');

    const free = renderTextElement([{ text: 'W', estWidth: 20 }], {
      x: 0,
      yPositions: [10],
      fontSize: 20,
    });
    expect(free).not.toContain('textLength');
    expect(free).not.toContain('lengthAdjust');
  });

  it('places each line at its fixed slot with no dy chains', () => {
    const svg = renderTextElement(
      [
        { text: 'one', estWidth: 30 },
        { text: 'two', estWidth: 30 },
      ],
      { x: 200, yPositions: [355, 381], fontSize: 20, anchor: 'middle' }
    );
    expect(svg).toContain('x="200" y="355"');
    expect(svg).toContain('x="200" y="381"');
    expect(svg).not.toContain('dy=');
    expect(svg).toContain('text-anchor="middle"');
  });

  it('throws when there are more lines than slots', () => {
    expect(() =>
      renderTextElement(
        [
          { text: 'one', estWidth: 30 },
          { text: 'two', estWidth: 30 },
        ],
        { x: 0, yPositions: [10], fontSize: 12 }
      )
    ).toThrow();
  });
});

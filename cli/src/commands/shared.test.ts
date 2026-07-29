import { describe, expect, it } from 'vitest';
import { collectAttr, compact, parseIntOption } from './shared.js';

describe('collectAttr', () => {
  it('parses a name=value pair', () => {
    expect(collectAttr('color=red')).toEqual([{ name: 'color', value: 'red' }]);
  });

  it('accumulates repeated flags', () => {
    const first = collectAttr('color=red');
    expect(collectAttr('size=large', first)).toEqual([
      { name: 'color', value: 'red' },
      { name: 'size', value: 'large' },
    ]);
  });

  it('splits on the first = so values may contain =', () => {
    expect(collectAttr('equation=a=b')).toEqual([
      { name: 'equation', value: 'a=b' },
    ]);
  });

  it('trims surrounding whitespace', () => {
    expect(collectAttr(' color = red ')).toEqual([
      { name: 'color', value: 'red' },
    ]);
  });

  it('rejects input with no =', () => {
    expect(() => collectAttr('color')).toThrow(/Expected name=value/);
  });

  it('rejects an empty name', () => {
    expect(() => collectAttr('=red')).toThrow(/Expected name=value/);
  });
});

describe('parseIntOption', () => {
  it('parses a positive integer', () => {
    expect(parseIntOption('12', '--page')).toBe(12);
  });

  it.each(['0', '-1', 'abc', ''])('rejects %o', (value) => {
    expect(() => parseIntOption(value, '--page')).toThrow(/--page/);
  });
});

describe('compact', () => {
  it('drops undefined values but keeps falsy ones', () => {
    expect(compact({ a: 1, b: undefined, c: '', d: 0, e: false })).toEqual({
      a: 1,
      c: '',
      d: 0,
      e: false,
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { printRecord, printTable } from './output.js';

let lines: string[];

beforeEach(() => {
  lines = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    lines.push(args.join(' '));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('printTable', () => {
  const columns: Array<[string, string]> = [
    ['id', 'ID'],
    ['label', 'LABEL'],
  ];

  it('aligns columns to the widest value', () => {
    printTable(
      [
        { id: 'a', label: 'short' },
        { id: 'bbbbbb', label: 'x' },
      ],
      columns
    );

    expect(lines[0]).toBe('ID      LABEL');
    expect(lines[1]).toBe('a       short');
    expect(lines[2]).toBe('bbbbbb  x');
  });

  it('reports an empty result set instead of printing a bare header', () => {
    printTable([], columns);
    expect(lines).toEqual(['No results.']);
  });

  it('renders missing values as a dash', () => {
    printTable([{ id: 'a', label: undefined }], columns);
    expect(lines[1]).toBe('a   -');
  });

  it('truncates over-long cells', () => {
    printTable([{ id: 'a', label: 'x'.repeat(50) }], columns, 10);
    expect(lines[1]).toContain('…');
    expect(lines[1].length).toBeLessThan(30);
  });
});

describe('printRecord', () => {
  it('joins string arrays so category lists are readable', () => {
    printRecord({ functional: ['Tools', 'Electronics'] });
    expect(lines[0]).toContain('Tools, Electronics');
  });

  it('summarises arrays of objects by count', () => {
    printRecord({ itemAttributes: [{ name: 'a', value: 'b' }] });
    expect(lines[0]).toContain('1 item(s)');
  });

  it('restricts output to the requested keys', () => {
    printRecord({ id: '1', secret: 'hidden' }, ['id']);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('1');
  });
});

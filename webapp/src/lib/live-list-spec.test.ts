import { describe, it, expect } from 'vitest';
import {
  buildSortSpec,
  matchesAllFields,
  matchesAnyField,
} from './live-list-spec';

interface Row {
  id: string;
  created?: string;
  itemLabel?: string;
  itemNotes?: string;
  rank?: number;
  categoryFunctional?: string;
}

const row = (id: string, fields: Omit<Row, 'id'> = {}): Row => ({
  id,
  ...fields,
});

describe('buildSortSpec', () => {
  it('orders descending for a leading minus', () => {
    const { compare } = buildSortSpec<Row>('-created');
    const older = row('a', { created: '2026-08-01' });
    const newer = row('b', { created: '2026-08-02' });
    expect(compare(newer, older)).toBeLessThan(0);
    expect(compare(older, newer)).toBeGreaterThan(0);
  });

  it('treats a bare field and a leading plus alike, as ascending', () => {
    const bare = buildSortSpec<Row>('itemLabel').compare;
    const plus = buildSortSpec<Row>('+itemLabel').compare;
    const a = row('x', { itemLabel: 'anvil' });
    const b = row('y', { itemLabel: 'bolt' });
    expect(bare(a, b)).toBeLessThan(0);
    expect(plus(a, b)).toBeLessThan(0);
  });

  it('falls through to the next term, then to the id tiebreak', () => {
    const { compare } = buildSortSpec<Row>('+itemLabel,-created');
    const same = { itemLabel: 'drill', created: '2026-08-01' };
    // Distinct records never compare equal: applyListEvent reads 0 as
    // "the sort key did not move", which must not be true of two rows.
    expect(compare(row('a', same), row('b', same))).toBeLessThan(0);
    expect(
      compare(
        row('a', { itemLabel: 'drill', created: '2026-08-01' }),
        row('b', { itemLabel: 'drill', created: '2026-08-02' })
      )
    ).toBeGreaterThan(0);
  });

  it('compares a record with itself as equal, which is how "unchanged" is detected', () => {
    const { compare } = buildSortSpec<Row>('-created');
    const record = row('a', { created: '2026-08-01' });
    expect(compare(record, { ...record })).toBe(0);
  });

  it('compares numbers numerically rather than as strings', () => {
    const { compare } = buildSortSpec<Row>('+rank');
    expect(compare(row('a', { rank: 9 }), row('b', { rank: 10 }))).toBeLessThan(
      0
    );
  });

  it('orders text by byte order, the way SQLite does', () => {
    const { compare } = buildSortSpec<Row>('+itemLabel');
    // 'Z' (0x5A) sorts before 'a' (0x61) under BINARY collation.
    expect(
      compare(
        row('a', { itemLabel: 'Zebra' }),
        row('b', { itemLabel: 'anvil' })
      )
    ).toBeLessThan(0);
  });

  it('reports a record missing the sort field as uncomparable', () => {
    const { canCompare } = buildSortSpec<Row>('-created');
    expect(canCompare(row('a', { created: '2026-08-01' }))).toBe(true);
    expect(canCompare(row('a'))).toBe(false);
    // An empty string is a value, not an absence.
    expect(canCompare(row('a', { created: '' }))).toBe(true);
  });

  it('reports a sort the client cannot represent as uncomparable', () => {
    // Reading through an expand the SSE payload may not carry, and @random,
    // both mean "never reposition this record on an event".
    expect(buildSortSpec<Row>('ImageRef.file').canCompare(row('a'))).toBe(
      false
    );
    expect(buildSortSpec<Row>('@random').canCompare(row('a'))).toBe(false);
  });
});

describe('matchesAnyField', () => {
  const fields = ['itemLabel', 'itemNotes'] as const;

  it('matches a case-insensitive substring of any listed field', () => {
    expect(
      matchesAnyField(
        row('a', { itemLabel: 'Cordless Drill' }),
        fields,
        'drill'
      )
    ).toBe(true);
    expect(
      matchesAnyField(row('a', { itemNotes: 'in the SHED' }), fields, 'shed')
    ).toBe(true);
    expect(
      matchesAnyField(row('a', { itemLabel: 'Cordless Drill' }), fields, 'saw')
    ).toBe(false);
  });

  it('matches everything for a blank query, as an omitted filter clause does', () => {
    expect(matchesAnyField(row('a'), fields, '')).toBe(true);
    expect(matchesAnyField(row('a'), fields, '   ')).toBe(true);
  });

  it('ignores fields the record does not carry as strings', () => {
    expect(matchesAnyField(row('a', { rank: 12 }), ['rank'], '12')).toBe(false);
  });
});

describe('matchesAllFields', () => {
  it('requires equality for every set filter', () => {
    const record = row('a', { categoryFunctional: 'tools' });
    expect(matchesAllFields(record, { categoryFunctional: 'tools' })).toBe(
      true
    );
    expect(matchesAllFields(record, { categoryFunctional: 'lighting' })).toBe(
      false
    );
  });

  it('skips cleared filters rather than matching them against undefined', () => {
    const record = row('a', { categoryFunctional: 'tools' });
    expect(
      matchesAllFields(record, {
        categoryFunctional: undefined,
        itemType: '',
      })
    ).toBe(true);
  });
});

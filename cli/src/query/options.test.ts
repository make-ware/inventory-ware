import { describe, expect, it } from 'vitest';
import { Command } from 'commander';
import { addQueryOptions, parseQueryOptions, positiveInt } from './options.js';
import { CONTAINER_SPEC, IMAGE_SPEC, ITEM_SPEC } from './spec.js';

describe('positiveInt', () => {
  it('parses a whole number', () => {
    expect(positiveInt()('12')).toBe(12);
  });

  it.each(['abc', '', '1.5', '-3', '0'])('rejects %o', (value) => {
    // InvalidArgumentError so Commander reports it like any bad option value
    // instead of rethrowing it raw past this.error().
    expect(() => positiveInt()(value)).toThrow(
      expect.objectContaining({ code: 'commander.invalidArgument' })
    );
  });

  it('enforces the cap', () => {
    expect(() => positiveInt(500)('501')).toThrow(/500 or less/);
    expect(positiveInt(500)('500')).toBe(500);
  });
});

describe('parseQueryOptions - sort', () => {
  it('accepts a comma list with direction prefixes', () => {
    const parsed = parseQueryOptions(ITEM_SPEC, { sort: '-created,itemLabel' });
    expect(parsed.sort).toBe('-created,itemLabel');
  });

  it('rejects an unknown field and suggests the closest one', () => {
    try {
      parseQueryOptions(ITEM_SPEC, { sort: '-crated' });
      expect.unreachable('should have thrown');
    } catch (error) {
      const cliError = error as { message: string; hints: string[] };
      expect(cliError.message).toMatch(/Unknown sort field "crated"/);
      expect(cliError.hints[0]).toMatch(/did you mean "created"/);
      expect(cliError.hints.join('\n')).toMatch(/valid sort fields/);
    }
  });
});

describe('parseQueryOptions - expand and fields', () => {
  it('rejects an unknown relation', () => {
    expect(() => parseQueryOptions(ITEM_SPEC, { expand: 'Nope' })).toThrow(
      /Unknown relation "Nope"/
    );
  });

  it('suggests the Ref suffix people forget', () => {
    try {
      parseQueryOptions(ITEM_SPEC, { expand: 'Container' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect((error as { hints: string[] }).hints[0]).toMatch(/ContainerRef/);
    }
  });

  it('falls back to the entity default columns', () => {
    const parsed = parseQueryOptions(CONTAINER_SPEC, {});
    expect(parsed.fields).toEqual([...CONTAINER_SPEC.defaultColumns]);
    expect(parsed.columns[1]).toEqual(['containerLabel', 'LABEL']);
  });

  it('builds columns from --fields with the spec headings', () => {
    const parsed = parseQueryOptions(ITEM_SPEC, { fields: 'id,itemLabel' });
    expect(parsed.columns).toEqual([
      ['id', 'ID'],
      ['itemLabel', 'LABEL'],
    ]);
  });

  it('rejects an unknown field', () => {
    expect(() => parseQueryOptions(ITEM_SPEC, { fields: 'bogus' })).toThrow(
      /Unknown field "bogus"/
    );
  });
});

describe('parseQueryOptions - filters', () => {
  it('maps flag names onto the mutator filter keys', () => {
    const parsed = parseQueryOptions(ITEM_SPEC, {
      container: 'c1',
      image: 'i1',
    });
    expect(parsed.filters).toEqual({ container: 'c1', image: 'i1' });
  });

  it('slugifies the category filters, which are stored slugified', () => {
    // slugify keeps case and single spaces but normalises punctuation and
    // runs of separators, so an un-slugified value would match nothing.
    const parsed = parseQueryOptions(ITEM_SPEC, {
      functional: 'Power/Tools',
      specific: '  Hand  Tools ',
      type: 'Cordless--Drill',
    });
    expect(parsed.filters.categoryFunctional).toBe('Power-Tools');
    expect(parsed.filters.categorySpecific).toBe('Hand Tools');
    expect(parsed.filters.itemType).toBe('Cordless-Drill');
  });

  it('maps image --status onto analysisStatus', () => {
    const parsed = parseQueryOptions(IMAGE_SPEC, { status: 'pending' });
    expect(parsed.filters).toEqual({ analysisStatus: 'pending' });
  });

  it('ignores filters that were not passed', () => {
    expect(parseQueryOptions(ITEM_SPEC, {}).filters).toEqual({});
  });
});

describe('parseQueryOptions - pagination', () => {
  it('defaults to page 1 and the standard page size', () => {
    const parsed = parseQueryOptions(ITEM_SPEC, {});
    expect(parsed.page).toBe(1);
    expect(parsed.perPage).toBe(100);
  });

  it('uses the larger batch size for --all unless --per-page was given', () => {
    expect(parseQueryOptions(ITEM_SPEC, { all: true }).perPage).toBe(200);
  });

  it('honours an explicit --per-page as the --all batch size', () => {
    const command = new Command('list');
    addQueryOptions(command, ITEM_SPEC);
    command.parse(['--all', '--per-page', '25'], { from: 'user' });

    const parsed = parseQueryOptions(ITEM_SPEC, command.opts(), command);
    expect(parsed.perPage).toBe(25);
    expect(parsed.all).toBe(true);
  });
});

describe('addQueryOptions', () => {
  it('gives every entity the same standard flags', () => {
    const standard = [
      'sort',
      'expand',
      'fields',
      'page',
      'perPage',
      'all',
      'count',
      'json',
    ];
    for (const spec of [ITEM_SPEC, CONTAINER_SPEC, IMAGE_SPEC]) {
      const command = addQueryOptions(new Command('list'), spec);
      const names = command.options.map((option) => option.attributeName());
      for (const flag of standard) expect(names).toContain(flag);
    }
  });

  it('omits -q for images, which have no free-text field', () => {
    const command = addQueryOptions(new Command('list'), IMAGE_SPEC);
    expect(command.options.map((o) => o.attributeName())).not.toContain(
      'search'
    );
  });

  it('omits a filter when the caller supplies it positionally', () => {
    const command = addQueryOptions(new Command('items'), ITEM_SPEC, {
      omitFilters: ['container'],
    });
    const names = command.options.map((option) => option.attributeName());
    expect(names).not.toContain('container');
    expect(names).toContain('image');
  });
});

describe('parseQueryOptions - unrepresentable values', () => {
  it('rejects search text ending in a backslash with an explanation', () => {
    // PocketBase 400s on every escaping of a trailing backslash, so catching
    // it here turns an opaque server error into actionable guidance.
    try {
      parseQueryOptions(ITEM_SPEC, { search: 'foo\\' });
      expect.unreachable('should have thrown');
    } catch (error) {
      const cliError = error as { message: string; hints: string[] };
      expect(cliError.message).toMatch(/cannot end with a backslash/);
      expect(cliError.hints.join('\n')).toMatch(/PocketBase cannot represent/);
    }
  });

  it('rejects a filter value ending in a backslash', () => {
    expect(() => parseQueryOptions(ITEM_SPEC, { container: 'c1\\' })).toThrow(
      /--container cannot end with a backslash/
    );
  });

  it('allows a backslash anywhere else', () => {
    expect(parseQueryOptions(ITEM_SPEC, { search: 'back\\slash' }).search).toBe(
      'back\\slash'
    );
  });
});

import { describe, expect, it } from 'vitest';
import {
  allOf,
  anyOf,
  eq,
  escapeFilterValue,
  isUnrepresentableFilterValue,
  like,
  neq,
} from './filter';

describe('escapeFilterValue', () => {
  it('escapes double quotes', () => {
    expect(escapeFilterValue('a"b')).toBe('a\\"b');
  });

  it('escapes backslashes before quotes, not after', () => {
    // Escaping quotes first would turn the inserted \" back into \\"
    expect(escapeFilterValue('a\\b')).toBe('a\\\\b');
    expect(escapeFilterValue('a\\"b')).toBe('a\\\\\\"b');
  });

  it('neutralises a trailing backslash', () => {
    // Unescaped, `foo\` + the closing quote reads as an escaped quote and
    // lets the value break out of the string literal.
    expect(eq('itemLabel', 'foo\\')).toBe('itemLabel="foo\\\\"');
  });

  it('neutralises an injected filter clause', () => {
    const attack = 'a" || itemLabel~"';
    expect(eq('itemLabel', attack)).toBe('itemLabel="a\\" || itemLabel~\\""');
  });

  it('leaves ordinary values untouched', () => {
    expect(escapeFilterValue('container9')).toBe('container9');
  });
});

describe('eq / like', () => {
  it('builds equality and contains clauses', () => {
    expect(eq('itemType', 'hammer')).toBe('itemType="hammer"');
    expect(like('itemLabel', 'drill')).toBe('itemLabel~"drill"');
  });
});

describe('neq', () => {
  it('builds an inequality clause', () => {
    expect(neq('ContainerRef', 'abc123')).toBe('ContainerRef!="abc123"');
  });

  it('represents "no container" as the empty string', () => {
    // PocketBase stores a cleared single relation as "", not null.
    expect(neq('ContainerRef', '')).toBe('ContainerRef!=""');
  });

  it('escapes a value that would break out of the filter string', () => {
    expect(neq('itemLabel', 'a" || id!="')).toBe(
      'itemLabel!="a\\" || id!=\\""'
    );
  });

  it('is parenthesised like any other atom when ANDed', () => {
    expect(
      allOf([anyOf(['itemLabel'], 'drill'), neq('ContainerRef', '')])
    ).toBe('(itemLabel~"drill") && (ContainerRef!="")');
  });
});

describe('anyOf', () => {
  it('parenthesises the OR group so it cannot leak precedence', () => {
    expect(anyOf(['itemLabel', 'itemName'], 'drill')).toBe(
      '(itemLabel~"drill" || itemName~"drill")'
    );
  });
});

describe('allOf', () => {
  it('returns undefined when there is nothing to filter on', () => {
    expect(allOf([])).toBeUndefined();
    expect(allOf(['', '  '])).toBeUndefined();
  });

  it('leaves a single part unparenthesised', () => {
    expect(allOf(['itemType="hammer"'])).toBe('itemType="hammer"');
  });

  it('parenthesises each part so an embedded || cannot rebind', () => {
    // Without parens this reads as (a && b) || c
    expect(allOf(['a="1" || b="2"', 'c="3"'])).toBe(
      '(a="1" || b="2") && (c="3")'
    );
  });

  it('does not double-wrap a part that is already one group', () => {
    expect(allOf([anyOf(['a', 'b'], 'x'), 'c="3"'])).toBe(
      '(a~"x" || b~"x") && (c="3")'
    );
  });

  it('still wraps a part whose parens are not a single group', () => {
    // (a) || (b) is two groups, so it needs its own wrapper.
    expect(allOf(['(a="1") || (b="2")', 'c="3"'])).toBe(
      '((a="1") || (b="2")) && (c="3")'
    );
  });
});

describe('isUnrepresentableFilterValue', () => {
  it('flags a trailing backslash, which PocketBase cannot parse', () => {
    // Verified against a live PocketBase: "foo\\", 'foo\\' and "foo\\\\" all 400.
    expect(isUnrepresentableFilterValue('foo\\')).toBe(true);
    expect(isUnrepresentableFilterValue('foo\\\\')).toBe(true);
  });

  it('allows a backslash anywhere else', () => {
    expect(isUnrepresentableFilterValue('back\\slash')).toBe(false);
    expect(isUnrepresentableFilterValue('plain')).toBe(false);
    expect(isUnrepresentableFilterValue('')).toBe(false);
  });
});

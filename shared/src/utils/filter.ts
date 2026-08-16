/**
 * Helpers for building PocketBase filter expressions.
 *
 * PocketBase filters are strings, so any value interpolated into one has to be
 * escaped or a caller-supplied value can break out of the string literal and
 * alter the query. Always build filters with these helpers rather than by
 * interpolating into a template literal.
 */

/**
 * True when PocketBase cannot represent this value in a filter literal.
 *
 * A value ending in a backslash is unrepresentable: PocketBase's filter parser
 * rejects every escaping of it (`"foo\\"`, `'foo\\'`, `"foo\\\\"` all error), and
 * the official SDK's own `pb.filter()` produces a broken expression for it
 * too. Callers should reject such input rather than emit a filter that 400s.
 */
export function isUnrepresentableFilterValue(value: string): boolean {
  return /\\+$/.test(value);
}

/**
 * Escape a value for embedding in a PocketBase double-quoted string literal.
 *
 * Backslashes are escaped first: doing it the other way round would re-escape
 * the backslashes introduced when escaping the quotes.
 */
export function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** `field="value"` with the value escaped. */
export function eq(field: string, value: string): string {
  return `${field}="${escapeFilterValue(value)}"`;
}

/** `field~"value"` (PocketBase's "contains") with the value escaped. */
export function like(field: string, value: string): string {
  return `${field}~"${escapeFilterValue(value)}"`;
}

/** `(a~"v" || b~"v")` - the same value matched against several fields. */
export function anyOf(fields: readonly string[], value: string): string {
  return `(${fields.map((field) => like(field, value)).join(' || ')})`;
}

/** True when the whole string is already wrapped in one matching pair. */
function isWrapped(part: string): boolean {
  if (!part.startsWith('(') || !part.endsWith(')')) return false;
  let depth = 0;
  for (let i = 0; i < part.length; i++) {
    if (part[i] === '(') depth++;
    else if (part[i] === ')') {
      depth--;
      // The opening paren closed before the end, so the string is not one group.
      if (depth === 0 && i < part.length - 1) return false;
    }
  }
  return depth === 0;
}

/**
 * Join parts with AND.
 *
 * Each part is parenthesised so a part containing `||` cannot change how the
 * whole expression binds. Parts that are already a single group are left
 * alone, and a lone part is returned untouched, so filters stay readable when
 * echoed with --verbose.
 */
export function allOf(parts: readonly string[]): string | undefined {
  const valid = parts.filter((part) => part && part.trim());
  if (valid.length === 0) return undefined;
  if (valid.length === 1) return valid[0];
  return valid
    .map((part) => (isWrapped(part) ? part : `(${part})`))
    .join(' && ');
}

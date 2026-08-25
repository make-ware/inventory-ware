/**
 * Client-side mirrors of the PocketBase filter and sort that a list query ran
 * with, so an SSE record can be placed in (or removed from) the cached window
 * without asking the server where it belongs.
 *
 * These are approximations by design, and the approximation is bounded: any
 * divergence is corrected by the next fetch of that key (the gap-heal
 * invalidation on subscribe, load-more, or a mutation's invalidation). They
 * exist to keep a live list from flickering through a refetch on every event,
 * not to be a second implementation of PocketBase's query engine.
 *
 * Nothing here builds a filter *string* — filters are the mutator layer's job
 * (see CLAUDE.md). These functions read already-fetched records.
 */
import type { LiveListRecord, LiveListSpec } from '@/lib/live-list';

/** The `compare`/`canCompare` half of a `LiveListSpec`. */
export type SortSpec<T extends LiveListRecord> = Required<
  Pick<LiveListSpec<T>, 'compare' | 'canCompare'>
>;

interface SortTerm {
  field: string;
  descending: boolean;
}

/**
 * Split a PocketBase sort string (`"-created,+itemLabel"`) into its terms.
 *
 * A bare field name is ascending, matching PocketBase. `@random` and
 * dotted paths (`ImageRef.file`) are dropped: the first has no stable client
 * ordering at all, and the second reads through an expand that realtime events
 * do not reliably carry — both are reported by `canCompare` instead of being
 * guessed at.
 */
function parseSort(sort: string): { terms: SortTerm[]; exact: boolean } {
  const parts = sort
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  const terms: SortTerm[] = [];
  let exact = true;
  for (const part of parts) {
    const descending = part.startsWith('-');
    const field = part.replace(/^[+-]/, '');
    if (!field || field.startsWith('@') || field.includes('.')) {
      exact = false;
      continue;
    }
    terms.push({ field, descending });
  }
  return { terms, exact };
}

/**
 * Compare two field values the way SQLite (and therefore PocketBase) orders
 * them: numbers numerically, everything else by byte order rather than by
 * locale, since PocketBase's text columns carry no `COLLATE NOCASE`.
 */
function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a === b ? 0 : a < b ? -1 : 1;
  }
  const left = a == null ? '' : String(a);
  const right = b == null ? '' : String(b);
  return left === right ? 0 : left < right ? -1 : 1;
}

function readField(record: LiveListRecord, field: string): unknown {
  return (record as unknown as Record<string, unknown>)[field];
}

/**
 * Build the sort half of a `LiveListSpec` from the same sort string the list
 * query sent to PocketBase.
 *
 * The comparator always ends in an `id` tiebreak, so two distinct records
 * never compare equal — `applyListEvent` reads a 0 as "this update did not
 * move the record", which would otherwise be indistinguishable from "these two
 * rows are interchangeable".
 *
 * `canCompare` is false when the record is missing a value for a sort field,
 * or when the sort itself is not client-representable (`@random`, an expanded
 * relation). Such records are replaced in place and never repositioned, so a
 * partial SSE payload can reorder nothing.
 */
export function buildSortSpec<T extends LiveListRecord>(
  sort: string
): SortSpec<T> {
  const { terms, exact } = parseSort(sort);

  const compare = (a: T, b: T): number => {
    for (const term of terms) {
      const result = compareValues(
        readField(a, term.field),
        readField(b, term.field)
      );
      if (result !== 0) return term.descending ? -result : result;
    }
    return compareValues(a.id, b.id);
  };

  const canCompare = (record: T): boolean =>
    exact && terms.every((term) => readField(record, term.field) !== undefined);

  return { compare, canCompare };
}

/**
 * Mirror of `anyOf(fields, query)` — PocketBase's `~` operator across several
 * fields, which is a case-insensitive substring match.
 *
 * `%` and `_` are LIKE wildcards server-side and are matched literally here;
 * a search containing one is the (rare) case where the window drifts until the
 * next fetch, which is the tradeoff this whole module is built on.
 */
export function matchesAnyField(
  record: LiveListRecord,
  fields: readonly string[],
  query: string
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return fields.some((field) => {
    const value = readField(record, field);
    return typeof value === 'string' && value.toLowerCase().includes(needle);
  });
}

/**
 * Mirror of a conjunction of `eq(field, value)` clauses. Entries whose value is
 * undefined/empty are absent from the server filter and so are skipped here
 * too — a cleared select must not narrow anything.
 */
export function matchesAllFields(
  record: LiveListRecord,
  filters: Readonly<Record<string, string | undefined>>
): boolean {
  return Object.entries(filters).every(
    ([field, value]) => !value || readField(record, field) === value
  );
}

/**
 * Field extraction, matching and scoring. Pure — no I/O, no provider, no clock —
 * so the interesting half of the benchmark is testable without an API key.
 */
import { slugify } from '@project/shared';
import type { AnalysisResult } from '@project/shared';
import type { BenchmarkCase, FieldScore } from './types.js';

/**
 * Split a dot path into segments, turning `containerItems[0]` into
 * `['containerItems', '0']`. Bare indices (`[0].itemType`) work too.
 */
export function pathSegments(path: string): string[] {
  return path
    .split('.')
    .filter((part) => part.length > 0)
    .flatMap((part) => {
      const match = /^([^[\]]*)((?:\[\d+\])*)$/.exec(part);
      if (!match) return [part];
      const [, key, indexes] = match;
      const parsed = [...indexes.matchAll(/\[(\d+)\]/g)].map((m) => m[1]);
      return key ? [key, ...parsed] : parsed;
    });
}

/**
 * Flatten whatever a path landed on into the strings a term can be compared
 * against.
 *
 * The one shaped case is an item attribute: the schema stores `{name, value}`
 * pairs, and a case file wants to say "there is a Voltage attribute" without
 * pinning the value, so each pair becomes `"name: value"` and substring
 * matching does the rest.
 */
export function toComparableStrings(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string') return [value];
  if (typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)];
  }
  if (Array.isArray(value)) return value.flatMap(toComparableStrings);
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.name === 'string' && typeof record.value === 'string') {
      return [`${record.name}: ${record.value}`];
    }
    return [];
  }
  return [];
}

/**
 * Read a dot path out of an analysis `data` object.
 *
 * Returns every string the path resolves to, or an empty array when the path
 * does not exist — which is the normal outcome for an `item.*` expectation
 * against a run the model classified as a container.
 */
export function getField(source: unknown, fieldPath: string): string[] {
  let current: unknown = source;

  for (const segment of pathSegments(fieldPath)) {
    if (current === null || current === undefined) return [];
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) return [];
      current = current[index];
      continue;
    }
    if (typeof current !== 'object') return [];
    current = (current as Record<string, unknown>)[segment];
  }

  return toComparableStrings(current);
}

/**
 * Canonical form for comparison: slug-normalised, lower-cased, and with hyphens
 * and spaces collapsed to a single space.
 *
 * The separator rule is not incidental — the analysis prompt tells the model
 * that "power-tools", "Power tools" and "Power Tools" are the same value, so
 * the scorer has to agree or it would penalise the model for a difference the
 * prompt declared meaningless.
 */
export function normalize(value: string): string {
  return slugify(value)
    .toLowerCase()
    .replace(/[-\s]+/g, ' ')
    .trim();
}

/**
 * Does any extracted value satisfy any expected term?
 *
 * Substring-tolerant in one direction only: an actual value may be longer than
 * the term ("Cordless Drill" satisfies "Drill", "Voltage: 20V" satisfies
 * "Voltage"), but a term is never allowed to be the longer of the two — that
 * would let a bare "Drill" answer an expectation of "Hammer Drill".
 */
export function fieldMatches(
  actualValues: string[],
  expectedTerms: string[]
): boolean {
  const terms = expectedTerms.map(normalize).filter((term) => term.length > 0);
  if (terms.length === 0) return false;

  const actuals = actualValues.map(normalize).filter((a) => a.length > 0);
  return terms.some((term) =>
    actuals.some((actual) => actual === term || actual.includes(term))
  );
}

/** Which analysis type a field path can possibly resolve against. */
function requiredType(fieldPath: string): 'item' | 'container' | undefined {
  const [root] = pathSegments(fieldPath);
  return root === 'item' || root === 'container' ? root : undefined;
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

/**
 * Score one case's runs, one entry per expectation.
 *
 * `total` is the number of runs that actually produced a result, so a provider
 * failure lowers confidence in the sample rather than silently counting as a
 * miss.
 */
export function scoreCase(
  benchmarkCase: BenchmarkCase,
  runs: AnalysisResult[]
): { scores: FieldScore[]; avgScore: number } {
  const scores = benchmarkCase.expectations.map<FieldScore>((expectation) => {
    const total = runs.length;
    const notes: string[] = [];

    if (expectation.expected.length === 0) {
      notes.push('no expected terms — this expectation can never be satisfied');
    }
    if (expectation.note) notes.push(expectation.note);

    const wanted = requiredType(expectation.field);
    if (wanted) {
      const mismatched = runs.filter((run) => run.type !== wanted).length;
      if (mismatched > 0) {
        notes.push(
          `${mismatched}/${total} run(s) were classified as the other analysis type, ` +
            `so "${expectation.field}" could not resolve there`
        );
      }
    }

    const hits = runs.filter((run) =>
      fieldMatches(getField(run.data, expectation.field), expectation.expected)
    ).length;

    return {
      field: expectation.field,
      expected: expectation.expected,
      hits,
      total,
      score: total === 0 ? 0 : round(hits / total),
      ...(notes.length > 0 ? { note: notes.join('; ') } : {}),
    };
  });

  return { scores, avgScore: mean(scores.map((s) => s.score)) };
}

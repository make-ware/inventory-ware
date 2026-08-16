/** Levenshtein distance, capped implicitly by the short inputs we compare. */
function distance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  let previous = Array.from({ length: cols }, (_, i) => i);

  for (let i = 1; i < rows; i++) {
    const current = [i, ...new Array<number>(cols - 1).fill(0)];
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + cost
      );
    }
    previous = current;
  }
  return previous[cols - 1];
}

/**
 * Closest candidate to `value`, or undefined when nothing is close enough.
 *
 * The threshold scales with length so short names do not match everything.
 */
export function suggest(
  value: string,
  candidates: readonly string[]
): string | undefined {
  const needle = value.toLowerCase();
  const limit = Math.max(2, Math.floor(needle.length / 3) + 1);

  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const d = distance(needle, candidate.toLowerCase());
    if (d < bestDistance) {
      bestDistance = d;
      best = candidate;
    }
  }

  return bestDistance <= limit ? best : undefined;
}

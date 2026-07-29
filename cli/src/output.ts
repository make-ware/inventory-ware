const useColor =
  !process.env.NO_COLOR && process.stdout.isTTY && process.env.TERM !== 'dumb';

const ESC = '\u001b';

export const bold = (s: string) => (useColor ? `${ESC}[1m${s}${ESC}[22m` : s);
export const dim = (s: string) => (useColor ? `${ESC}[2m${s}${ESC}[22m` : s);
export const green = (s: string) => (useColor ? `${ESC}[32m${s}${ESC}[39m` : s);

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function cell(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (Array.isArray(value)) {
    if (value.length === 0) return '-';
    // Lists of plain strings (e.g. category libraries) are worth showing.
    if (value.every((entry) => typeof entry === 'string')) {
      return value.join(', ');
    }
    return `${value.length} item(s)`;
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function truncate(value: string, max: number): string {
  if (max <= 1 || value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

/**
 * Render rows as an aligned table. Columns are `[key, heading]` pairs.
 */
export function printTable(
  rows: Array<Record<string, unknown>>,
  columns: Array<[string, string]>,
  maxCellWidth = 40
): void {
  if (rows.length === 0) {
    console.log(dim('No results.'));
    return;
  }

  const headings = columns.map(([, heading]) => heading);
  const body = rows.map((row) =>
    columns.map(([key]) => truncate(cell(row[key]), maxCellWidth))
  );

  const widths = headings.map((heading, index) =>
    Math.max(heading.length, ...body.map((cells) => cells[index].length))
  );

  const line = (cells: string[]) =>
    cells
      .map((value, index) =>
        index === cells.length - 1 ? value : value.padEnd(widths[index])
      )
      .join('  ')
      .trimEnd();

  console.log(bold(line(headings)));
  for (const cells of body) console.log(line(cells));
}

/** Print a single record as aligned `key: value` lines. */
export function printRecord(
  record: Record<string, unknown>,
  keys?: string[]
): void {
  const entries = (keys ?? Object.keys(record)).filter(
    (key) => record[key] !== undefined
  );
  if (entries.length === 0) return;

  const width = Math.max(...entries.map((key) => key.length));
  for (const key of entries) {
    console.log(`${dim(`${key}:`.padEnd(width + 1))} ${cell(record[key])}`);
  }
}

export function success(message: string): void {
  console.log(`${green('✓')} ${message}`);
}

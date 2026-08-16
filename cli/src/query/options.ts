import { type Command, InvalidArgumentError, Option } from 'commander';
import { isUnrepresentableFilterValue } from '@project/shared';
import { attachUsage, CliError, EXIT } from '../errors.js';
import type { EntitySpec } from './spec.js';
import { suggest } from './suggest.js';

export const DEFAULT_PER_PAGE = 100;
export const MAX_PER_PAGE = 500;
/** Page size used when walking every page for `--all`. */
export const ALL_BATCH_SIZE = 200;
/** Stop `--all` here rather than hammering the server indefinitely. */
export const ALL_MAX_ITEMS = 10_000;

/** argParser for a positive integer, optionally capped. */
export const positiveInt =
  (max = Number.MAX_SAFE_INTEGER) =>
  (value: string): number => {
    if (!/^\d+$/.test(value.trim())) {
      throw new InvalidArgumentError('Expected a whole number.');
    }
    const parsed = Number.parseInt(value, 10);
    if (parsed < 1) throw new InvalidArgumentError('Expected 1 or greater.');
    if (parsed > max)
      throw new InvalidArgumentError(`Expected ${max} or less.`);
    return parsed;
  };

export interface QueryOptionsConfig {
  /** Set false when a positional `<query>` supplies the search text. */
  search?: boolean;
  /** Filter keys to leave off, e.g. `container` when it is a positional. */
  omitFilters?: string[];
}

/** Help text listing the allowlists, so `--help` answers the common questions. */
function helpFooter(spec: EntitySpec): string {
  const lines = [
    '',
    `Sort fields:   ${spec.sortFields.join(', ')}`,
    `Expand:        ${spec.expandFields.join(', ')}`,
    `Fields:        ${spec.selectableFields.join(', ')}`,
    '',
    'Examples:',
    `  iw ${spec.noun} list --sort -created --per-page 20`,
    `  iw ${spec.noun} list --all --json | jq '.items[].id'`,
    `  iw ${spec.noun} list --fields id,created --count`,
  ];
  return lines.join('\n');
}

/**
 * Add the standard query flags to a list-style command.
 *
 * Every list command gets the identical set, so the flags transfer between
 * entities and only the entity-specific filters differ.
 */
export function addQueryOptions(
  command: Command,
  spec: EntitySpec,
  config: QueryOptionsConfig = {}
): Command {
  if (config.search !== false && spec.searchFields.length > 0) {
    command.addOption(
      new Option('-q, --search <text>', `match ${spec.searchFields.join(', ')}`)
    );
  }

  for (const filter of spec.filters) {
    if (config.omitFilters?.includes(filter.key)) continue;
    const option = new Option(filter.flags, filter.description);
    if (filter.choices) option.choices([...filter.choices]);
    command.addOption(option);
  }

  return command
    .addOption(
      new Option(
        '-s, --sort <expr>',
        'comma-separated sort fields; prefix with "-" for descending'
      ).default(spec.defaultSort)
    )
    .addOption(
      new Option('-e, --expand <relations>', 'comma-separated relations')
    )
    .addOption(new Option('--fields <names>', 'comma-separated columns'))
    .addOption(
      new Option('--page <n>', 'page number')
        .default(1)
        .argParser(positiveInt())
    )
    .addOption(
      new Option('--per-page <n>', 'results per page')
        .default(DEFAULT_PER_PAGE)
        .argParser(positiveInt(MAX_PER_PAGE))
    )
    .addOption(
      new Option('--all', 'fetch every page').conflicts(['page', 'count'])
    )
    .addOption(
      new Option('--count', 'print only the number of matches').conflicts([
        'fields',
      ])
    )
    .addOption(new Option('--json', 'output raw JSON'))
    .addHelpText('after', helpFooter(spec));
}

/** Raise a usage error naming the allowlist, plus a "did you mean" when close. */
function rejectValue(
  value: string,
  allowed: readonly string[],
  flag: string,
  label: string,
  extra: string[] = []
): never {
  const hints: string[] = [];
  const guess = suggest(value, allowed);
  if (guess) hints.push(`did you mean "${guess}"?`);
  hints.push(`valid ${label}s: ${allowed.join(', ')}`);
  hints.push(...extra);
  throw new CliError(
    `Unknown ${label} "${value}" in ${flag}.`,
    EXIT.USAGE,
    hints
  );
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Validated, mutator-ready form of the standard query flags. */
export interface ParsedQuery {
  search: string;
  filters: Record<string, string>;
  sort?: string;
  expand?: string;
  fields: string[];
  columns: Array<[string, string]>;
  page: number;
  perPage: number;
  all: boolean;
  count: boolean;
  json: boolean;
}

export interface RawQueryOptions {
  search?: string;
  sort?: string;
  expand?: string;
  fields?: string;
  page?: number;
  perPage?: number;
  all?: boolean;
  count?: boolean;
  json?: boolean;
  [key: string]: unknown;
}

/**
 * Validate the standard query flags against the entity's allowlists.
 *
 * Validating here rather than letting PocketBase reject the request turns an
 * opaque 400 into a message that names the valid values.
 */
export function parseQueryOptions(
  spec: EntitySpec,
  opts: RawQueryOptions,
  command?: Command
): ParsedQuery {
  try {
    return parseQueryOptionsInner(spec, opts, command);
  } catch (error) {
    // Callers validate before building a context, so the usage line has to be
    // attached here rather than by run().
    throw command ? attachUsage(error, command) : error;
  }
}

function parseQueryOptionsInner(
  spec: EntitySpec,
  opts: RawQueryOptions,
  command?: Command
): ParsedQuery {
  // --sort: comma list, each optionally prefixed with "-" for descending.
  let sort: string | undefined;
  if (opts.sort) {
    const parts = splitList(opts.sort);
    for (const part of parts) {
      const field =
        part.startsWith('-') || part.startsWith('+') ? part.slice(1) : part;
      if (!spec.sortFields.includes(field)) {
        rejectValue(field, spec.sortFields, '--sort', 'sort field', [
          'prefix with "-" for descending, e.g. --sort -created',
        ]);
      }
    }
    sort = parts.join(',');
  }

  // --expand: comma list of relation fields.
  let expand: string | undefined;
  if (opts.expand) {
    const parts = splitList(opts.expand);
    for (const part of parts) {
      if (!spec.expandFields.includes(part)) {
        rejectValue(part, spec.expandFields, '--expand', 'relation');
      }
    }
    expand = parts.join(',');
  }

  // --fields: comma list of columns to show.
  let fields = [...spec.defaultColumns];
  if (opts.fields) {
    const parts = splitList(opts.fields);
    for (const part of parts) {
      if (!spec.selectableFields.includes(part)) {
        rejectValue(part, spec.selectableFields, '--fields', 'field');
      }
    }
    fields = parts;
  }

  // PocketBase cannot represent a trailing backslash in a filter literal, so
  // catch it here rather than letting the request come back as an opaque 400.
  const search = opts.search ?? '';
  if (isUnrepresentableFilterValue(search)) {
    throw new CliError('Search text cannot end with a backslash.', EXIT.USAGE, [
      'PocketBase cannot represent a trailing backslash in a filter.',
      'Drop the trailing backslash, or search for a shorter fragment.',
    ]);
  }

  // Entity filters, normalized (e.g. slugified) on the way to the mutator.
  const filters: Record<string, string> = {};
  for (const filter of spec.filters) {
    const value = opts[filter.key];
    if (typeof value !== 'string' || value === '') continue;
    const normalized = filter.normalize ? filter.normalize(value) : value;
    if (isUnrepresentableFilterValue(normalized)) {
      const flag = filter.flags.split(',').pop()?.trim().split(' ')[0];
      throw new CliError(
        `Value for ${flag} cannot end with a backslash.`,
        EXIT.USAGE,
        'PocketBase cannot represent a trailing backslash in a filter.'
      );
    }
    filters[filter.filterKey] = normalized;
  }

  const all = Boolean(opts.all);
  // With --all the user's --per-page becomes the batch size; otherwise use a
  // larger default batch so walking every page costs fewer round trips.
  const explicitPerPage =
    command?.getOptionValueSource?.('perPage') !== undefined &&
    command.getOptionValueSource('perPage') !== 'default';
  const perPage = all
    ? explicitPerPage
      ? (opts.perPage ?? ALL_BATCH_SIZE)
      : ALL_BATCH_SIZE
    : (opts.perPage ?? DEFAULT_PER_PAGE);

  return {
    search,
    filters,
    sort,
    expand,
    fields,
    columns: fields.map(
      (key) =>
        [key, spec.headings[key] ?? key.toUpperCase()] as [string, string]
    ),
    page: opts.page ?? 1,
    perPage,
    all,
    count: Boolean(opts.count),
    json: Boolean(opts.json),
  };
}

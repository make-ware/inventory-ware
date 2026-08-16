import type { ListResult, RecordModel } from 'pocketbase';
import { withQuietMutators } from '../errors.js';
import {
  printJson,
  printListFooter,
  printTable,
  projectFields,
} from '../output.js';
import { ALL_MAX_ITEMS } from './options.js';
import type { ParsedQuery } from './options.js';

/** The one call every list command makes, whatever the entity. */
export type Fetcher<T> = (query: {
  page: number;
  perPage: number;
  sort?: string;
  expand?: string;
}) => Promise<ListResult<T>>;

/** A `ListResult` plus a marker for when `--all` hit its safety cap. */
export type QueryResult<T> = ListResult<T> & { truncated?: boolean };

/**
 * Fetch one page, every page (`--all`), or just the total (`--count`).
 *
 * `totalPages`/`totalItems` are defaulted defensively so a thin mock or an
 * unusual response cannot turn the `--all` loop into an infinite one.
 */
export async function executeQuery<T extends RecordModel>(
  query: ParsedQuery,
  fetch: Fetcher<T>
): Promise<QueryResult<T>> {
  const { sort, expand } = query;

  if (query.count) {
    // perPage 1 still returns totalItems, so this is the cheapest count.
    const result = await withQuietMutators(() =>
      fetch({ page: 1, perPage: 1, sort, expand })
    );
    return { ...result, items: [] };
  }

  if (!query.all) {
    return await withQuietMutators(() =>
      fetch({ page: query.page, perPage: query.perPage, sort, expand })
    );
  }

  const items: T[] = [];
  let page = 1;
  let totalItems: number;
  let truncated = false;

  for (;;) {
    const result = await withQuietMutators(() =>
      fetch({ page, perPage: query.perPage, sort, expand })
    );
    totalItems = result.totalItems ?? items.length + result.items.length;
    items.push(...result.items);

    if (items.length >= ALL_MAX_ITEMS) {
      truncated = true;
      break;
    }
    if (result.items.length === 0) break;
    if (page >= (result.totalPages ?? 1)) break;
    page += 1;
  }

  if (truncated) {
    console.error(
      `warning: --all stopped at ${items.length} of ${totalItems} results. ` +
        'Narrow the query, or page manually with --page/--per-page.'
    );
  }

  return {
    page: 1,
    perPage: items.length,
    totalItems,
    totalPages: 1,
    items,
    ...(truncated ? { truncated } : {}),
  };
}

/**
 * Render a query result.
 *
 * Every list command emits the same JSON envelope, so `jq '.items[]'` works
 * against all of them.
 */
export function renderQuery<T extends RecordModel>(
  query: ParsedQuery,
  result: QueryResult<T>
): void {
  if (query.count) {
    if (query.json) {
      printJson({ totalItems: result.totalItems });
      return;
    }
    console.log(String(result.totalItems));
    return;
  }

  const rows = result.items as unknown as Array<Record<string, unknown>>;

  if (query.json) {
    printJson({
      page: result.page,
      perPage: result.perPage,
      totalItems: result.totalItems,
      totalPages: result.totalPages,
      ...(result.truncated ? { truncated: true } : {}),
      items: projectFields(rows, query.fields),
    });
    return;
  }

  printTable(rows, query.columns);
  printListFooter(result);
}

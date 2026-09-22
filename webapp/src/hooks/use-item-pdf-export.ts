'use client';

/**
 * The three item PDF exports (filtered list, selection, single item), sharing
 * one spinner and one error path.
 *
 * `exportFiltered` runs the grid's own query — `buildItemSearchOptions` is the
 * same function `useItemsInfinite` spreads — and walks every page of it, so
 * the PDF holds exactly what the grid would show across all its pages for the
 * same URL state. Filters are still built by `ItemMutator`, never here.
 *
 * `printLabels` prints QR labels for the same two scopes, one
 * `/api-next/labels/generate` request per target and one print job for all of
 * them; `useItemPrintPreview` backs the print dialog's preview pane.
 *
 * Every entry point opens the export window before its first `await`: the
 * browser only allows `window.open` inside the click, and a window opened
 * after the fetches is a blocked pop-up.
 */
import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ItemMutator,
  formatCategoryLabel,
  isUnrepresentableFilterValue,
} from '@project/shared';
import type { Item } from '@project/shared';
import type { SearchFilters } from '@/components/inventory';
import pb from '@/lib/pocketbase-client';
import { qk } from '@/lib/query';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { buildItemSearchOptions, normaliseFilters } from '@/hooks/use-items';
import {
  buildItemPreviewHtml,
  buildItemsExportHtml,
  openExportWindow,
  writeExportWindow,
} from '@/services/item-pdf-export';
import type { ExportItem, ExportSummary } from '@/services/item-pdf-export';
import {
  PRINT_POPUP_BLOCKED_MESSAGE,
  buildLabelsPrintHtml,
  fetchLabelSvg,
} from '@/services/label-print';
import type { LabelFormat } from '@/services/label-print';

/** Page size used to walk the full result set; PocketBase's own cap is 500. */
export const EXPORT_PAGE_SIZE = 100;

const EXPORT_EXPAND = 'ImageRef,ContainerRef';

export interface ExportFilteredOptions {
  userId: string | null;
  q?: string;
  filters?: SearchFilters;
  sort?: string;
  /** Human-readable sort, for the summary header. */
  sortLabel?: string;
}

/** What a print covers: the selection as given, or the grid's whole query. */
export type PrintScope =
  | { kind: 'selected'; ids: string[] }
  | { kind: 'filtered'; query: ExportFilteredOptions };

export interface PrintLabelsOptions {
  /** Called before each label request with its 1-based position. */
  onProgress?: (current: number, total: number) => void;
}

type Loaded = {
  items: ExportItem[];
  summary: Omit<ExportSummary, 'generatedAt' | 'count'>;
};

function summaryFilters(filters?: SearchFilters) {
  const normalised = normaliseFilters(filters);
  const entries: [string, string | undefined][] = [
    ['Functional', normalised.functional],
    ['Specific', normalised.specific],
    ['Type', normalised.itemType],
  ];
  return entries
    .filter((entry): entry is [string, string] => !!entry[1])
    .map(([label, value]) => ({ label, value: formatCategoryLabel(value) }));
}

/** "Print Items [3]", or "Print Items" with no count; entity-agnostic so
 *  containers/images can reuse it. */
export function formatPrintLabel(entity: string, count?: number): string {
  return count !== undefined && count > 0
    ? `Print ${entity} [${count}]`
    : `Print ${entity}`;
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useItemPdfExport() {
  const itemMutator = useMemo(() => new ItemMutator(pb), []);
  const [isExporting, setIsExporting] = useState(false);

  /**
   * Every page of the grid's query, deduped, in sort order. Resolves to no
   * rows for a query the grid itself withholds.
   */
  const loadFiltered = useCallback(
    async ({
      userId,
      q = '',
      filters,
      sort,
    }: ExportFilteredOptions): Promise<Item[]> => {
      // The grid withholds these queries; so does the export.
      if (!userId || isUnrepresentableFilterValue(q)) return [];

      const options = buildItemSearchOptions({ filters, sort });
      const byId = new Map<string, Item>();
      let page = 1;
      let totalPages = 1;
      do {
        const result = await itemMutator.search(q, {
          ...options,
          page,
          perPage: EXPORT_PAGE_SIZE,
          expand: EXPORT_EXPAND,
        });
        totalPages = result.totalPages;
        // A concurrent insert can push a row across a page boundary; keep
        // its first (sort-order) position only.
        for (const item of result.items) {
          if (item.UserRef === userId && !byId.has(item.id)) {
            byId.set(item.id, item);
          }
        }
        page += 1;
      } while (page <= totalPages);

      return Array.from(byId.values());
    },
    [itemMutator]
  );

  /** The selected records in selection order, minus any that are gone. */
  const loadSelected = useCallback(
    async (ids: string[]): Promise<Item[]> => {
      // `Promise.all` keeps input order, so the PDF follows the selection.
      const records = await Promise.all(
        ids.map((id) => itemMutator.getById(id, EXPORT_EXPAND))
      );
      return records.filter((item): item is Item => item !== null);
    },
    [itemMutator]
  );

  /**
   * Resolves `true` when the export went out or there was nothing to export,
   * `false` when it failed — the print dialog stays open on `false`.
   */
  const run = useCallback(
    async (load: () => Promise<Loaded> | Loaded): Promise<boolean> => {
      let win: Window;
      try {
        win = openExportWindow();
      } catch (error) {
        toast.error(errorText(error, 'Failed to export PDF'));
        return false;
      }

      setIsExporting(true);
      try {
        const { items, summary } = await load();
        if (items.length === 0) {
          win.close();
          toast.info('There are no items to export');
          return true;
        }
        writeExportWindow(
          win,
          buildItemsExportHtml(items, {
            ...summary,
            generatedAt: new Date(),
            count: items.length,
          })
        );
        return true;
      } catch (error) {
        win.close();
        toast.error(errorText(error, 'Failed to export PDF'));
        return false;
      } finally {
        setIsExporting(false);
      }
    },
    []
  );

  const exportFiltered = useCallback(
    (options: ExportFilteredOptions) =>
      run(async () => ({
        items: await loadFiltered(options),
        summary: {
          title: 'Inventory items',
          query: options.q?.trim() || undefined,
          filters: summaryFilters(options.filters),
          sortLabel: options.sortLabel,
        },
      })),
    [loadFiltered, run]
  );

  const exportSelected = useCallback(
    (ids: string[]) =>
      run(async () => {
        const items = await loadSelected(ids);
        return {
          items,
          summary: { title: `Selected items (${items.length})` },
        };
      }),
    [loadSelected, run]
  );

  const exportItems = useCallback(
    (items: ExportItem[], summary?: Partial<Loaded['summary']>) =>
      run(() => ({
        items,
        summary: {
          title: items.length === 1 ? items[0].itemLabel : 'Inventory items',
          ...summary,
        },
      })),
    [run]
  );

  /**
   * One label per record in `scope`, fetched one after another and printed as
   * a single job. Stops at the first failed label: a partial sheet would be
   * easy to mistake for the full one. Same `true`/`false` contract as `run`.
   */
  const printLabels = useCallback(
    async (
      scope: PrintScope,
      format: LabelFormat,
      { onProgress }: PrintLabelsOptions = {}
    ): Promise<boolean> => {
      let win: Window;
      try {
        win = openExportWindow(PRINT_POPUP_BLOCKED_MESSAGE);
      } catch (error) {
        toast.error(errorText(error, 'Failed to print labels'));
        return false;
      }

      setIsExporting(true);
      try {
        const ids =
          scope.kind === 'selected'
            ? scope.ids
            : (await loadFiltered(scope.query)).map((item) => item.id);
        if (ids.length === 0) {
          win.close();
          toast.info('There are no items to print');
          return true;
        }

        const svgs: string[] = [];
        for (const [index, targetId] of ids.entries()) {
          onProgress?.(index + 1, ids.length);
          svgs.push(
            await fetchLabelSvg({
              targetId,
              targetType: 'item',
              format,
              token: pb.authStore.token,
            })
          );
        }
        writeExportWindow(win, buildLabelsPrintHtml(svgs, format));
        return true;
      } catch (error) {
        win.close();
        toast.error(errorText(error, 'Failed to print labels'));
        return false;
      } finally {
        setIsExporting(false);
      }
    },
    [loadFiltered]
  );

  return {
    isExporting,
    exportFiltered,
    exportSelected,
    exportItems,
    printLabels,
  };
}

export interface UseItemPrintPreviewOptions {
  scope: PrintScope;
  what: 'summary' | 'labels';
  format: LabelFormat;
  enabled?: boolean;
}

/**
 * The print dialog's preview: the first record the print would cover, how
 * many it covers in all, and that record rendered as the chosen output.
 *
 * Only the first record is fetched — one `getOne` for a selection, a
 * one-row page of the grid's query for the filtered set, whose `totalItems`
 * is the count. The label SVG is a network render, so its input is debounced
 * to keep flicking through formats from firing a request per step.
 */
export function useItemPrintPreview({
  scope,
  what,
  format,
  enabled = true,
}: UseItemPrintPreviewOptions) {
  const itemMutator = useMemo(() => new ItemMutator(pb), []);

  const userId = scope.kind === 'filtered' ? scope.query.userId : null;
  const keyScope = useMemo(
    () =>
      scope.kind === 'selected'
        ? { kind: 'selected' as const, ids: scope.ids }
        : {
            kind: 'filtered' as const,
            q: scope.query.q ?? '',
            filters: normaliseFilters(scope.query.filters),
            sort: scope.query.sort ?? '-created',
          },
    [scope]
  );

  const firstQuery = useQuery({
    queryKey: qk.itemsPrintPreview(userId ?? '', keyScope),
    queryFn: async (): Promise<{ first: Item | null; total: number }> => {
      if (keyScope.kind === 'selected') {
        const { ids } = keyScope;
        if (ids.length === 0) return { first: null, total: 0 };
        const first = await itemMutator.getById(ids[0], EXPORT_EXPAND);
        return { first, total: ids.length };
      }
      const { q, filters, sort } = keyScope;
      // Same guards as the export itself.
      if (!userId || isUnrepresentableFilterValue(q)) {
        return { first: null, total: 0 };
      }
      const result = await itemMutator.search(q, {
        ...buildItemSearchOptions({ filters, sort }),
        page: 1,
        perPage: 1,
        expand: EXPORT_EXPAND,
      });
      const first = result.items[0];
      return {
        first: first && first.UserRef === userId ? first : null,
        total: result.totalItems,
      };
    },
    enabled,
  });

  const first = firstQuery.data?.first ?? null;
  const total = firstQuery.data?.total ?? 0;

  const labelInput = useMemo(
    () => ({ targetId: first?.id ?? null, format }),
    [first?.id, format]
  );
  const debouncedLabel = useDebouncedValue(labelInput);
  const isDebouncing = debouncedLabel !== labelInput;
  const wantsLabel = enabled && what === 'labels';

  const labelQuery = useQuery({
    queryKey: qk.labelPreview(
      debouncedLabel.targetId ?? '',
      debouncedLabel.format
    ),
    queryFn: ({ signal }) =>
      fetchLabelSvg({
        targetId: debouncedLabel.targetId as string,
        targetType: 'item',
        format: debouncedLabel.format,
        token: pb.authStore.token,
        signal,
      }),
    enabled: wantsLabel && !!debouncedLabel.targetId && !isDebouncing,
  });

  const previewHtml = useMemo(
    () => (first ? buildItemPreviewHtml(first) : null),
    [first]
  );

  const isLoading =
    firstQuery.isLoading ||
    (wantsLabel && !!first && (isDebouncing || labelQuery.isLoading));

  return {
    first,
    total,
    previewHtml,
    svg: wantsLabel && !isDebouncing ? (labelQuery.data ?? null) : null,
    isLoading,
    isError: firstQuery.isError || (wantsLabel && labelQuery.isError),
  };
}

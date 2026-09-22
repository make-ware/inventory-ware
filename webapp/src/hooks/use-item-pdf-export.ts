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
 * Every entry point opens the export window before its first `await`: the
 * browser only allows `window.open` inside the click, and a window opened
 * after the fetches is a blocked pop-up.
 */
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ItemMutator,
  formatCategoryLabel,
  isUnrepresentableFilterValue,
} from '@project/shared';
import type { Item } from '@project/shared';
import type { SearchFilters } from '@/components/inventory';
import pb from '@/lib/pocketbase-client';
import { buildItemSearchOptions, normaliseFilters } from '@/hooks/use-items';
import {
  buildItemsExportHtml,
  openExportWindow,
  writeExportWindow,
} from '@/services/item-pdf-export';
import type { ExportItem, ExportSummary } from '@/services/item-pdf-export';

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

export function useItemPdfExport() {
  const itemMutator = useMemo(() => new ItemMutator(pb), []);
  const [isExporting, setIsExporting] = useState(false);

  const run = useCallback(async (load: () => Promise<Loaded> | Loaded) => {
    let win: Window;
    try {
      win = openExportWindow();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to export PDF'
      );
      return;
    }

    setIsExporting(true);
    try {
      const { items, summary } = await load();
      if (items.length === 0) {
        win.close();
        toast.info('There are no items to export');
        return;
      }
      writeExportWindow(
        win,
        buildItemsExportHtml(items, {
          ...summary,
          generatedAt: new Date(),
          count: items.length,
        })
      );
    } catch (error) {
      win.close();
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : 'Failed to export PDF'
      );
    } finally {
      setIsExporting(false);
    }
  }, []);

  const exportFiltered = useCallback(
    ({ userId, q = '', filters, sort, sortLabel }: ExportFilteredOptions) =>
      run(async () => {
        const summary = {
          title: 'Inventory items',
          query: q.trim() || undefined,
          filters: summaryFilters(filters),
          sortLabel,
        };
        // The grid withholds these queries; so does the export.
        if (!userId || isUnrepresentableFilterValue(q)) {
          return { items: [], summary };
        }

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

        return { items: Array.from(byId.values()), summary };
      }),
    [itemMutator, run]
  );

  const exportSelected = useCallback(
    (ids: string[]) =>
      run(async () => {
        // `Promise.all` keeps input order, so the PDF follows the selection.
        const records = await Promise.all(
          ids.map((id) => itemMutator.getById(id, EXPORT_EXPAND))
        );
        const items = records.filter((item): item is Item => item !== null);
        return {
          items,
          summary: { title: `Selected items (${items.length})` },
        };
      }),
    [itemMutator, run]
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

  return { isExporting, exportFiltered, exportSelected, exportItems };
}

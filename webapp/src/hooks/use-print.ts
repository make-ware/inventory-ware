'use client';

/**
 * Printing: the two jobs behind the print dialog and the sources a page
 * hands it.
 *
 * `usePrint` runs a job over the dialog's checked records — a summary page
 * per record, or one QR label per record — as one print window each. Every
 * entry point opens that window before its first `await`: the browser only
 * allows `window.open` inside the click, and a window opened after the
 * fetches is a blocked pop-up.
 *
 * A summary needs more than the record: an item's container label, a
 * container's contents, what analysis made of an image. `hydrateTargets`
 * fetches that just before rendering, so the sources below only have to
 * deliver records and the same fetch backs the dialog's preview.
 *
 * The source builders (`itemsQuerySource`, `containersQuerySource`, …) are
 * what the list pages pass the dialog. A query source walks every page of
 * the grid's own query — `buildItemSearchOptions` is the same function
 * `useItemsInfinite` spreads — so the printout holds exactly what the grid
 * would show across all its pages for the same URL state. Filters are still
 * built by the mutators, never here.
 */
import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ContainerMutator,
  ItemMutator,
  formatCategoryLabel,
  isUnrepresentableFilterValue,
} from '@project/shared';
import type { Container, Item } from '@project/shared';
import type { SearchFilters } from '@/components/inventory';
import pb from '@/lib/pocketbase-client';
import { qk } from '@/lib/query';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { buildItemSearchOptions, normaliseFilters } from '@/hooks/use-items';
import { loadByIds, walkPages } from '@/lib/print-sources';
import type { PrintSelection, PrintSource } from '@/lib/print-sources';
import {
  PRINT_DEFAULT_TITLES,
  PRINT_ENTITY_NOUNS,
  buildPreviewHtml,
  buildSummaryHtml,
  openExportWindow,
  recordTitle,
  writeExportWindow,
} from '@/services/print-summary';
import type {
  PrintEntity,
  PrintRecord,
  PrintTarget,
  SummaryScope,
} from '@/services/print-summary';
import {
  PRINT_POPUP_BLOCKED_MESSAGE,
  buildLabelsPrintHtml,
  fetchLabelSvg,
} from '@/services/label-print';
import type { LabelFormat } from '@/services/label-print';

/** Page size used to walk a full result set; PocketBase's own cap is 500. */
export const EXPORT_PAGE_SIZE = 100;

/** What an item needs expanded for its summary page and checklist row. */
export const PRINT_ITEM_EXPAND = 'ImageRef,ContainerRef';

export interface ItemQueryOptions {
  userId: string | null;
  q?: string;
  filters?: SearchFilters;
  sort?: string;
  /** Human-readable sort, for the summary header. */
  sortLabel?: string;
}

export interface ContainerQueryOptions {
  userId: string | null;
  q?: string;
  sort?: string;
  sortLabel?: string;
}

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

/**
 * The items grid's whole query. Resolves to no rows for a query the grid
 * itself withholds (no user yet, or a search PocketBase cannot parse).
 */
export function itemsQuerySource(
  itemMutator: ItemMutator,
  { userId, q = '', filters, sort, sortLabel }: ItemQueryOptions
): PrintSource {
  const options = buildItemSearchOptions({ filters, sort });
  return {
    entity: 'item',
    title: PRINT_DEFAULT_TITLES.item,
    scope: {
      query: q.trim() || undefined,
      filters: summaryFilters(filters),
      sortLabel,
    },
    load: () =>
      !userId || isUnrepresentableFilterValue(q)
        ? Promise.resolve([])
        : walkPages(
            (page) =>
              itemMutator.search(q, {
                ...options,
                page,
                perPage: EXPORT_PAGE_SIZE,
                expand: PRINT_ITEM_EXPAND,
              }),
            (item) => item.UserRef === userId
          ),
  };
}

/** The containers grid's whole query; same guards as `itemsQuerySource`. */
export function containersQuerySource(
  containerMutator: ContainerMutator,
  { userId, q = '', sort = '-created', sortLabel }: ContainerQueryOptions
): PrintSource {
  return {
    entity: 'container',
    title: PRINT_DEFAULT_TITLES.container,
    scope: { query: q.trim() || undefined, sortLabel },
    load: () =>
      !userId || isUnrepresentableFilterValue(q)
        ? Promise.resolve([])
        : walkPages(
            (page) =>
              containerMutator.search(q, {
                page,
                perPage: EXPORT_PAGE_SIZE,
                sort,
                expand: 'ImageRef',
              }),
            (container) => container.UserRef === userId
          ),
  };
}

/** The selected items, in selection order. */
export function itemsByIdSource(
  itemMutator: ItemMutator,
  ids: string[]
): PrintSource {
  return {
    entity: 'item',
    title: 'Selected items',
    load: () =>
      loadByIds((id) => itemMutator.getById(id, PRINT_ITEM_EXPAND), ids),
  };
}

/** The selected containers, in selection order. */
export function containersByIdSource(
  containerMutator: ContainerMutator,
  ids: string[]
): PrintSource {
  return {
    entity: 'container',
    title: 'Selected containers',
    load: () =>
      loadByIds((id) => containerMutator.getById(id, 'ImageRef'), ids),
  };
}

/**
 * "Print Items [3]", "Print Items", "Print [3]" or "Print" — the label of a
 * button that opens the print dialog, with the count it would offer.
 */
export function formatPrintLabel(entity?: string, count?: number): string {
  return ['Print', entity, count !== undefined && count > 0 && `[${count}]`]
    .filter(Boolean)
    .join(' ');
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

interface Mutators {
  itemMutator: ItemMutator;
  containerMutator: ContainerMutator;
}

/** The first record of a selection as a one-record selection of the same entity. */
export function firstOfSelection(
  selection: PrintSelection
): PrintSelection | null {
  if (selection.records.length === 0) return null;
  switch (selection.entity) {
    case 'item':
      return { entity: 'item', records: [selection.records[0]] };
    case 'container':
      return { entity: 'container', records: [selection.records[0]] };
    case 'image':
      return { entity: 'image', records: [selection.records[0]] };
  }
}

/**
 * Fetch what each summary page shows beyond the record itself.
 *
 * Items: the container label, one fetch per distinct container that did not
 * arrive expanded. Containers: their contents, every page of them. Images:
 * the items and containers analysis filed against them.
 */
async function hydrateTargets(
  selection: PrintSelection,
  { itemMutator, containerMutator }: Mutators
): Promise<PrintTarget[]> {
  switch (selection.entity) {
    case 'item': {
      const missing = new Set<string>();
      for (const item of selection.records) {
        if (item.ContainerRef && !item.expand?.ContainerRef) {
          missing.add(item.ContainerRef);
        }
      }
      const labels = new Map<string, string>();
      await Promise.all(
        Array.from(missing, async (id) => {
          const container = await containerMutator.getById(id);
          if (container) labels.set(id, container.containerLabel);
        })
      );
      return selection.records.map((record) => ({
        entity: 'item',
        record,
        containerLabel:
          record.expand?.ContainerRef?.containerLabel ??
          (record.ContainerRef ? labels.get(record.ContainerRef) : undefined),
      }));
    }
    case 'container':
      return Promise.all(
        selection.records.map(async (record) => ({
          entity: 'container' as const,
          record,
          items: await walkPages<Item>((page) =>
            itemMutator.getByContainer(record.id, {
              page,
              perPage: EXPORT_PAGE_SIZE,
              sort: 'itemLabel',
            })
          ),
        }))
      );
    case 'image':
      return Promise.all(
        selection.records.map(async (record) => {
          const [items, containers] = await Promise.all([
            itemMutator.search('', {
              filters: { image: record.id },
              sort: 'itemLabel',
            }),
            containerMutator.search('', {
              filters: { image: record.id },
              sort: 'containerLabel',
            }),
          ]);
          return {
            entity: 'image' as const,
            record,
            items: items.items as Item[],
            containers: containers.items as Container[],
          };
        })
      );
  }
}

export interface PrintSummaryOptions {
  /** Defaults to the record's own title for one record, else per entity. */
  title?: string;
  scope?: SummaryScope;
}

export interface PrintLabelsOptions {
  /** Called before each label request with its 1-based position. */
  onProgress?: (current: number, total: number) => void;
}

export function usePrint() {
  const mutators = useMemo<Mutators>(
    () => ({
      itemMutator: new ItemMutator(pb),
      containerMutator: new ContainerMutator(pb),
    }),
    []
  );
  const [isPrinting, setIsPrinting] = useState(false);

  /**
   * One summary page per record, as a single document. Resolves `true` when
   * the print went out or there was nothing to print, `false` when it failed
   * — the print dialog stays open on `false`.
   */
  const printSummary = useCallback(
    async (
      selection: PrintSelection,
      { title, scope }: PrintSummaryOptions = {}
    ): Promise<boolean> => {
      const nouns = PRINT_ENTITY_NOUNS[selection.entity];
      let win: Window;
      try {
        win = openExportWindow();
      } catch (error) {
        toast.error(errorText(error, 'Failed to export PDF'));
        return false;
      }

      setIsPrinting(true);
      try {
        if (selection.records.length === 0) {
          win.close();
          toast.info(`There are no ${nouns.plural} to print`);
          return true;
        }
        const targets = await hydrateTargets(selection, mutators);
        writeExportWindow(
          win,
          buildSummaryHtml(targets, {
            title:
              title ??
              (targets.length === 1
                ? recordTitle(targets[0].entity, targets[0].record)
                : PRINT_DEFAULT_TITLES[selection.entity]),
            generatedAt: new Date(),
            count: targets.length,
            countLabel: capitalise(nouns.plural),
            scope,
          })
        );
        return true;
      } catch (error) {
        win.close();
        toast.error(errorText(error, 'Failed to export PDF'));
        return false;
      } finally {
        setIsPrinting(false);
      }
    },
    [mutators]
  );

  /**
   * One label per id, fetched one after another and printed as a single job.
   * Stops at the first failed label: a partial sheet would be easy to
   * mistake for the full one. Same `true`/`false` contract as `printSummary`.
   */
  const printLabels = useCallback(
    async (
      entity: PrintEntity,
      ids: string[],
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

      setIsPrinting(true);
      try {
        if (ids.length === 0) {
          win.close();
          toast.info(
            `There are no ${PRINT_ENTITY_NOUNS[entity].plural} to print`
          );
          return true;
        }
        const svgs: string[] = [];
        for (const [index, targetId] of ids.entries()) {
          onProgress?.(index + 1, ids.length);
          svgs.push(
            await fetchLabelSvg({
              targetId,
              targetType: entity,
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
        setIsPrinting(false);
      }
    },
    []
  );

  return { isPrinting, printSummary, printLabels };
}

/**
 * The records a print dialog offers: its source, run once per `session`.
 *
 * The dialog bumps `session` each time it opens, so a reopened dialog reads
 * the page's current state rather than the last opening's; the query is
 * dropped as soon as the dialog unmounts.
 */
export function usePrintCandidates(source: PrintSource, session: number) {
  const query = useQuery({
    queryKey: qk.printCandidates(source.entity, session),
    queryFn: (): Promise<PrintRecord[]> => source.load(),
    staleTime: Infinity,
    gcTime: 0,
  });
  return {
    records: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export interface UsePrintPreviewOptions {
  /** The checked records; only the first is previewed. */
  selection: PrintSelection;
  what: 'summary' | 'labels';
  format: LabelFormat;
  enabled?: boolean;
}

/**
 * The print dialog's preview: the first checked record rendered as the
 * chosen output.
 *
 * The summary preview hydrates that one record the same way the print
 * would. The label SVG is a network render, so its input is debounced to
 * keep flicking through formats from firing a request per step.
 */
export function usePrintPreview({
  selection,
  what,
  format,
  enabled = true,
}: UsePrintPreviewOptions) {
  const mutators = useMemo<Mutators>(
    () => ({
      itemMutator: new ItemMutator(pb),
      containerMutator: new ContainerMutator(pb),
    }),
    []
  );
  const first = useMemo(() => firstOfSelection(selection), [selection]);
  const firstId = first?.records[0].id ?? null;
  const { entity } = selection;

  const wantsSummary = enabled && what === 'summary' && !!first;
  // The record's id is its identity in the key; the record object itself and
  // the mutators (module singletons) would only add noise to the hash.
  // eslint-disable-next-line @tanstack/query/exhaustive-deps
  const summaryQuery = useQuery({
    queryKey: qk.printPreview(entity, firstId ?? ''),
    queryFn: async () => {
      const [target] = await hydrateTargets(first as PrintSelection, mutators);
      return buildPreviewHtml(target);
    },
    enabled: wantsSummary,
  });

  const labelInput = useMemo(
    () => ({ targetId: firstId, format }),
    [firstId, format]
  );
  const debouncedLabel = useDebouncedValue(labelInput);
  const isDebouncing = debouncedLabel !== labelInput;
  const wantsLabel = enabled && what === 'labels' && !!first;

  const labelQuery = useQuery({
    queryKey: qk.labelPreview(
      entity,
      debouncedLabel.targetId ?? '',
      debouncedLabel.format
    ),
    queryFn: ({ signal }) =>
      fetchLabelSvg({
        targetId: debouncedLabel.targetId as string,
        targetType: entity,
        format: debouncedLabel.format,
        token: pb.authStore.token,
        signal,
      }),
    enabled: wantsLabel && !!debouncedLabel.targetId && !isDebouncing,
  });

  return {
    previewHtml: wantsSummary ? (summaryQuery.data ?? null) : null,
    svg: wantsLabel && !isDebouncing ? (labelQuery.data ?? null) : null,
    isLoading:
      (wantsSummary && summaryQuery.isLoading) ||
      (wantsLabel && (isDebouncing || labelQuery.isLoading)),
    isError:
      (wantsSummary && summaryQuery.isError) ||
      (wantsLabel && labelQuery.isError),
  };
}

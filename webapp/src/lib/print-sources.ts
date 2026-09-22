'use client';

/**
 * What a page hands the print dialog.
 *
 * A `PrintSource` names the entity and a `load()` that resolves the records
 * the dialog should offer. The dialog runs it once per opening and shows the
 * result as a checklist, so it never knows — or cares — whether the records
 * are a selection, the grid's filtered set or the one record a detail page is
 * showing. That is the whole design: every Print button on every page opens
 * the same dialog with a different `load`.
 *
 * `title` and `scope` head the summary document when one is printed; a
 * source built from a list query passes both so the printout says what it
 * was filtered by, while a selection or a single record passes neither.
 */
import type { ListResult } from 'pocketbase';
import { formatCategoryLabel } from '@project/shared';
import type { Container, Image, Item } from '@project/shared';
import { getExpandedImageUrl, getImageFileUrl } from '@/lib/image-utils';
import { recordTitle } from '@/services/print-summary';
import type { PrintEntity, SummaryScope } from '@/services/print-summary';

interface PrintSourceBase {
  /** Summary document title; defaults per entity, or to the record's own. */
  title?: string;
  scope?: SummaryScope;
}

export type PrintSource =
  | (PrintSourceBase & { entity: 'item'; load: () => Promise<Item[]> })
  | (PrintSourceBase & {
      entity: 'container';
      load: () => Promise<Container[]>;
    })
  | (PrintSourceBase & { entity: 'image'; load: () => Promise<Image[]> });

/** The checked records of one entity, as the dialog hands them to a job. */
export type PrintSelection =
  | { entity: 'item'; records: Item[] }
  | { entity: 'container'; records: Container[] }
  | { entity: 'image'; records: Image[] };

/**
 * Every page of a list query, deduped, in server order.
 *
 * A concurrent insert can push a row across a page boundary, so a record seen
 * twice keeps its first (sort-order) position only. `keep` drops rows the
 * caller does not want in the print — the grid's own `UserRef` check, say.
 */
export async function walkPages<T extends { id: string }>(
  fetchPage: (page: number) => Promise<ListResult<T>>,
  keep: (record: T) => boolean = () => true
): Promise<T[]> {
  const byId = new Map<string, T>();
  let page = 1;
  let totalPages = 1;
  do {
    const result = await fetchPage(page);
    totalPages = result.totalPages;
    for (const record of result.items) {
      if (keep(record) && !byId.has(record.id)) {
        byId.set(record.id, record);
      }
    }
    page += 1;
  } while (page <= totalPages);
  return Array.from(byId.values());
}

/** The records behind `ids`, in that order, minus any that are gone. */
export async function loadByIds<T>(
  getById: (id: string) => Promise<T | null>,
  ids: string[]
): Promise<T[]> {
  // `Promise.all` keeps input order, so the print follows the selection.
  const records: (T | null)[] = await Promise.all(ids.map((id) => getById(id)));
  return records.filter((record): record is T => record !== null);
}

export interface PrintRow {
  title: string;
  detail?: string;
  imageUrl?: string;
}

/** How one record reads in the dialog's checklist. */
export function describePrintRecord(
  entity: PrintEntity,
  record: Item | Container | Image
): PrintRow {
  switch (entity) {
    case 'item': {
      const item = record as Item;
      return {
        title: recordTitle(entity, item),
        detail: [
          formatCategoryLabel(item.itemType),
          item.expand?.ContainerRef?.containerLabel,
        ]
          .filter(Boolean)
          .join(' · '),
        imageUrl: getExpandedImageUrl(item),
      };
    }
    case 'container': {
      const container = record as Container;
      return {
        title: recordTitle(entity, container),
        detail: container.containerNotes?.split('\n')[0] || undefined,
        imageUrl: getExpandedImageUrl(container),
      };
    }
    case 'image': {
      const image = record as Image;
      return {
        title: recordTitle(entity, image),
        detail: `${image.imageType ?? 'unprocessed'} · ${image.analysisStatus ?? 'pending'}`,
        imageUrl: getImageFileUrl(image),
      };
    }
  }
}

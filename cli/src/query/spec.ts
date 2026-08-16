import {
  ANALYSIS_STATUSES,
  CONTAINER_SEARCH_FIELDS,
  IMAGE_TYPES,
  ITEM_SEARCH_FIELDS,
  slugify,
} from '@project/shared';

/**
 * One filter flag on a list command.
 *
 * `key` is the camelCase property Commander produces; `filterKey` is the
 * property name on the mutator's `*SearchFilters`. They differ where the flag
 * reads better than the field (`--container` -> `container`).
 */
export interface FilterFlag {
  flags: string;
  description: string;
  key: string;
  filterKey: string;
  choices?: readonly string[];
  /** Applied before the value reaches the mutator. */
  normalize?: (value: string) => string;
}

/**
 * Everything a list command needs to know about one entity.
 *
 * Keeping this as plain data (no Commander import) means the allowlists can be
 * reused for validation, help text and error hints from one place.
 */
export interface EntitySpec {
  noun: string;
  searchFields: readonly string[];
  sortFields: readonly string[];
  expandFields: readonly string[];
  selectableFields: readonly string[];
  headings: Readonly<Record<string, string>>;
  defaultColumns: readonly string[];
  defaultSort: string;
  filters: readonly FilterFlag[];
}

/** Sort keys every collection supports. `@random` is a PocketBase special. */
const BASE_SORT_FIELDS = ['id', 'created', 'updated', '@random'] as const;

const ITEM_HEADINGS = {
  id: 'ID',
  itemLabel: 'LABEL',
  itemName: 'NAME',
  itemNotes: 'NOTES',
  itemType: 'TYPE',
  itemManufacturer: 'MANUFACTURER',
  categoryFunctional: 'FUNCTIONAL',
  categorySpecific: 'SPECIFIC',
  itemAttributes: 'ATTRIBUTES',
  ContainerRef: 'CONTAINER',
  ImageRef: 'IMAGE',
  created: 'CREATED',
  updated: 'UPDATED',
} as const;

export const ITEM_SPEC: EntitySpec = {
  noun: 'item',
  searchFields: ITEM_SEARCH_FIELDS,
  sortFields: [
    ...BASE_SORT_FIELDS,
    'itemLabel',
    'itemName',
    'itemType',
    'itemManufacturer',
    'categoryFunctional',
    'categorySpecific',
  ],
  expandFields: ['ContainerRef', 'ImageRef', 'UserRef'],
  selectableFields: Object.keys(ITEM_HEADINGS),
  headings: ITEM_HEADINGS,
  defaultColumns: [
    'id',
    'itemLabel',
    'itemType',
    'categoryFunctional',
    'categorySpecific',
    'ContainerRef',
  ],
  defaultSort: '-created',
  filters: [
    {
      flags: '-c, --container <id>',
      description: 'only items in this container',
      key: 'container',
      filterKey: 'container',
    },
    {
      flags: '-i, --image <id>',
      description: 'only items linked to this image',
      key: 'image',
      filterKey: 'image',
    },
    // The schema slugifies these three on write, so an un-slugified value
    // would silently match nothing.
    {
      flags: '--functional <category>',
      description: 'filter by functional category',
      key: 'functional',
      filterKey: 'categoryFunctional',
      normalize: slugify,
    },
    {
      flags: '--specific <category>',
      description: 'filter by specific category',
      key: 'specific',
      filterKey: 'categorySpecific',
      normalize: slugify,
    },
    {
      flags: '-t, --type <type>',
      description: 'filter by item type',
      key: 'type',
      filterKey: 'itemType',
      normalize: slugify,
    },
  ],
};

const CONTAINER_HEADINGS = {
  id: 'ID',
  containerLabel: 'LABEL',
  containerNotes: 'NOTES',
  ImageRef: 'IMAGE',
  created: 'CREATED',
  updated: 'UPDATED',
} as const;

export const CONTAINER_SPEC: EntitySpec = {
  noun: 'container',
  searchFields: CONTAINER_SEARCH_FIELDS,
  sortFields: [...BASE_SORT_FIELDS, 'containerLabel'],
  expandFields: ['ImageRef', 'UserRef'],
  selectableFields: Object.keys(CONTAINER_HEADINGS),
  headings: CONTAINER_HEADINGS,
  defaultColumns: ['id', 'containerLabel', 'containerNotes', 'created'],
  defaultSort: '-created',
  filters: [
    {
      flags: '-i, --image <id>',
      description: 'only containers linked to this image',
      key: 'image',
      filterKey: 'image',
    },
  ],
};

const IMAGE_HEADINGS = {
  id: 'ID',
  file: 'FILE',
  fileHash: 'HASH',
  imageType: 'TYPE',
  analysisStatus: 'STATUS',
  created: 'CREATED',
  updated: 'UPDATED',
} as const;

export const IMAGE_SPEC: EntitySpec = {
  noun: 'image',
  // Images have no free-text field worth matching; -q is omitted for them.
  searchFields: [],
  sortFields: [...BASE_SORT_FIELDS, 'imageType', 'analysisStatus'],
  expandFields: ['UserRef'],
  selectableFields: Object.keys(IMAGE_HEADINGS),
  headings: IMAGE_HEADINGS,
  defaultColumns: ['id', 'file', 'imageType', 'analysisStatus', 'created'],
  defaultSort: '-created',
  filters: [
    {
      flags: '--status <status>',
      description: 'filter by analysis status',
      key: 'status',
      filterKey: 'analysisStatus',
      choices: ANALYSIS_STATUSES,
    },
    {
      flags: '-t, --type <type>',
      description: 'filter by image type',
      key: 'type',
      filterKey: 'imageType',
      choices: IMAGE_TYPES,
    },
  ],
};

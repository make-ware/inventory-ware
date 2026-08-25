/**
 * Query key factory.
 *
 * Every key is a plain, serialisable, `as const` array so TanStack Query can
 * hash it structurally and so prefixes work for invalidation: invalidating
 * `['items', userId]` also invalidates `['items', userId, {...}]` and
 * `['items', 'infinite', ...]` is reachable from the `['items']` prefix.
 *
 * List keys are scoped by `userId` because PocketBase list rules are per-user —
 * without the scope, logging in as someone else would read the previous user's
 * cached rows. Callers pass `enabled: false` (or skip the query) when there is
 * no authenticated user rather than inventing a placeholder id.
 */
import type { SearchFilters } from '@/components/inventory';

interface ItemsListOptions {
  q: string;
  filters: SearchFilters;
  sort: string;
}

interface ContainersListOptions {
  q: string;
  sort: string;
}

export const qk = {
  /** Prefix covering every items list key; invalidate this after a write. */
  itemsPrefix: () => ['items'] as const,
  items: (userId: string, options: ItemsListOptions) =>
    ['items', userId, options] as const,
  /**
   * Prefix covering one user's infinite items keys, whatever they are filtered
   * or sorted by. This is what the realtime gap-heal invalidates: narrow enough
   * to leave the detail/picker queries alone, broad enough to cover every
   * search the list may currently be showing.
   */
  itemsInfinitePrefix: (userId: string) =>
    ['items', 'infinite', userId] as const,
  itemsInfinite: (userId: string, options: ItemsListOptions) =>
    ['items', 'infinite', userId, options] as const,
  /** Every item, unpaged — the pool the container "add item" picker draws on. */
  itemsAll: (userId: string) => ['items', 'all', userId] as const,
  itemById: (id: string) => ['item', id] as const,
  itemsByContainer: (containerId: string) =>
    ['items', 'byContainer', containerId] as const,
  /** The items analysis filed against one image; see the image detail page. */
  itemsByImage: (imageId: string) => ['items', 'byImage', imageId] as const,

  /** Prefix covering every containers list key; invalidate this after a write. */
  containersPrefix: () => ['containers'] as const,
  containers: (userId: string, options: ContainersListOptions) =>
    ['containers', userId, options] as const,
  /** Prefix covering one user's infinite containers keys; see itemsInfinitePrefix. */
  containersInfinitePrefix: (userId: string) =>
    ['containers', 'infinite', userId] as const,
  containersInfinite: (userId: string, options: ContainersListOptions) =>
    ['containers', 'infinite', userId, options] as const,
  containerById: (id: string) => ['container', id] as const,
  /** The containers analysis filed against one image. */
  containersByImage: (imageId: string) =>
    ['containers', 'byImage', imageId] as const,

  /** Prefix covering every images key; invalidate this after an upload. */
  imagesPrefix: () => ['images'] as const,
  images: (userId: string) => ['images', userId] as const,
  /**
   * One image, deliberately *under* the images prefix rather than beside it
   * like `itemById`/`containerById`.
   *
   * Every write path that touches an image already invalidates
   * `imagesPrefix()` (the upload queue, the grid's delete, a re-analysis), and
   * there is no per-image equivalent of `invalidateItemCaches(qc, ids)` to
   * carry the id along — so keeping the detail under the prefix is what makes
   * an open detail page follow those invalidations.
   */
  imageById: (id: string) => ['images', 'byId', id] as const,

  /** Prefix covering the category library; invalidate it after an item write. */
  categoriesPrefix: () => ['categories'] as const,
  categories: (userId: string) => ['categories', userId] as const,
} as const;

export type QueryKeys = {
  [K in keyof typeof qk]: ReturnType<(typeof qk)[K]>;
};

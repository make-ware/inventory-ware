import type { ListResult } from 'pocketbase';
import { type Item, type ItemInput, ItemInputSchema } from '../index';
import type { TypedPocketBase } from '../types';
import { allOf, anyOf, eq } from '../utils/filter';
import { BaseMutator, type ListQuery, TypedRecordService } from './base';

export interface ItemSearchFilters {
  categoryFunctional?: string;
  categorySpecific?: string;
  itemType?: string;
  container?: string;
  image?: string;
}

/** A paged query plus the item-specific filters. */
export type ItemListQuery = ListQuery & { filters?: ItemSearchFilters };

/** Fields `search()` matches a free-text query against. */
export const ITEM_SEARCH_FIELDS = [
  'itemLabel',
  'itemName',
  'itemNotes',
  'itemManufacturer',
] as const;

export interface CategoryLibrary {
  functional: string[];
  specific: string[];
  itemType: string[];
}

export class ItemMutator extends BaseMutator<Item, ItemInput> {
  constructor(pb: TypedPocketBase) {
    super(pb);
  }

  protected getCollection(): TypedRecordService<Item, ItemInput> {
    return this.pb.collection('Items') as unknown as TypedRecordService<
      Item,
      ItemInput
    >;
  }

  protected async validateInput(input: ItemInput): Promise<ItemInput> {
    // Validate the input using the schema
    return ItemInputSchema.parse(input);
  }

  // Note: ItemImages mapping is now handled by PocketBase hooks in pb_hooks/main.pb.js

  /**
   * Update an item
   * @param id The item ID
   * @param input Partial item input (UserRef is omitted as it cannot be changed)
   * @returns Updated Item record
   */
  async update(
    id: string,
    input: Partial<Omit<ItemInput, 'UserRef'>>
  ): Promise<Item> {
    try {
      // UserRef should never be updated, so we ensure it's not included
      return await super.update(id, input as Partial<Item>);
    } catch (error) {
      return this.errorWrapper(error);
    }
  }

  /**
   * Build the filter expression `search()` uses.
   *
   * Exported separately so callers can echo the filter when debugging.
   */
  buildSearchFilter(
    query: string,
    filters?: ItemSearchFilters
  ): string | undefined {
    const parts: string[] = [];

    if (query && query.trim()) {
      parts.push(anyOf(ITEM_SEARCH_FIELDS, query));
    }
    if (filters?.categoryFunctional) {
      parts.push(eq('categoryFunctional', filters.categoryFunctional));
    }
    if (filters?.categorySpecific) {
      parts.push(eq('categorySpecific', filters.categorySpecific));
    }
    if (filters?.itemType) {
      parts.push(eq('itemType', filters.itemType));
    }
    if (filters?.container) {
      parts.push(eq('ContainerRef', filters.container));
    }
    if (filters?.image) {
      parts.push(eq('ImageRef', filters.image));
    }

    return allOf(parts);
  }

  /**
   * Search for items by free-text query and filters.
   *
   * @param query Text matched against label, name, notes and manufacturer
   * @param options Filters plus the standard page/perPage/sort/expand
   * @returns A paged result, so callers can see the true total
   */
  async search(
    query: string,
    options: ItemListQuery = {}
  ): Promise<ListResult<Item>> {
    try {
      const { filters, ...list } = options;
      return await this.getList({
        ...list,
        filter: this.buildSearchFilter(query, filters),
      });
    } catch (error) {
      return this.errorWrapper(error);
    }
  }

  /**
   * Get the items in a specific container.
   *
   * @param containerId The container ID
   * @param options The standard page/perPage/sort/expand, plus extra filters
   * @returns A paged result
   */
  async getByContainer(
    containerId: string,
    options: ItemListQuery = {}
  ): Promise<ListResult<Item>> {
    const { filters, ...list } = options;
    return await this.search('', {
      ...list,
      filters: { ...filters, container: containerId },
    });
  }

  /**
   * Get distinct category values from all items
   * @returns Object containing arrays of unique category values
   */
  async getDistinctCategories(
    options: { perPage?: number } = {}
  ): Promise<CategoryLibrary> {
    try {
      // Fetch all items (we'll use a large page size to get everything)
      const result = await this.getList({ perPage: options.perPage ?? 5000 });
      const items = result.items;

      // Extract unique values for each category tier
      const functional = [
        ...new Set(
          items
            .map((i) => i.categoryFunctional)
            .filter((c): c is string => Boolean(c))
        ),
      ];

      const specific = [
        ...new Set(
          items
            .map((i) => i.categorySpecific)
            .filter((c): c is string => Boolean(c))
        ),
      ];

      const itemType = [
        ...new Set(
          items.map((i) => i.itemType).filter((c): c is string => Boolean(c))
        ),
      ];

      return {
        functional: functional.sort(),
        specific: specific.sort(),
        itemType: itemType.sort(),
      };
    } catch (error) {
      return this.errorWrapper(error);
    }
  }
}

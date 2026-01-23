import { RecordService } from 'pocketbase';
import { type Item, type ItemInput, ItemInputSchema } from '../index';
import type { TypedPocketBase } from '../types';
import { BaseMutator } from './base';

export interface ItemSearchFilters {
  categoryFunctional?: string;
  categorySpecific?: string;
  itemType?: string;
  container?: string;
}

export interface CategoryLibrary {
  functional: string[];
  specific: string[];
  itemType: string[];
}

export class ItemMutator extends BaseMutator<Item, ItemInput> {
  constructor(pb: TypedPocketBase) {
    super(pb);
  }

  protected getCollection(): RecordService<Item> {
    return this.pb.collection('Items');
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
   * Search for items by query and filters
   * @param query Search query to match against label, notes, and manufacturer
   * @param filters Optional category and container filters
   * @param expand Optional relation fields to expand (e.g., 'primaryImage')
   * @returns Array of matching Item records
   */
  async search(
    query: string,
    filters?: ItemSearchFilters,
    expand?: string | string[]
  ): Promise<Item[]> {
    try {
      const filterParts: string[] = [];

      // Add text search filter
      if (query && query.trim()) {
        const escapedQuery = query.replace(/"/g, '\\"');
        filterParts.push(
          `(itemLabel~"${escapedQuery}" || itemName~"${escapedQuery}" || itemNotes~"${escapedQuery}" || itemManufacturer~"${escapedQuery}")`
        );
      }

      // Add category filters
      if (filters?.categoryFunctional) {
        const escaped = filters.categoryFunctional.replace(/"/g, '\\"');
        filterParts.push(`categoryFunctional="${escaped}"`);
      }
      if (filters?.categorySpecific) {
        const escaped = filters.categorySpecific.replace(/"/g, '\\"');
        filterParts.push(`categorySpecific="${escaped}"`);
      }
      if (filters?.itemType) {
        const escaped = filters.itemType.replace(/"/g, '\\"');
        filterParts.push(`itemType="${escaped}"`);
      }
      if (filters?.container) {
        const escaped = filters.container.replace(/"/g, '\\"');
        filterParts.push(`container="${escaped}"`);
      }

      const filter =
        filterParts.length > 0 ? filterParts.join(' && ') : undefined;

      const result = await this.getList(1, 500, filter, undefined, expand);
      return result.items;
    } catch (error) {
      return this.errorWrapper(error);
    }
  }

  /**
   * Get all items in a specific container
   * @param containerId The container ID
   * @param expand Optional expand parameter for related records
   * @returns Array of Item records
   */
  async getByContainer(
    containerId: string,
    expand?: string | string[]
  ): Promise<Item[]> {
    try {
      const escapedId = containerId.replace(/"/g, '\\"');
      const result = await this.getList(
        1,
        500,
        `container="${escapedId}"`,
        undefined,
        expand
      );
      return result.items;
    } catch (error) {
      return this.errorWrapper(error);
    }
  }

  /**
   * Get distinct category values from all items
   * @returns Object containing arrays of unique category values
   */
  async getDistinctCategories(): Promise<CategoryLibrary> {
    try {
      // Fetch all items (we'll use a large page size to get everything)
      const result = await this.getList(1, 5000);
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

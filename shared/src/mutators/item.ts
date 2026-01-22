import { RecordService } from 'pocketbase';
import { type Item, type ItemInput, ItemInputSchema } from '../index';
import type { TypedPocketBase } from '../types';
import { BaseMutator } from './base';

export interface ItemSearchFilters {
  category_functional?: string;
  category_specific?: string;
  item_type?: string;
  container?: string;
}

export interface CategoryLibrary {
  functional: string[];
  specific: string[];
  item_type: string[];
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

  /**
   * Create a new item and record the initial image mapping
   */
  async create(input: ItemInput): Promise<Item> {
    try {
      // Set the user to the currently authenticated user
      const userId = this.pb.authStore.record?.id;
      const inputWithUser = { ...input, User: userId };
      const record = await super.create(inputWithUser);

      // Record the initial mapping if primary_image is provided
      if (record && input.primary_image) {
        await this.pb.collection('ItemImageMappings').create({
          item: record.id,
          image: input.primary_image,
          bounding_box: input.primary_image_bbox,
        });
      }

      return record;
    } catch (error) {
      return this.errorWrapper(error);
    }
  }

  /**
   * Update an item and record the old image if changed
   */
  async update(id: string, input: Partial<ItemInput>): Promise<Item> {
    try {
      // Get the current record to check if primary_image is changing
      // Using getById from BaseMutator which is equivalent to get(id)
      const current = await this.getById(id);

      // If primary_image is being updated and it's different from current
      if (
        current &&
        input.primary_image &&
        current.primary_image &&
        input.primary_image !== current.primary_image
      ) {
        // Record the historical mapping
        await this.pb.collection('ItemImageMappings').create({
          item: id,
          image: current.primary_image,
          bounding_box: current.primary_image_bbox,
        });
      }

      return await super.update(id, input);
    } catch (error) {
      return this.errorWrapper(error);
    }
  }

  /**
   * Search for items by query and filters
   * @param query Search query to match against label, notes, and manufacturer
   * @param filters Optional category and container filters
   * @returns Array of matching Item records
   */
  async search(query: string, filters?: ItemSearchFilters): Promise<Item[]> {
    try {
      const filterParts: string[] = [];

      // Add text search filter
      if (query && query.trim()) {
        const escapedQuery = query.replace(/"/g, '\\"');
        filterParts.push(
          `(item_label~"${escapedQuery}" || item_notes~"${escapedQuery}" || item_manufacturer~"${escapedQuery}")`
        );
      }

      // Add category filters
      if (filters?.category_functional) {
        const escaped = filters.category_functional.replace(/"/g, '\\"');
        filterParts.push(`category_functional="${escaped}"`);
      }
      if (filters?.category_specific) {
        const escaped = filters.category_specific.replace(/"/g, '\\"');
        filterParts.push(`category_specific="${escaped}"`);
      }
      if (filters?.item_type) {
        const escaped = filters.item_type.replace(/"/g, '\\"');
        filterParts.push(`item_type="${escaped}"`);
      }
      if (filters?.container) {
        const escaped = filters.container.replace(/"/g, '\\"');
        filterParts.push(`container="${escaped}"`);
      }

      const filter =
        filterParts.length > 0 ? filterParts.join(' && ') : undefined;

      const result = await this.getList(1, 500, filter);
      return result.items;
    } catch (error) {
      return this.errorWrapper(error);
    }
  }

  /**
   * Get all items in a specific container
   * @param containerId The container ID
   * @returns Array of Item records
   */
  async getByContainer(containerId: string): Promise<Item[]> {
    try {
      const escapedId = containerId.replace(/"/g, '\\"');
      const result = await this.getList(1, 500, `container="${escapedId}"`);
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
            .map((i) => i.category_functional)
            .filter((c): c is string => Boolean(c))
        ),
      ];

      const specific = [
        ...new Set(
          items
            .map((i) => i.category_specific)
            .filter((c): c is string => Boolean(c))
        ),
      ];

      const item_type = [
        ...new Set(
          items.map((i) => i.item_type).filter((c): c is string => Boolean(c))
        ),
      ];

      return {
        functional: functional.sort(),
        specific: specific.sort(),
        item_type: item_type.sort(),
      };
    } catch (error) {
      return this.errorWrapper(error);
    }
  }
}

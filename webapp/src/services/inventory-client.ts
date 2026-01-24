'use client';

import { type TypedPocketBase, ItemMutator } from '@project/shared';
import type { CategoryLibrary } from './ai-analysis';
import type { InventoryService, ProcessImageResult } from './inventory-types';
import type { AnalysisResult } from '@project/shared';

/**
 * Create an Inventory Service instance (Client safe version)
 * Does not include server-side image processing logic using sharp
 * @param pb - TypedPocketBase client instance
 * @returns InventoryService instance
 */
export function createInventoryService(pb: TypedPocketBase): InventoryService {
  const itemMutator = new ItemMutator(pb);

  return {
    async processImageUpload(
      _file: File,
      _userId: string
    ): Promise<ProcessImageResult> {
      throw new Error('processImageUpload is not available on the client side');
    },

    async reanalyzeImage(_imageId: string): Promise<AnalysisResult> {
      throw new Error('reanalyzeImage is not available on the client side');
    },

    async processExistingImage(
      _imageId: string,
      _userId: string
    ): Promise<ProcessImageResult> {
      throw new Error(
        'processExistingImage is not available on the client side'
      );
    },

    async getCategoryLibrary(): Promise<CategoryLibrary> {
      const all = await itemMutator.getDistinctCategories();

      // Default values to provide context if the database is empty
      const defaults: CategoryLibrary = {
        functional: [
          'Tools',
          'Electronics',
          'Materials',
          'Technology',
          'Office',
          'Furniture',
          'Kitchen',
          'Outdoor',
          'Automotive',
          'Hardware',
        ],
        specific: [
          'Power Tools',
          'Hand Tools',
          'Computer Components',
          'Fasteners',
          'Sensors',
          'Lab Equipment',
          'Stationary',
          'Kitchenware',
          'Gardening',
          'Safety Gear',
        ],
        itemType: [
          'Drill',
          'Screwdriver',
          'CPU Heatsink',
          'Screws',
          'Proximity Sensor',
          'Oscilloscope',
          'Pen',
          'Plate',
          'Shovel',
          'Safety Glasses',
        ],
      };

      return {
        functional:
          all.functional.length > 0
            ? all.functional.slice(0, 10)
            : defaults.functional,
        specific:
          all.specific.length > 0
            ? all.specific.slice(0, 10)
            : defaults.specific,
        itemType:
          all.itemType.length > 0
            ? all.itemType.slice(0, 10)
            : defaults.itemType,
      };
    },

    async searchCategories(
      query: string,
      type: 'functional' | 'specific' | 'itemType'
    ): Promise<string[]> {
      const all = await itemMutator.getDistinctCategories();
      const categories = all[type] || [];
      const lowerQuery = query.toLowerCase();
      return categories
        .filter((cat) => cat.toLowerCase().includes(lowerQuery))
        .slice(0, 10); // Limit to 10 results
    },
  };
}

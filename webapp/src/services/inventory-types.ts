import type {
  Item,
  Container,
  Image,
  AnalysisResult,
} from '@project/shared';

/**
 * Result of processing an image upload
 */
export interface ProcessImageResult {
  image: Image;
  result: AnalysisResult;
  items: Item[];
  container?: Container;
}

/**
 * Inventory Service for managing inventory operations
 */
export interface InventoryService {
  /**
   * Process an uploaded image: upload → analyze → create entities
   * @param file - The image file to upload
   * @param userId - ID of the authenticated user
   * @returns Processing result with created entities
   */
  processImageUpload(file: File, userId: string): Promise<ProcessImageResult>;

  /**
   * Re-analyze an existing image
   * @param imageId - ID of the image to re-analyze
   * @returns Analysis result with updated metadata
   */
  reanalyzeImage(imageId: string): Promise<AnalysisResult>;

  /**
   * Process an existing image: analyze → create entities
   * This is useful for re-queuing images that failed or were uploaded without processing
   * @param imageId - ID of the existing image to process
   * @param userId - ID of the authenticated user
   * @returns Processing result with created entities
   */
  processExistingImage(
    imageId: string,
    userId: string
  ): Promise<ProcessImageResult>;

  /**
   * Get the category library (distinct category values from all items)
   * @returns Category library with functional, specific, and itemType arrays
   */
  getCategoryLibrary(): Promise<CategoryLibrary>;

  /**
   * Search for existing categories to avoid duplicates
   * @param query - Search query
   * @param type - Category type
   * @returns List of matching category values
   */
  searchCategories(
    query: string,
    type: 'functional' | 'specific' | 'itemType'
  ): Promise<string[]>;
}

export type { CategoryLibrary } from './ai-analysis';

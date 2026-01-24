import type { Item, Container, Image, AnalysisResult } from '@project/shared';
import type { CategoryLibrary } from './ai-analysis';

/**
 * Result of processing an image upload (server-side only)
 */
export interface ProcessImageResult {
  image: Image;
  result: AnalysisResult;
  items: Item[];
  container?: Container;
}

/**
 * Client-safe inventory service (category library and search only).
 * Does not include image processing; use InventoryServerService on the server.
 */
export interface InventoryClientService {
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

/**
 * Server-only inventory service with image processing (sharp, AI analysis).
 * Use createInventoryServerService; not available on the client.
 */
export interface InventoryServerService extends InventoryClientService {
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
   * Useful for re-queuing images that failed or were uploaded without processing
   * @param imageId - ID of the existing image to process
   * @param userId - ID of the authenticated user
   * @returns Processing result with created entities
   */
  processExistingImage(
    imageId: string,
    userId: string
  ): Promise<ProcessImageResult>;
}

export type { CategoryLibrary };

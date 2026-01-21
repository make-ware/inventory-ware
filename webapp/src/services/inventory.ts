import {
  type TypedPocketBase,
  ImageMutator,
  ItemMutator,
  ContainerMutator,
} from '@project/shared';
import { createAIAnalysisService, type CategoryLibrary } from './ai-analysis';
import type {
  Item,
  Container,
  Image,
  AnalysisResult,
  ItemInput,
} from '@project/shared';

/**
 * Download an image from PocketBase and convert it to base64 data URL
 * This is needed because OpenAI cannot access localhost URLs
 */
async function downloadImageAsBase64(
  pb: TypedPocketBase,
  image: Image
): Promise<string> {
  const imageUrl = pb.files.getURL(image, image.file);

  // Download the image
  const response = await fetch(imageUrl, {
    headers: {
      // Include auth token if available
      ...(pb.authStore.token
        ? { Authorization: `Bearer ${pb.authStore.token} ` }
        : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText} `);
  }

  // Get the image as blob
  const blob = await response.blob();

  // Convert blob to base64
  const arrayBuffer = await blob.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');

  // Determine MIME type from blob or default to jpeg
  const mimeType = blob.type || 'image/jpeg';

  // Return as data URL
  return `data:${mimeType}; base64, ${base64} `;
}

/**
 * Convert a File to base64 data URL
 */
async function fileToBase64(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  const mimeType = file.type || 'image/jpeg';
  return `data:${mimeType}; base64, ${base64} `;
}

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
   * @returns Processing result with created entities
   */
  processImageUpload(file: File): Promise<ProcessImageResult>;

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
   * @returns Processing result with created entities
   */
  processExistingImage(imageId: string): Promise<ProcessImageResult>;

  /**
   * Get the category library (distinct category values from all items)
   * @returns Category library with functional, specific, and item_type arrays
   */
  getCategoryLibrary(): Promise<CategoryLibrary>;
}

/**
 * Create an Inventory Service instance
 * @param pb - TypedPocketBase client instance
 * @returns InventoryService instance
 */
export function createInventoryService(pb: TypedPocketBase): InventoryService {
  const imageMutator = new ImageMutator(pb);
  const itemMutator = new ItemMutator(pb);
  const containerMutator = new ContainerMutator(pb);

  // Lazy initialization of AI service - only create when needed
  // This prevents errors in client components where env vars aren't available
  let aiService: ReturnType<typeof createAIAnalysisService> | null = null;
  const getAIService = () => {
    if (!aiService) {
      aiService = createAIAnalysisService();
    }
    return aiService;
  };

  return {
    async processImageUpload(file: File): Promise<ProcessImageResult> {
      // 1. Upload image to PocketBase
      const image = await imageMutator.uploadImage(file);

      // Convert file to base64 for AI analysis (OpenAI cannot access localhost URLs)
      const imageData = await fileToBase64(file);

      try {
        // 2. Get existing categories for AI context
        const categories = await this.getCategoryLibrary();

        // 3. Update status to processing
        await imageMutator.updateAnalysisStatus(image.id, 'processing');

        // 4. Analyze with AI
        const result = await getAIService().analyzeImage(imageData, categories);

        // 5. Create records based on result type
        const items: Item[] = [];
        let container: Container | undefined;

        if (result.type === 'item') {
          // Create single item
          const itemData: ItemInput = {
            item_label: result.data.item.item_label,
            item_notes: result.data.item.item_notes,
            category_functional: result.data.item.category_functional,
            category_specific: result.data.item.category_specific,
            item_type: result.data.item.item_type,
            item_manufacturer: result.data.item.item_manufacturer,
            item_attributes: result.data.item.item_attributes,
            primary_image: image.id,
          };

          const item = await itemMutator.create(itemData);
          items.push(item);

          // Update image with item reference and mark as completed
          await imageMutator.update(image.id, {
            image_type: 'item',
            analysis_status: 'completed',
            item: item.id,
          });
        } else {
          // Create container
          container = await containerMutator.create({
            container_label: result.data.container.container_label,
            container_notes: result.data.container.container_notes,
            primary_image: image.id,
          });

          // Create items for each item in the container
          for (const itemMetadata of result.data.container.container_items) {
            const itemData: ItemInput = {
              item_label: itemMetadata.item_label,
              item_notes: itemMetadata.item_notes,
              category_functional: itemMetadata.category_functional,
              category_specific: itemMetadata.category_specific,
              item_type: itemMetadata.item_type,
              item_manufacturer: itemMetadata.item_manufacturer,
              item_attributes: itemMetadata.item_attributes,
              container: container.id,
            };

            const item = await itemMutator.create(itemData);
            items.push(item);
          }

          // Update image with container reference and mark as completed
          await imageMutator.update(image.id, {
            image_type: 'container',
            analysis_status: 'completed',
            container: container.id,
          });
        }

        return { image, result, items, container };
      } catch (error) {
        // Mark image as failed if analysis or creation fails
        await imageMutator.updateAnalysisStatus(image.id, 'failed');
        throw error;
      }
    },

    async reanalyzeImage(imageId: string): Promise<AnalysisResult> {
      // Get the image record
      const image = await imageMutator.getById(imageId);

      if (!image) {
        throw new Error(`Image with ID ${imageId} not found`);
      }

      // Download image and convert to base64 for AI analysis (OpenAI cannot access localhost URLs)
      const imageData = await downloadImageAsBase64(pb, image);

      // Get existing categories for context
      const categories = await this.getCategoryLibrary();

      // Analyze the image
      const result = await getAIService().analyzeImage(imageData, categories);

      return result;
    },

    async processExistingImage(imageId: string): Promise<ProcessImageResult> {
      // Get the image record
      const image = await imageMutator.getById(imageId);

      if (!image) {
        throw new Error(`Image with ID ${imageId} not found`);
      }

      // Verify the image still exists and is accessible before processing
      // This helps catch cases where the image was deleted between the initial check and processing
      try {
        const verifyImage = await imageMutator.getById(imageId);
        if (!verifyImage) {
          throw new Error(`Image with ID ${imageId} no longer exists`);
        }
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          'status' in error &&
          error.status === 404
        ) {
          throw new Error(
            `Image with ID ${imageId} not found.It may have been deleted.`
          );
        }
        throw error;
      }

      // Download image and convert to base64 for AI analysis (OpenAI cannot access localhost URLs)
      const imageData = await downloadImageAsBase64(pb, image);

      try {
        // 1. Get existing categories for AI context
        const categories = await this.getCategoryLibrary();

        // 2. Update status to processing
        // Wrap in try-catch to handle 404 errors gracefully
        try {
          await imageMutator.updateAnalysisStatus(image.id, 'processing');
        } catch (updateError) {
          if (
            updateError &&
            typeof updateError === 'object' &&
            'status' in updateError &&
            updateError.status === 404
          ) {
            throw new Error(
              `Image with ID ${imageId} not found.It may have been deleted.`
            );
          }
          throw updateError;
        }

        // 3. Analyze with AI
        const result = await getAIService().analyzeImage(imageData, categories);

        // 4. Create records based on result type
        const items: Item[] = [];
        let container: Container | undefined;

        if (result.type === 'item') {
          // Check if item already exists for this image
          let item: Item;
          if (image.item) {
            // Update existing item
            const existingItem = await itemMutator.getById(image.item);
            if (existingItem) {
              item = await itemMutator.update(image.item, {
                item_label: result.data.item.item_label,
                item_notes: result.data.item.item_notes,
                category_functional: result.data.item.category_functional,
                category_specific: result.data.item.category_specific,
                item_type: result.data.item.item_type,
                item_manufacturer: result.data.item.item_manufacturer,
                item_attributes: result.data.item.item_attributes,
                primary_image: image.id,
              });
            } else {
              // Create new item if existing one was deleted
              item = await itemMutator.create({
                item_label: result.data.item.item_label,
                item_notes: result.data.item.item_notes,
                category_functional: result.data.item.category_functional,
                category_specific: result.data.item.category_specific,
                item_type: result.data.item.item_type,
                item_manufacturer: result.data.item.item_manufacturer,
                item_attributes: result.data.item.item_attributes,
                primary_image: image.id,
              });
            }
          } else {
            // Create new item
            item = await itemMutator.create({
              item_label: result.data.item.item_label,
              item_notes: result.data.item.item_notes,
              category_functional: result.data.item.category_functional,
              category_specific: result.data.item.category_specific,
              item_type: result.data.item.item_type,
              item_manufacturer: result.data.item.item_manufacturer,
              item_attributes: result.data.item.item_attributes,
              primary_image: image.id,
            });
          }
          items.push(item);

          // Update image with item reference and mark as completed
          await imageMutator.update(image.id, {
            image_type: 'item',
            analysis_status: 'completed',
            item: item.id,
          });
        } else {
          // Create container
          if (image.container) {
            // Update existing container
            const existingContainer = await containerMutator.getById(
              image.container
            );
            if (existingContainer) {
              container = await containerMutator.update(image.container, {
                container_label: result.data.container.container_label,
                container_notes: result.data.container.container_notes,
                primary_image: image.id,
              });
            } else {
              // Create new container if existing one was deleted
              container = await containerMutator.create({
                container_label: result.data.container.container_label,
                container_notes: result.data.container.container_notes,
                primary_image: image.id,
              });
            }
          } else {
            // Create new container
            container = await containerMutator.create({
              container_label: result.data.container.container_label,
              container_notes: result.data.container.container_notes,
              primary_image: image.id,
            });
          }

          // Create items for each item in the container
          for (const itemMetadata of result.data.container.container_items) {
            const itemData: ItemInput = {
              item_label: itemMetadata.item_label,
              item_notes: itemMetadata.item_notes,
              category_functional: itemMetadata.category_functional,
              category_specific: itemMetadata.category_specific,
              item_type: itemMetadata.item_type,
              item_manufacturer: itemMetadata.item_manufacturer,
              item_attributes: itemMetadata.item_attributes,
              container: container.id,
            };

            const item = await itemMutator.create(itemData);
            items.push(item);
          }

          // Update image with container reference and mark as completed
          await imageMutator.update(image.id, {
            image_type: 'container',
            analysis_status: 'completed',
            container: container.id,
          });
        }

        return { image, result, items, container };
      } catch (error) {
        // Mark image as failed if analysis or creation fails
        await imageMutator.updateAnalysisStatus(image.id, 'failed');
        throw error;
      }
    },

    async getCategoryLibrary(): Promise<CategoryLibrary> {
      return itemMutator.getDistinctCategories();
    },
  };
}

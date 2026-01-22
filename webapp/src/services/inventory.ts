import {
  type TypedPocketBase,
  ImageMutator,
  ImageMetadataMutator,
  ItemMutator,
  ContainerMutator,
  computeFileHash,
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
  const imageMetadataMutator = new ImageMetadataMutator(pb);
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
      // 1. Compute file hash for deduplication/caching
      const fileHash = await computeFileHash(file);

      // 2. Check for cached metadata with same hash
      const cachedEntry = await imageMetadataMutator.findByHash(fileHash);
      const cachedMetadata = cachedEntry?.metadata;

      // 3. Upload the new image (always create a new record for this user)
      const image = await imageMutator.uploadImage(file);

      // Convert file to base64 for AI analysis (if needed)
      const imageData = await fileToBase64(file);

      try {
        let result: AnalysisResult;

        if (cachedMetadata) {
          // Cache hit: reuse cached AI metadata
          console.log(`Cache hit for file hash ${fileHash.substring(0, 8)}...`);
          result = cachedMetadata as AnalysisResult;
        } else {
          // Cache miss: call AI API
          console.log(
            `Cache miss for file hash ${fileHash.substring(0, 8)}..., calling AI API`
          );

          // Get existing categories for AI context
          const categories = await this.getCategoryLibrary();

          // Update status to processing
          await imageMutator.updateAnalysisStatus(image.id, 'processing');

          // Analyze with AI
          result = await getAIService().analyzeImage(imageData, categories);

          // Save AI metadata to ImageMetadata collection for future cache hits
          await imageMetadataMutator.saveMetadata(
            image.id,
            fileHash,
            result,
            result.type
          );
        }

        // 4. Create records based on result type
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

          // Update image type and mark as completed
          await imageMutator.update(image.id, {
            image_type: 'item',
            analysis_status: 'completed',
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
              primary_image: image.id,
            };

            const item = await itemMutator.create(itemData);
            items.push(item);
          }

          // Update image type and mark as completed
          await imageMutator.update(image.id, {
            image_type: 'container',
            analysis_status: 'completed',
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
        let result: AnalysisResult;

        // Check if there's cached metadata for this image
        const cachedEntry = await imageMetadataMutator.getByImageId(imageId);
        if (cachedEntry?.metadata) {
          // Cache hit: reuse cached AI metadata
          console.log(`Using cached AI metadata for image ${imageId}`);
          result = cachedEntry.metadata as AnalysisResult;
        } else {
          // Cache miss: call AI API
          console.log(
            `No cached AI metadata for image ${imageId}, calling AI API`
          );

          // Get existing categories for AI context
          const categories = await this.getCategoryLibrary();

          // Update status to processing
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

          // Analyze with AI
          result = await getAIService().analyzeImage(imageData, categories);

          // Compute file hash for caching (need to download/compute)
          const imageBlob = await fetch(
            pb.files.getURL(image, image.file)
          ).then((r) => r.blob());
          const fileHash = await computeFileHash(await imageBlob.arrayBuffer());

          // Save AI metadata to ImageMetadata collection for future cache hits
          await imageMetadataMutator.saveMetadata(
            image.id,
            fileHash,
            result,
            result.type
          );
        }

        // 4. Create records based on result type
        const items: Item[] = [];
        let container: Container | undefined;

        if (result.type === 'item') {
          // Check if item already exists for this image by querying items with this image as primary_image
          let item: Item;
          const existingItems = await itemMutator.getList(
            1,
            1,
            `primary_image="${image.id}"`
          );

          if (existingItems.items.length > 0) {
            // Update existing item
            const existingItem = existingItems.items[0];
            item = await itemMutator.update(existingItem.id, {
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

          // Update image type and mark as completed
          await imageMutator.update(image.id, {
            image_type: 'item',
            analysis_status: 'completed',
          });
        } else {
          // Create container - check if one already exists for this image
          const existingContainers = await containerMutator.getList(
            1,
            1,
            `primary_image="${image.id}"`
          );

          if (existingContainers.items.length > 0) {
            // Update existing container
            const existingContainer = existingContainers.items[0];
            container = await containerMutator.update(existingContainer.id, {
              container_label: result.data.container.container_label,
              container_notes: result.data.container.container_notes,
              primary_image: image.id,
            });
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
              primary_image: image.id,
            };

            const item = await itemMutator.create(itemData);
            items.push(item);
          }

          // Update image type and mark as completed
          await imageMutator.update(image.id, {
            image_type: 'container',
            analysis_status: 'completed',
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

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
  imageMutatorInstance: ImageMutator,
  image: Image
): Promise<string> {
  const imageUrl = imageMutatorInstance.getFileUrl(image);

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
    async processImageUpload(
      file: File,
      userId: string
    ): Promise<ProcessImageResult> {
      // 1. Compute file hash for deduplication/caching
      const fileHash = await computeFileHash(file);

      // 2. Check for cached metadata with same hash
      const cachedEntry = await imageMetadataMutator.findByHash(fileHash);
      const cachedMetadata = cachedEntry?.metadata;

      // 3. Upload the new image (always create a new record for this user)
      const image = await imageMutator.uploadImage(file, userId);

      // 4. Update the image's fileHash field
      await imageMutator.update(image.id, { fileHash });

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
          result = await getAIService().analyzeImage(
            imageData,
            categories,
            this.searchCategories.bind(this)
          );

          // Save AI metadata to ImageMetadata collection for future cache hits
          await imageMetadataMutator.saveMetadata(
            image.id,
            fileHash,
            result,
            result.type
          );
        }

        // 5. Create records based on result type
        const items: Item[] = [];
        let container: Container | undefined;

        if (result.type === 'item') {
          // Create single item - check if it already exists for this image (safety check)
          const itemData: ItemInput = {
            itemLabel: result.data.item.itemLabel,
            itemName: result.data.item.itemName,
            itemNotes: result.data.item.itemNotes,
            categoryFunctional: result.data.item.categoryFunctional,
            categorySpecific: result.data.item.categorySpecific,
            itemType: result.data.item.itemType,
            itemManufacturer: result.data.item.itemManufacturer,
            itemAttributes: result.data.item.itemAttributes,
            primaryImage: image.id,
            UserRef: userId,
          };

          const existingItems = await itemMutator.getList(
            1,
            1,
            `primaryImage="${image.id}"`
          );

          let item: Item;
          if (existingItems.items.length > 0) {
            console.log(
              `Item already exists for image ${image.id}, updating...`
            );
            item = await itemMutator.update(
              existingItems.items[0].id,
              itemData
            );
          } else {
            console.log(
              `Creating new item for image ${image.id} for user ${userId}`
            );
            item = await itemMutator.create(itemData);
          }
          items.push(item);

          // Update image type and mark as completed
          await imageMutator.update(image.id, {
            imageType: 'item',
            analysisStatus: 'completed',
          });
        } else {
          // Create container - safety check if it already exists
          const existingContainers = await containerMutator.getList(
            1,
            1,
            `primaryImage="${image.id}"`
          );

          let containerObj: Container;
          if (existingContainers.items.length > 0) {
            console.log(
              `Container already exists for image ${image.id}, updating...`
            );
            containerObj = await containerMutator.update(
              existingContainers.items[0].id,
              {
                containerLabel: result.data.container.containerLabel,
                containerNotes: result.data.container.containerNotes,
                primaryImage: image.id,
              }
            );
          } else {
            console.log(
              `Creating new container for image ${image.id} for user ${userId}`
            );
            containerObj = await containerMutator.create({
              containerLabel: result.data.container.containerLabel,
              containerNotes: result.data.container.containerNotes,
              primaryImage: image.id,
              UserRef: userId,
            });
          }
          container = containerObj;

          // Create items for each item in the container - safety check for each
          for (const itemMetadata of result.data.container.containerItems) {
            const itemData: ItemInput = {
              itemLabel: itemMetadata.itemLabel,
              itemName: itemMetadata.itemName,
              itemNotes: itemMetadata.itemNotes,
              categoryFunctional: itemMetadata.categoryFunctional,
              categorySpecific: itemMetadata.categorySpecific,
              itemType: itemMetadata.itemType,
              itemManufacturer: itemMetadata.itemManufacturer,
              itemAttributes: itemMetadata.itemAttributes,
              container: container.id,
              primaryImage: image.id,
              UserRef: userId,
            };

            // Check if this specific item already exists in this container
            // Use itemLabel and container as uniqueness heuristic
            const existingItemResult = await itemMutator.getList(
              1,
              1,
              `container="${container.id}" && itemLabel="${itemData.itemLabel}"`
            );

            if (existingItemResult.items.length > 0) {
              console.log(
                `Item ${itemData.itemLabel} already exists in container ${container.id}, updating...`
              );
              const existingItem = existingItemResult.items[0];
              const item = await itemMutator.update(existingItem.id, itemData);
              items.push(item);
            } else {
              console.log(
                `Creating new item ${itemData.itemLabel} in container ${container.id} for user ${userId}`
              );
              const item = await itemMutator.create(itemData);
              items.push(item);
            }
          }

          // Update image type and mark as completed
          await imageMutator.update(image.id, {
            imageType: 'container',
            analysisStatus: 'completed',
          });
        }

        return { image, result, items, container };
      } catch (error) {
        console.error(
          `Error in processImageUpload for image ${image.id}:`,
          error
        );
        // Mark image as failed if analysis or creation fails
        try {
          await imageMutator.updateAnalysisStatus(image.id, 'failed');
        } catch (updateError) {
          console.error(
            'Failed to update image status to failed:',
            updateError
          );
        }
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
      const imageData = await downloadImageAsBase64(pb, imageMutator, image);

      // Get existing categories for context
      const categories = await this.getCategoryLibrary();

      // Analyze the image
      const result = await getAIService().analyzeImage(
        imageData,
        categories,
        this.searchCategories.bind(this)
      );

      return result;
    },

    async processExistingImage(
      imageId: string,
      userId: string
    ): Promise<ProcessImageResult> {
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

      // Compute file hash first for cache lookup
      const imageBlob = await fetch(imageMutator.getFileUrl(image)).then((r) =>
        r.blob()
      );
      const fileHash = await computeFileHash(await imageBlob.arrayBuffer());

      // Update the image's fileHash field if it's not set or different
      if (image.fileHash !== fileHash) {
        await imageMutator.update(image.id, { fileHash });
      }

      // Check for cached metadata with same hash
      const cachedEntry = await imageMetadataMutator.findByHash(fileHash);
      const cachedMetadata = cachedEntry?.metadata;

      // Download image and convert to base64 for AI analysis (OpenAI cannot access localhost URLs)
      const imageData = await downloadImageAsBase64(pb, imageMutator, image);

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
          result = await getAIService().analyzeImage(
            imageData,
            categories,
            this.searchCategories.bind(this)
          );

          // Save AI metadata to ImageMetadata collection for future cache hits
          await imageMetadataMutator.saveMetadata(
            image.id,
            fileHash,
            result,
            result.type
          );
        }

        // 5. Create records based on result type
        const items: Item[] = [];
        let container: Container | undefined;

        if (result.type === 'item') {
          // Check if item already exists for this image by querying items with this image as primaryImage
          let item: Item;
          const existingItems = await itemMutator.getList(
            1,
            1,
            `primaryImage="${image.id}"`
          );

          const itemData: ItemInput = {
            itemLabel: result.data.item.itemLabel,
            itemName: result.data.item.itemName,
            itemNotes: result.data.item.itemNotes,
            categoryFunctional: result.data.item.categoryFunctional,
            categorySpecific: result.data.item.categorySpecific,
            itemType: result.data.item.itemType,
            itemManufacturer: result.data.item.itemManufacturer,
            itemAttributes: result.data.item.itemAttributes,
            primaryImage: image.id,
            UserRef: userId,
          };

          if (existingItems.items.length > 0) {
            // Update existing item
            console.log(`Updating existing item for image ${imageId}`);
            const existingItem = existingItems.items[0];
            item = await itemMutator.update(existingItem.id, itemData);
          } else {
            // Create new item
            console.log(
              `Creating new item for image ${imageId} for user ${userId}`
            );
            item = await itemMutator.create(itemData);
          }
          items.push(item);

          // Update image type and mark as completed
          await imageMutator.update(image.id, {
            imageType: 'item',
            analysisStatus: 'completed',
          });
        } else {
          // Create container - check if one already exists for this image
          const existingContainers = await containerMutator.getList(
            1,
            1,
            `primaryImage="${image.id}"`
          );

          if (existingContainers.items.length > 0) {
            // Update existing container
            console.log(`Updating existing container for image ${imageId}`);
            const existingContainer = existingContainers.items[0];
            container = await containerMutator.update(existingContainer.id, {
              containerLabel: result.data.container.containerLabel,
              containerNotes: result.data.container.containerNotes,
              primaryImage: image.id,
            });
          } else {
            // Create new container
            console.log(
              `Creating new container for image ${imageId} for user ${userId}`
            );
            container = await containerMutator.create({
              containerLabel: result.data.container.containerLabel,
              containerNotes: result.data.container.containerNotes,
              primaryImage: image.id,
              UserRef: userId,
            });
          }

          // Create items for each item in the container
          for (const itemMetadata of result.data.container.containerItems) {
            const itemData: ItemInput = {
              itemLabel: itemMetadata.itemLabel,
              itemName: itemMetadata.itemName,
              itemNotes: itemMetadata.itemNotes,
              categoryFunctional: itemMetadata.categoryFunctional,
              categorySpecific: itemMetadata.categorySpecific,
              itemType: itemMetadata.itemType,
              itemManufacturer: itemMetadata.itemManufacturer,
              itemAttributes: itemMetadata.itemAttributes,
              container: container.id,
              primaryImage: image.id,
              UserRef: userId,
            };

            // Check if this specific item already exists in this container
            const existingItemResult = await itemMutator.getList(
              1,
              1,
              `container="${container.id}" && itemLabel="${itemData.itemLabel}"`
            );

            if (existingItemResult.items.length > 0) {
              console.log(
                `Updating existing item ${itemData.itemLabel} in container ${container.id}`
              );
              const existingItem = existingItemResult.items[0];
              const item = await itemMutator.update(existingItem.id, itemData);
              items.push(item);
            } else {
              console.log(
                `Creating new item ${itemData.itemLabel} in container ${container.id} for user ${userId}`
              );
              const item = await itemMutator.create(itemData);
              items.push(item);
            }
          }

          // Update image type and mark as completed
          await imageMutator.update(image.id, {
            imageType: 'container',
            analysisStatus: 'completed',
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

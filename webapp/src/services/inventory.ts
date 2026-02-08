import {
  type TypedPocketBase,
  ImageMutator,
  ImageMetadataMutator,
  ItemMutator,
  ContainerMutator,
  computeFileHash,
  matchItems,
  executeUpsert,
  type ItemMetadata,
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
 * Result of processing a container image upsert
 */
export interface ContainerUpsertResult {
  image: Image;
  updatedItems: Item[];
  createdItems: Item[];
  unmatchedExisting: Item[];
  container: Container;
}

/**
 * Result of processing an item image upload
 */
export interface ItemUploadResult {
  image: Image;
  item: Item;
}

/**
 * Cleanup action type for unmatched items
 */
export type CleanupAction = 'keep' | 'remove' | 'delete';

/**
 * Cleanup action request
 */
export interface CleanupActionRequest {
  itemId: string;
  action: CleanupAction;
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
   * Process a container image upload with intelligent upsert
   * @param file - The image file to upload
   * @param containerId - ID of the existing container
   * @param userId - ID of the authenticated user
   * @returns Container upsert result with updated, created, and unmatched items
   */
  processContainerImageUpload(
    file: File,
    containerId: string,
    userId: string
  ): Promise<ContainerUpsertResult>;

  /**
   * Process an item image upload with metadata enhancement
   * @param file - The image file to upload
   * @param itemId - ID of the existing item
   * @param userId - ID of the authenticated user
   * @returns Item upload result with updated item and new image
   */
  processItemImageUpload(
    file: File,
    itemId: string,
    userId: string
  ): Promise<ItemUploadResult>;

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

  /**
   * Remove an item from its container (set ContainerRef to empty)
   * Preserves all other item fields
   * @param itemId - ID of the item to remove from container
   * @returns Updated item with empty ContainerRef
   */
  removeItemFromContainer(itemId: string): Promise<Item>;

  /**
   * Delete an item record
   * @param itemId - ID of the item to delete
   * @returns True if deletion was successful
   */
  deleteItem(itemId: string): Promise<boolean>;

  /**
   * Execute cleanup actions for multiple items
   * @param actions - Array of cleanup action requests
   * @returns Object with counts of kept, removed, and deleted items
   */
  executeCleanupActions(actions: CleanupActionRequest[]): Promise<{
    kept: number;
    removed: number;
    deleted: number;
  }>;
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
          result = cachedMetadata as AnalysisResult;
        } else {
          // Cache miss: call AI API

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
            ImageRef: image.id,
            UserRef: userId,
          };

          const existingItems = await itemMutator.getList(
            1,
            1,
            `ImageRef="${image.id}"`
          );

          let item: Item;
          if (existingItems.items.length > 0) {
            item = await itemMutator.update(
              existingItems.items[0].id,
              itemData
            );
          } else {
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
            `ImageRef="${image.id}"`
          );

          let containerObj: Container;
          if (existingContainers.items.length > 0) {
            containerObj = await containerMutator.update(
              existingContainers.items[0].id,
              {
                containerLabel: result.data.container.containerLabel,
                containerNotes: result.data.container.containerNotes,
                ImageRef: image.id,
              }
            );
          } else {
            containerObj = await containerMutator.create({
              containerLabel: result.data.container.containerLabel,
              containerNotes: result.data.container.containerNotes,
              ImageRef: image.id,
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
              ContainerRef: container.id,
              ImageRef: image.id,
              UserRef: userId,
            };

            // Check if this specific item already exists in this container
            // Use itemLabel and container as uniqueness heuristic
            const existingItemResult = await itemMutator.getList(
              1,
              1,
              `ContainerRef="${container.id}" && itemLabel="${itemData.itemLabel}"`
            );

            if (existingItemResult.items.length > 0) {
              const existingItem = existingItemResult.items[0];
              const item = await itemMutator.update(existingItem.id, itemData);
              items.push(item);
            } else {
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
          result = cachedMetadata as AnalysisResult;
        } else {
          // Cache miss: call AI API

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
            fileHash,
            result,
            result.type
          );
        }

        // 5. Create records based on result type
        const items: Item[] = [];
        let container: Container | undefined;

        if (result.type === 'item') {
          // Check if item already exists for this image by querying items with this image as ImageRef
          let item: Item;
          const existingItems = await itemMutator.getList(
            1,
            1,
            `ImageRef="${image.id}"`
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
            ImageRef: image.id,
            UserRef: userId,
          };

          if (existingItems.items.length > 0) {
            // Update existing item
            const existingItem = existingItems.items[0];
            item = await itemMutator.update(existingItem.id, itemData);
          } else {
            // Create new item
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
            `ImageRef="${image.id}"`
          );

          if (existingContainers.items.length > 0) {
            // Update existing container
            const existingContainer = existingContainers.items[0];
            container = await containerMutator.update(existingContainer.id, {
              containerLabel: result.data.container.containerLabel,
              containerNotes: result.data.container.containerNotes,
              ImageRef: image.id,
            });
          } else {
            // Create new container
            container = await containerMutator.create({
              containerLabel: result.data.container.containerLabel,
              containerNotes: result.data.container.containerNotes,
              ImageRef: image.id,
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
              ContainerRef: container.id,
              ImageRef: image.id,
              UserRef: userId,
            };

            // Check if this specific item already exists in this container
            const existingItemResult = await itemMutator.getList(
              1,
              1,
              `ContainerRef="${container.id}" && itemLabel="${itemData.itemLabel}"`
            );

            if (existingItemResult.items.length > 0) {
              const existingItem = existingItemResult.items[0];
              const item = await itemMutator.update(existingItem.id, itemData);
              items.push(item);
            } else {
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

    async processContainerImageUpload(
      file: File,
      containerId: string,
      userId: string
    ): Promise<ContainerUpsertResult> {
      // 1. Verify container exists and user has access
      const container = await containerMutator.getById(containerId);
      if (!container) {
        throw new Error(`Container with ID ${containerId} not found`);
      }

      // Verify ownership
      if (container.UserRef !== userId) {
        throw new Error('Unauthorized: You do not own this container');
      }

      // 2. Upload the new image
      const image = await imageMutator.uploadImage(file, userId);

      // 3. Update the image's fileHash field
      const fileHash = await computeFileHash(file);
      await imageMutator.update(image.id, { fileHash });

      // Convert file to base64 for AI analysis
      const imageData = await fileToBase64(file);

      try {
        // 4. Fetch existing container items
        const existingItems = await itemMutator.getByContainer(containerId);

        // 5. Get existing categories for AI context
        const categories = await this.getCategoryLibrary();

        // 6. Update status to processing
        await imageMutator.updateAnalysisStatus(image.id, 'processing');

        // 7. Analyze with AI using existing items as context
        const aiResult = await getAIService().analyzeContainerImageWithContext(
          imageData,
          existingItems,
          categories
        );

        // 8. Convert AI result to ItemMetadata array (handle snake_case to camelCase)
        const detectedItems: ItemMetadata[] =
          aiResult.container.containerItems.map((item) => ({
            itemLabel: item.itemLabel,
            itemName: item.itemName,
            itemNotes: item.itemNotes,
            categoryFunctional: item.categoryFunctional,
            categorySpecific: item.categorySpecific,
            itemType: item.itemType,
            itemManufacturer: item.itemManufacturer,
            itemAttributes: item.itemAttributes,
          }));

        // 9. Match detected items against existing items
        const matchResult = matchItems(detectedItems, existingItems);

        // 10. Execute upsert with real mutator callbacks
        const upsertResult = await executeUpsert(
          matchResult,
          image.id,
          containerId,
          {
            updateItem: async (
              itemId: string,
              metadata: ItemMetadata,
              imageId: string
            ): Promise<Item> => {
              const itemData: ItemInput = {
                itemLabel: metadata.itemLabel,
                itemName: metadata.itemName,
                itemNotes: metadata.itemNotes,
                categoryFunctional: metadata.categoryFunctional,
                categorySpecific: metadata.categorySpecific,
                itemType: metadata.itemType,
                itemManufacturer: metadata.itemManufacturer,
                itemAttributes: metadata.itemAttributes,
                ImageRef: imageId,
                UserRef: userId,
              };
              return await itemMutator.update(itemId, itemData);
            },
            createItem: async (
              metadata: ItemMetadata,
              containerIdParam: string,
              imageId: string
            ): Promise<Item> => {
              const itemData: ItemInput = {
                itemLabel: metadata.itemLabel,
                itemName: metadata.itemName,
                itemNotes: metadata.itemNotes,
                categoryFunctional: metadata.categoryFunctional,
                categorySpecific: metadata.categorySpecific,
                itemType: metadata.itemType,
                itemManufacturer: metadata.itemManufacturer,
                itemAttributes: metadata.itemAttributes,
                ContainerRef: containerIdParam,
                ImageRef: imageId,
                UserRef: userId,
              };
              return await itemMutator.create(itemData);
            },
          }
        );

        // 11. Update container's ImageRef to new image
        const updatedContainer = await containerMutator.update(containerId, {
          ImageRef: image.id,
        });

        // 12. Update image type and mark as completed
        await imageMutator.update(image.id, {
          imageType: 'container',
          analysisStatus: 'completed',
        });

        return {
          image,
          updatedItems: upsertResult.updatedItems,
          createdItems: upsertResult.createdItems,
          unmatchedExisting: upsertResult.unmatchedExisting,
          container: updatedContainer,
        };
      } catch (error) {
        console.error(
          `Error in processContainerImageUpload for container ${containerId}:`,
          error
        );
        // Mark image as failed if analysis or upsert fails
        try {
          await imageMutator.updateAnalysisStatus(image.id, 'failed');
        } catch (updateError) {
          console.error(
            'Failed to update image status to failed:',
            updateError
          );
        }
        // Preserve existing items - don't modify them on failure
        throw error;
      }
    },

    async processItemImageUpload(
      file: File,
      itemId: string,
      userId: string
    ): Promise<ItemUploadResult> {
      // 1. Verify item exists and user has access
      const item = await itemMutator.getById(itemId);
      if (!item) {
        throw new Error(`Item with ID ${itemId} not found`);
      }

      // Verify ownership
      if (item.UserRef !== userId) {
        throw new Error('Unauthorized: You do not own this item');
      }

      // 2. Upload the new image
      const image = await imageMutator.uploadImage(file, userId);

      // 3. Update the image's fileHash field
      const fileHash = await computeFileHash(file);
      await imageMutator.update(image.id, { fileHash });

      // Convert file to base64 for AI analysis
      const imageData = await fileToBase64(file);

      try {
        // 4. Get existing categories for AI context
        const categories = await this.getCategoryLibrary();

        // 5. Update status to processing
        await imageMutator.updateAnalysisStatus(image.id, 'processing');

        // 6. Analyze with AI for single-item analysis
        const aiResult = await getAIService().analyzeImage(
          imageData,
          categories,
          this.searchCategories.bind(this)
        );

        // Verify the result is for a single item
        if (aiResult.type !== 'item') {
          throw new Error(
            'Expected single item analysis but got container result'
          );
        }

        // 7. Update item's metadata and ImageRef with AI-detected values
        const updatedItem = await itemMutator.update(itemId, {
          itemLabel: aiResult.data.item.itemLabel,
          itemName: aiResult.data.item.itemName,
          itemNotes: aiResult.data.item.itemNotes,
          categoryFunctional: aiResult.data.item.categoryFunctional,
          categorySpecific: aiResult.data.item.categorySpecific,
          itemType: aiResult.data.item.itemType,
          itemManufacturer: aiResult.data.item.itemManufacturer,
          itemAttributes: aiResult.data.item.itemAttributes,
          ImageRef: image.id,
        });

        // 8. Update image type and mark as completed
        await imageMutator.update(image.id, {
          imageType: 'item',
          analysisStatus: 'completed',
        });

        return {
          image,
          item: updatedItem,
        };
      } catch (error) {
        console.error(
          `Error in processItemImageUpload for item ${itemId}:`,
          error
        );

        // On AI failure: save image and update ImageRef, but preserve existing metadata
        try {
          // Update item's ImageRef to the new image (preserving all other fields)
          const updatedItem = await itemMutator.update(itemId, {
            ImageRef: image.id,
          });

          // Mark image as failed
          await imageMutator.update(image.id, {
            imageType: 'item',
            analysisStatus: 'failed',
          });

          // Return the result with preserved metadata
          return {
            image,
            item: updatedItem,
          };
        } catch (updateError) {
          console.error(
            'Failed to update item ImageRef after AI failure:',
            updateError
          );
          // Mark image as failed
          await imageMutator.updateAnalysisStatus(image.id, 'failed');
          throw error; // Re-throw the original error
        }
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

    async removeItemFromContainer(itemId: string): Promise<Item> {
      // Set ContainerRef to empty string, preserving all other fields
      return await itemMutator.update(itemId, {
        ContainerRef: '',
      });
    },

    async deleteItem(itemId: string): Promise<boolean> {
      return await itemMutator.delete(itemId);
    },

    async executeCleanupActions(actions: CleanupActionRequest[]): Promise<{
      kept: number;
      removed: number;
      deleted: number;
    }> {
      let kept = 0;
      let removed = 0;
      let deleted = 0;

      for (const { itemId, action } of actions) {
        try {
          switch (action) {
            case 'keep':
              // No operation needed - item stays unchanged
              kept++;
              break;

            case 'remove':
              // Remove from container by setting ContainerRef to empty
              await this.removeItemFromContainer(itemId);
              removed++;
              break;

            case 'delete':
              // Delete the item record
              await this.deleteItem(itemId);
              deleted++;
              break;

            default:
              console.warn(`Unknown cleanup action: ${action}`);
          }
        } catch (error) {
          console.error(
            `Failed to execute cleanup action ${action} for item ${itemId}:`,
            error
          );
          // Continue with other actions even if one fails
        }
      }

      return { kept, removed, deleted };
    },
  };
}

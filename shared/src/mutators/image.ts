import { RecordService } from 'pocketbase';
import { type Image, type ImageInput, ImageInputSchema } from '../index';
import type { TypedPocketBase } from '../types';
import { BaseMutator } from './base';

export class ImageMutator extends BaseMutator<Image, ImageInput> {
  constructor(pb: TypedPocketBase) {
    super(pb);
  }

  protected getCollection(): RecordService<Image> {
    return this.pb.collection('Images');
  }

  protected async validateInput(input: ImageInput): Promise<ImageInput> {
    // Validate the input using the schema
    return ImageInputSchema.parse(input);
  }

  /**
   * Upload an image file with metadata
   * @param file The image file to upload
   * @param imageType The type of image (item, container, or unprocessed)
   * @returns The created Image record
   */
  async uploadImage(
    file: File,
    imageType: 'item' | 'container' | 'unprocessed' = 'unprocessed'
  ): Promise<Image> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('image_type', imageType);
      formData.append('analysis_status', 'pending');

      // Set the user to the currently authenticated user
      const userId = this.pb.authStore.record?.id;
      if (userId) {
        formData.append('User', userId);
      }

      // Use the collection directly for FormData upload
      const record = await this.getCollection().create(formData);
      return await this.processRecord(record);
    } catch (error) {
      return this.errorWrapper(error);
    }
  }

  /**
   * Update the analysis status of an image
   * @param id The image ID
   * @param status The new analysis status
   * @returns The updated Image record
   */
  async updateAnalysisStatus(
    id: string,
    status: 'pending' | 'processing' | 'completed' | 'failed'
  ): Promise<Image> {
    try {
      const data: Partial<ImageInput> = { analysis_status: status };
      return await this.update(id, data as Partial<Image>);
    } catch (error) {
      return this.errorWrapper(error);
    }
  }

  /**
   * Get images by analysis status
   * @param status The analysis status to filter by
   * @returns Array of Image records
   */
  async getByAnalysisStatus(
    status: 'pending' | 'processing' | 'completed' | 'failed'
  ): Promise<Image[]> {
    try {
      const result = await this.getList(1, 100, `analysis_status="${status}"`);
      return result.items;
    } catch (error) {
      return this.errorWrapper(error);
    }
  }

  /**
   * Get all images associated with an item
   * This includes the primary image and any images in ItemImageMappings
   * @param itemId The item ID to filter by
   * @returns Array of Image records
   */
  async getByItemId(itemId: string): Promise<Image[]> {
    try {
      const images: Image[] = [];
      const imageIds = new Set<string>();

      // 1. Get the item to find its primary_image
      const item = await this.pb.collection('Items').getOne(itemId);

      if (item && item.primary_image) {
        const primaryImage = await this.getById(item.primary_image);
        if (primaryImage) {
          images.push(primaryImage);
          imageIds.add(primaryImage.id);
        }
      }

      // 2. Get all historical/mapped images for this item
      const itemMappings = await this.pb
        .collection('ItemImageMappings')
        .getFullList({
          filter: `item = "${itemId}"`,
          sort: '-created',
        });

      // Fetch the actual image records for these mappings
      for (const mapping of itemMappings) {
        if (!imageIds.has(mapping.image)) {
          try {
            const mappedImage = await this.getById(mapping.image);
            if (mappedImage) {
              images.push(mappedImage);
              imageIds.add(mappedImage.id);
            }
          } catch (err) {
            console.error(
              `Failed to fetch mapped image ${mapping.image}:`,
              err
            );
          }
        }
      }

      return images;
    } catch (error) {
      return this.errorWrapper(error);
    }
  }

  /**
   * Get all images associated with a container
   * This includes the primary image and any images in ContainerImageMappings
   * @param containerId The container ID to filter by
   * @returns Array of Image records
   */
  async getByContainerId(containerId: string): Promise<Image[]> {
    try {
      const images: Image[] = [];
      const imageIds = new Set<string>();

      // 1. Get the container to find its primary_image
      const container = await this.pb
        .collection('Containers')
        .getOne(containerId);

      if (container && container.primary_image) {
        const primaryImage = await this.getById(container.primary_image);
        if (primaryImage) {
          images.push(primaryImage);
          imageIds.add(primaryImage.id);
        }
      }

      // 2. Get all historical/mapped images for this container
      const containerMappings = await this.pb
        .collection('ContainerImageMappings')
        .getFullList({
          filter: `container = "${containerId}"`,
          sort: '-created',
        });

      // Fetch the actual image records for these mappings
      for (const mapping of containerMappings) {
        if (!imageIds.has(mapping.image)) {
          try {
            const mappedImage = await this.getById(mapping.image);
            if (mappedImage) {
              images.push(mappedImage);
              imageIds.add(mappedImage.id);
            }
          } catch (err) {
            console.error(
              `Failed to fetch mapped image ${mapping.image}:`,
              err
            );
          }
        }
      }

      return images;
    } catch (error) {
      return this.errorWrapper(error);
    }
  }
}

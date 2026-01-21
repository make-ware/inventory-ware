import { RecordService } from 'pocketbase';
import { type Image, type ImageInput, ImageInputSchema } from '../index';
import type { TypedPocketBase } from '../types';
import { BaseMutator } from './base';

export class ImageMutator extends BaseMutator<Image, ImageInput> {
  constructor(pb: TypedPocketBase) {
    super(pb);
  }

  protected getCollection(): RecordService<Image> {
    return this.pb.collection('images');
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
   * Get images by item ID (images that are primary_image for items with this itemId)
   * @param itemId The item ID to filter by
   * @returns Array of Image records
   */
  async getByItemId(itemId: string): Promise<Image[]> {
    try {
      // Get the item to find its primary_image
      const item = await this.pb.collection('items').getOne(itemId);

      if (!item || !item.primary_image) {
        return [];
      }

      // Get the primary image
      const image = await this.getById(item.primary_image);
      return image ? [image] : [];
    } catch (error) {
      return this.errorWrapper(error);
    }
  }

  /**
   * Get images by container ID (images that are primary_image for containers with this containerId)
   * @param containerId The container ID to filter by
   * @returns Array of Image records
   */
  async getByContainerId(containerId: string): Promise<Image[]> {
    try {
      // Get the container to find its primary_image
      const container = await this.pb
        .collection('containers')
        .getOne(containerId);

      if (!container || !container.primary_image) {
        return [];
      }

      // Get the primary image
      const image = await this.getById(container.primary_image);
      return image ? [image] : [];
    } catch (error) {
      return this.errorWrapper(error);
    }
  }
}

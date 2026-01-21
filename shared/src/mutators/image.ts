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
}

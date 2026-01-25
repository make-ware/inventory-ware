import type { AnalysisResult } from '../types/metadata';
import {
  type TypedPocketBase,
  type ImageMetadata,
  type ImageMetadataInput,
  ImageMetadataInputSchema,
} from '../index';
import { BaseMutator, TypedRecordService } from './base';

export class ImageMetadataMutator extends BaseMutator<
  ImageMetadata,
  ImageMetadataInput
> {
  constructor(pb: TypedPocketBase) {
    super(pb);
  }

  protected getCollection(): TypedRecordService<
    ImageMetadata,
    ImageMetadataInput
  > {
    return this.pb.collection('ImageMetadata') as unknown as TypedRecordService<
      ImageMetadata,
      ImageMetadataInput
    >;
  }

  protected async validateInput(
    input: ImageMetadataInput
  ): Promise<ImageMetadataInput> {
    return ImageMetadataInputSchema.parse(input);
  }

  /**
   * Find cached metadata by file hash
   * @param hash SHA-256 hash of the file content
   * @returns The cached ImageMetadata record if found, null otherwise
   */
  async findByHash(hash: string): Promise<ImageMetadata | null> {
    try {
      const result = await this.getCollection().getList(1, 1, {
        filter: `fileHash="${hash}"`,
        sort: '-created',
      });
      return result.items.length > 0 ? result.items[0] : null;
    } catch (error) {
      console.error('Error finding image metadata by hash:', error);
      return null;
    }
  }

  /**
   * Create or update metadata cache entry
   * @param imageId The Image record ID
   * @param hash SHA-256 hash of the file content
   * @param metadata The AI analysis result to cache
   * @param imageType The type of image
   * @returns The created/updated ImageMetadata record
   */
  async saveMetadata(
    hash: string,
    metadata: AnalysisResult,
    imageType: 'item' | 'container' | 'unprocessed' = 'unprocessed'
  ): Promise<ImageMetadata> {
    // Check if entry exists for this hash
    const existing = await this.findByHash(hash);

    if (existing) {
      // Update existing entry
      // Note: We use Partial<ImageMetadataInput> for updates
      return await this.getCollection().update(existing.id, {
        metadata,
        imageType: imageType,
        version: (existing.version ?? 1) + 1,
      });
    } else {
      // Create new entry
      return await this.getCollection().create({
        fileHash: hash,
        metadata,
        imageType: imageType,
        version: 1,
      });
    }
  }

  /**
   * Get cached metadata by image ID
   * @param imageId The Image record ID
   * @returns The ImageMetadata record if found, null otherwise
   */
  async getByImageId(imageId: string): Promise<ImageMetadata | null> {
    try {
      const result = await this.getCollection().getList(1, 1, {
        filter: `ImageRef="${imageId}"`,
      });
      return result.items.length > 0 ? result.items[0] : null;
    } catch (error) {
      console.error('Error finding image metadata by image ID:', error);
      return null;
    }
  }
}

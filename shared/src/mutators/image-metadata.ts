import { RecordService } from 'pocketbase';
import type { AnalysisResult } from '../types/metadata';
import type { TypedPocketBase, ImageMetadata } from '../types';

// Re-export ImageMetadata type for convenience
export type { ImageMetadata };

export type ImageMetadataInput = {
  Image?: string;
  file_hash: string;
  metadata?: AnalysisResult | null;
  version?: number;
  image_type?: 'item' | 'container' | 'unprocessed';
};

export class ImageMetadataMutator {
  constructor(protected pb: TypedPocketBase) {}

  protected getCollection(): RecordService<ImageMetadata> {
    return this.pb.collection('ImageMetadata') as RecordService<ImageMetadata>;
  }

  /**
   * Find cached metadata by file hash
   * @param hash SHA-256 hash of the file content
   * @returns The cached ImageMetadata record if found, null otherwise
   */
  async findByHash(hash: string): Promise<ImageMetadata | null> {
    try {
      const result = await this.getCollection().getList(1, 1, {
        filter: `file_hash="${hash}"`,
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
    imageId: string,
    hash: string,
    metadata: AnalysisResult,
    imageType: 'item' | 'container' | 'unprocessed' = 'unprocessed'
  ): Promise<ImageMetadata> {
    // Check if entry exists for this hash
    const existing = await this.findByHash(hash);

    if (existing) {
      // Update existing entry
      return await this.getCollection().update(existing.id, {
        Image: imageId,
        metadata,
        image_type: imageType,
        version: (existing.version ?? 1) + 1,
      });
    } else {
      // Create new entry
      return await this.getCollection().create({
        Image: imageId,
        file_hash: hash,
        metadata,
        image_type: imageType,
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
        filter: `Image="${imageId}"`,
      });
      return result.items.length > 0 ? result.items[0] : null;
    } catch (error) {
      console.error('Error finding image metadata by image ID:', error);
      return null;
    }
  }
}

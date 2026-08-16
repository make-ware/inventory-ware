import type { ListResult } from 'pocketbase';
import {
  type AnalysisStatus,
  type Image,
  type ImageInput,
  ImageInputSchema,
  type ImageType,
} from '../index';
import type { TypedPocketBase } from '../types';
import { allOf, eq } from '../utils/filter';
import { BaseMutator, type ListQuery, TypedRecordService } from './base';

export interface ImageSearchFilters {
  analysisStatus?: AnalysisStatus;
  imageType?: ImageType;
}

/** A paged query plus the image-specific filters. */
export type ImageListQuery = ListQuery & { filters?: ImageSearchFilters };

export class ImageMutator extends BaseMutator<Image, ImageInput> {
  constructor(pb: TypedPocketBase) {
    super(pb);
  }

  protected getCollection(): TypedRecordService<Image, ImageInput> {
    return this.pb.collection('Images') as unknown as TypedRecordService<
      Image,
      ImageInput
    >;
  }

  protected async validateInput(input: ImageInput): Promise<ImageInput> {
    // Validate the input using the schema
    return ImageInputSchema.parse(input);
  }

  /**
   * Upload an image file with metadata
   * @param file The image file to upload
   * @param userId The ID of the authenticated user (required)
   * @param imageType The type of image (item, container, or unprocessed)
   * @returns The created Image record
   */
  async uploadImage(
    file: File,
    userId: string,
    imageType: ImageType = 'unprocessed'
  ): Promise<Image> {
    try {
      if (!userId) {
        throw new Error('User ID is required to upload an image');
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('imageType', imageType);
      formData.append('analysisStatus', 'pending');
      formData.append('UserRef', userId);

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
    status: AnalysisStatus
  ): Promise<Image> {
    try {
      const data: Partial<ImageInput> = { analysisStatus: status };
      return await this.update(id, data as Partial<Image>);
    } catch (error) {
      return this.errorWrapper(error);
    }
  }

  /**
   * Build the filter expression `search()` uses.
   *
   * Images carry no free-text field worth matching, so the query argument is
   * accepted for symmetry with the other mutators and only the filters apply.
   */
  buildSearchFilter(filters?: ImageSearchFilters): string | undefined {
    const parts: string[] = [];

    if (filters?.analysisStatus) {
      parts.push(eq('analysisStatus', filters.analysisStatus));
    }
    if (filters?.imageType) {
      parts.push(eq('imageType', filters.imageType));
    }

    return allOf(parts);
  }

  /**
   * Search images by filters.
   *
   * @param options Filters plus the standard page/perPage/sort/expand
   * @returns A paged result, so callers can see the true total
   */
  async search(options: ImageListQuery = {}): Promise<ListResult<Image>> {
    try {
      const { filters, ...list } = options;
      return await this.getList({
        ...list,
        filter: this.buildSearchFilter(filters),
      });
    } catch (error) {
      return this.errorWrapper(error);
    }
  }

  /**
   * Get images by analysis status.
   *
   * @param status The analysis status to filter by
   * @param options The standard page/perPage/sort/expand
   * @returns A paged result
   */
  async getByAnalysisStatus(
    status: AnalysisStatus,
    options: ImageListQuery = {}
  ): Promise<ListResult<Image>> {
    const { filters, ...list } = options;
    return await this.search({
      ...list,
      filters: { ...filters, analysisStatus: status },
    });
  }

  /**
   * Get all images associated with an item
   * This includes the primary image and any images in ItemImages
   * @param itemId The item ID to filter by
   * @returns Array of Image records
   */
  async getByItemId(itemId: string): Promise<Image[]> {
    try {
      const images: Image[] = [];
      const imageIds = new Set<string>();

      // 1. Get the item to find its ImageRef
      const item = await this.pb.collection('Items').getOne(itemId);

      if (item && item.ImageRef) {
        const ImageRef = await this.getById(item.ImageRef);
        if (ImageRef) {
          images.push(ImageRef);
          imageIds.add(ImageRef.id);
        }
      }

      // 2. Get all historical/mapped images for this item
      const itemMappings = await this.pb.collection('ItemImages').getFullList({
        filter: `ItemRef = "${itemId}"`,
        sort: '-created',
      });

      // Fetch the actual image records for these mappings
      for (const mapping of itemMappings) {
        if (!imageIds.has(mapping.ImageRef)) {
          try {
            const mappedImage = await this.getById(mapping.ImageRef);
            if (mappedImage) {
              images.push(mappedImage);
              imageIds.add(mappedImage.id);
            }
          } catch (err) {
            console.error(
              `Failed to fetch mapped image ${mapping.ImageRef}:`,
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
   * This includes the primary image and any images in ContainerImages
   * @param containerId The container ID to filter by
   * @returns Array of Image records
   */
  async getByContainerId(containerId: string): Promise<Image[]> {
    try {
      const images: Image[] = [];
      const imageIds = new Set<string>();

      // 1. Get the container to find its ImageRef
      const container = await this.pb
        .collection('Containers')
        .getOne(containerId);

      if (container && container.ImageRef) {
        const ImageRef = await this.getById(container.ImageRef);
        if (ImageRef) {
          images.push(ImageRef);
          imageIds.add(ImageRef.id);
        }
      }

      // 2. Get all historical/mapped images for this container
      const containerMappings = await this.pb
        .collection('ContainerImages')
        .getFullList({
          filter: `ContainerRef = "${containerId}"`,
          sort: '-created',
        });

      // Fetch the actual image records for these mappings
      for (const mapping of containerMappings) {
        if (!imageIds.has(mapping.ImageRef)) {
          try {
            const mappedImage = await this.getById(mapping.ImageRef);
            if (mappedImage) {
              images.push(mappedImage);
              imageIds.add(mappedImage.id);
            }
          } catch (err) {
            console.error(
              `Failed to fetch mapped image ${mapping.ImageRef}:`,
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
   * Get the URL for an image file
   * @param image The Image record
   * @returns The URL to access the image file
   */
  getFileUrl(image: Image): string {
    return this.pb.files.getURL(image, image.file);
  }
}

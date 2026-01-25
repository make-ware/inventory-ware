import { z } from 'zod';
import {
  baseSchema,
  defineCollection,
  JSONField,
} from 'pocketbase-zod-schema/schema';
import { AnalysisResultSchema } from '../types/metadata.js';

export const ImageMetadataInputSchema = z.object({
  fileHash: z.string(),
  metadata: JSONField(AnalysisResultSchema),
  version: z.number().default(1),
  imageType: z
    .enum(['item', 'container', 'unprocessed'])
    .default('unprocessed'),
});

export const ImageMetadataSchema = ImageMetadataInputSchema.extend(baseSchema);

export const ImageMetadataCollection = defineCollection({
  schema: ImageMetadataSchema,
  collectionName: 'ImageMetadata',
  type: 'base',
  permissions: {
    // Anyone can list image metadata (adjust based on your auth requirements)
    listRule: '',
    // Anyone can view image metadata
    viewRule: '',
    // Authenticated Users can create image metadata
    createRule: '@request.auth.id != ""',
    // Authenticated Users can update image metadata
    updateRule: '@request.auth.id != ""',
    // Authenticated Users can delete image metadata
    deleteRule: '@request.auth.id != ""',
  },
  indexes: [
    // Unique index on fileHash for cache lookups
    'CREATE UNIQUE INDEX `idx_fileHash_image_metadata` ON `ImageMetadata` (`fileHash`)',
  ],
});

import { z } from 'zod';
import {
  baseSchema,
  defineCollection,
  RelationField,
  JSONField,
} from 'pocketbase-zod-schema/schema';
import { AnalysisResultSchema } from '../types/metadata.js';

export const ImageMetadataInputSchema = z.object({
  Image: RelationField({
    collection: 'Images',
  }).optional(),
  file_hash: z.string(),
  metadata: JSONField(AnalysisResultSchema),
  version: z.number().default(1),
  image_type: z
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
    // Unique index on file_hash for cache lookups
    'CREATE UNIQUE INDEX `idx_file_hash_image_metadata` ON `ImageMetadata` (`file_hash`)',
    // Index on Image relation for lookups by image
    'CREATE INDEX `idx_image_image_metadata` ON `ImageMetadata` (`Image`)',
  ],
});

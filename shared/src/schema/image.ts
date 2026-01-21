import {
  FileField,
  RelationField,
  baseSchema,
  defineCollection,
} from 'pocketbase-zod-schema/schema';
import { z } from 'zod';

// Define the Zod schema for image input (for creating new images)
export const ImageInputSchema = z.object({
  file: FileField(),
  image_type: z
    .enum(['item', 'container', 'unprocessed'])
    .default('unprocessed'),
  analysis_status: z
    .enum(['pending', 'processing', 'completed', 'failed'])
    .default('pending'),
});

// Define the Zod schema for image updates (all fields optional except validation rules)
// Internal update schema
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ImageUpdateSchema = z.object({
  file: FileField().optional(),
  image_type: z.enum(['item', 'container', 'unprocessed']).optional(),
  analysis_status: z
    .enum(['pending', 'processing', 'completed', 'failed'])
    .optional(),
});

// Database schema for the complete image record
// This includes the item and container relationships and timestamps
export const ImageSchema = z
  .object({
    file: FileField(),
    image_type: z
      .enum(['item', 'container', 'unprocessed'])
      .default('unprocessed'),
    analysis_status: z
      .enum(['pending', 'processing', 'completed', 'failed'])
      .default('pending'),
  })
  .extend(baseSchema);

// Define the collection with permissions
export const ImageCollection = defineCollection({
  schema: ImageSchema,
  collectionName: 'Images',
  type: 'base',
  permissions: {
    // Anyone can list images (adjust based on your auth requirements)
    listRule: '',
    // Anyone can view images
    viewRule: '',
    // Authenticated users can create images
    createRule: '@request.auth.id != ""',
    // Authenticated users can update images
    updateRule: '@request.auth.id != ""',
    // Authenticated users can delete images
    deleteRule: '@request.auth.id != ""',
  },
  indexes: [
    // Index on image_type for filtering
    'CREATE INDEX `idx_image_type_images` ON `images` (`image_type`)',
    // Index on analysis_status for filtering
    'CREATE INDEX `idx_analysis_status_images` ON `images` (`analysis_status`)',
    // Index on created field for chronological sorting
    'CREATE INDEX `idx_created_images` ON `images` (`created`)',
  ],
});

export default ImageCollection;

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
  file_hash: z.string().nullable().optional(),
  image_type: z
    .enum(['item', 'container', 'unprocessed'])
    .default('unprocessed'),
  analysis_status: z
    .enum(['pending', 'processing', 'completed', 'failed'])
    .default('pending'),
  User: RelationField({ collection: 'Users' }).optional(),
});

// Define the Zod schema for image updates (all fields optional except validation rules)
// Internal update schema
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ImageUpdateSchema = z.object({
  file: FileField().optional(),
  file_hash: z.string().nullable().optional(),
  image_type: z.enum(['item', 'container', 'unprocessed']).optional(),
  analysis_status: z
    .enum(['pending', 'processing', 'completed', 'failed'])
    .optional(),
  User: RelationField({ collection: 'Users' }).optional(),
});

// Database schema for the complete image record
// This includes the item and container relationships and timestamps
export const ImageSchema = z
  .object({
    file: FileField(),
    file_hash: z.string().nullable().optional(),
    image_type: z
      .enum(['item', 'container', 'unprocessed'])
      .default('unprocessed'),
    analysis_status: z
      .enum(['pending', 'processing', 'completed', 'failed'])
      .default('pending'),
    User: RelationField({ collection: 'Users' }).optional(),
  })
  .extend(baseSchema);

// Define the collection with permissions
export const ImageCollection = defineCollection({
  schema: ImageSchema,
  collectionName: 'Images',
  type: 'base',
  permissions: {
    // Users can only list their own images
    listRule: 'User = @request.auth.id',
    // Users can only view their own images
    viewRule: 'User = @request.auth.id',
    // Authenticated Users can create images
    createRule: '@request.auth.id != ""',
    // Users can only update their own images
    updateRule: 'User = @request.auth.id',
    // Users can only delete their own images
    deleteRule: 'User = @request.auth.id',
  },
  indexes: [
    // Index on User for efficient User-based queries
    'CREATE INDEX `idx_User_images` ON `images` (`User`)',
    // Index on image_type for filtering
    'CREATE INDEX `idx_image_type_images` ON `images` (`image_type`)',
    // Index on analysis_status for filtering
    'CREATE INDEX `idx_analysis_status_images` ON `images` (`analysis_status`)',
    // Index on created field for chronological sorting
    'CREATE INDEX `idx_created_images` ON `images` (`created`)',
  ],
});

export default ImageCollection;

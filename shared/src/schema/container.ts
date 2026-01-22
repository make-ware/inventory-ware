import {
  RelationField,
  baseSchema,
  defineCollection,
} from 'pocketbase-zod-schema/schema';
import { z } from 'zod';
import { BoundingBoxSchema } from '../types/bounding-box.js';

// Define the Zod schema for container input (for creating new containers)
export const ContainerInputSchema = z.object({
  container_label: z.string().min(1, 'Container label is required'),
  container_notes: z.string().optional().default(''),
  primary_image: RelationField({ collection: 'Images' }).optional(),
  primary_image_bbox: BoundingBoxSchema.optional(),
  User: RelationField({ collection: 'Users' }).optional(),
});

// Define the Zod schema for container updates (all fields optional except validation rules)
// Internal update schema

export const ContainerUpdateSchema = z.object({
  container_label: z.string().min(1, 'Container label is required').optional(),
  container_notes: z.string().optional(),
  primary_image: RelationField({ collection: 'Images' }).optional(),
  primary_image_bbox: BoundingBoxSchema.optional(),
  User: RelationField({ collection: 'Users' }).optional(),
});

// Database schema for the complete container record
// This includes the image relationship and timestamps
export const ContainerSchema = z
  .object({
    container_label: z.string().min(1, 'Container label is required'),
    container_notes: z.string().default(''),
    primary_image: RelationField({ collection: 'Images' }).optional(),
    primary_image_bbox: BoundingBoxSchema.optional(),
    User: RelationField({ collection: 'Users' }).optional(),
  })
  .extend(baseSchema);

// Define the collection with permissions
export const ContainerCollection = defineCollection({
  schema: ContainerSchema,
  collectionName: 'Containers',
  type: 'base',
  permissions: {
    // Users can only list their own containers
    listRule: 'User = @request.auth.id',
    // Users can only view their own containers
    viewRule: 'User = @request.auth.id',
    // Authenticated Users can create containers
    createRule: '@request.auth.id != ""',
    // Users can only update their own containers
    updateRule: 'User = @request.auth.id',
    // Users can only delete their own containers
    deleteRule: 'User = @request.auth.id',
  },
  indexes: [
    // Index on User for efficient User-based queries
    'CREATE INDEX `idx_User_containers` ON `containers` (`User`)',
    // Index on created field for chronological sorting
    'CREATE INDEX `idx_created_containers` ON `containers` (`created`)',
    // Index on container_label for search
    'CREATE INDEX `idx_label_containers` ON `containers` (`container_label`)',
  ],
});

export default ContainerCollection;

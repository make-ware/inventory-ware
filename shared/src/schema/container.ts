import {
  RelationField,
  baseSchema,
  defineCollection,
} from 'pocketbase-zod-schema/schema';
import { z } from 'zod';
import { BoundingBoxSchema } from '../types/bounding-box.js';

// Define the Zod schema for container input (for creating new containers)
export const ContainerInputSchema = z.object({
  containerLabel: z.string().min(1, 'Container label is required'),
  containerNotes: z.string().optional().default(''),
  ImageRef: RelationField({ collection: 'Images' }).optional(),
  boundingBox: BoundingBoxSchema.optional(),
  UserRef: RelationField({ collection: 'Users' }),
});

// Define the Zod schema for container update (all fields optional)
export const ContainerUpdateSchema = z.object({
  containerLabel: z.string().min(1, 'Container label is required').optional(),
  containerNotes: z.string().optional(),
  ImageRef: RelationField({ collection: 'Images' }).optional(),
  boundingBox: BoundingBoxSchema.optional(),
});

// Database schema for the complete container record
// This includes the image relationship and timestamps
export const ContainerSchema = z
  .object({
    containerLabel: z.string().min(1, 'Container label is required'),
    containerNotes: z.string().default(''),
    ImageRef: RelationField({ collection: 'Images' }).optional(),
    boundingBox: BoundingBoxSchema.optional(),
    UserRef: RelationField({ collection: 'Users' }),
  })
  .extend(baseSchema);

// Define the collection with permissions
export const ContainerCollection = defineCollection({
  schema: ContainerSchema,
  collectionName: 'Containers',
  type: 'base',
  permissions: {
    // Users can only list their own containers
    listRule: 'UserRef = @request.auth.id',
    // Users can only view their own containers
    viewRule: 'UserRef = @request.auth.id',
    // Authenticated Users can create containers
    createRule: '@request.auth.id != ""',
    // Users can only update their own containers
    updateRule: 'UserRef = @request.auth.id',
    // Users can only delete their own containers
    deleteRule: 'UserRef = @request.auth.id',
  },
  indexes: [
    // Index on UserRef for efficient UserRef-based queries
    'CREATE INDEX `idx_UserRef_containers` ON `containers` (`UserRef`)',
    // Index on created field for chronological sorting
    'CREATE INDEX `idx_created_containers` ON `containers` (`created`)',
    // Index on containerLabel for search
    'CREATE INDEX `idx_label_containers` ON `containers` (`containerLabel`)',
  ],
});

export default ContainerCollection;

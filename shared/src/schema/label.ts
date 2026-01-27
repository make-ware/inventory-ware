import {
  RelationField,
  baseSchema,
  defineCollection,
} from 'pocketbase-zod-schema/schema';
import { z } from 'zod';

// Define the Zod schema for label input (for creating new labels)
export const LabelInputSchema = z.object({
  ItemRef: RelationField({ collection: 'Items' }).optional(),
  ContainerRef: RelationField({ collection: 'Containers' }).optional(),
  format: z.string().min(1, 'Format is required'),
  data: z.any().optional(),
});

// Define the Zod schema for label update (all fields optional)
export const LabelUpdateSchema = z.object({
  ItemRef: RelationField({ collection: 'Items' }).optional(),
  ContainerRef: RelationField({ collection: 'Containers' }).optional(),
  format: z.string().min(1, 'Format is required').optional(),
  data: z.any().optional(),
});

// Database schema for the complete label record
// This includes the item/container relationships and timestamps
export const LabelSchema = z
  .object({
    ItemRef: RelationField({ collection: 'Items' }).optional(),
    ContainerRef: RelationField({ collection: 'Containers' }).optional(),
    format: z.string().min(1, 'Format is required'),
    data: z.any().optional(),
  })
  .extend(baseSchema);

// Define the collection with permissions
export const LabelCollection = defineCollection({
  schema: LabelSchema,
  collectionName: 'Labels',
  type: 'base',
  permissions: {
    // Authenticated users can list labels
    listRule: '@request.auth.id != ""',
    // Authenticated users can view labels
    viewRule: '@request.auth.id != ""',
    // Authenticated users can create labels
    createRule: '@request.auth.id != ""',
    // No one can update labels
    updateRule: null,
    // No one can delete labels
    deleteRule: null,
  },
  indexes: [
    // Index on type for filtering by label type
    // Index on item for efficient item-based queries
    'CREATE INDEX `idx_item_labels` ON `labels` (`ItemRef`)',
    // Index on container for efficient container-based queries
    'CREATE INDEX `idx_container_labels` ON `labels` (`ContainerRef`)',
    // Index on created field for chronological sorting
    'CREATE INDEX `idx_created_labels` ON `labels` (`created`)',
  ],
});

export default LabelCollection;

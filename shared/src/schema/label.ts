import {
  RelationField,
  baseSchema,
  defineCollection,
} from 'pocketbase-zod-schema';
import { z } from 'zod';

// Define the Zod schema for label input (for creating new labels)
// `id` may be supplied explicitly: the Labels collection forbids updates
// (updateRule: null), so callers that embed the record id in the stored data
// must pre-generate the id and create in one shot.
export const LabelInputSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9]{15}$/, 'Label id must be 15 chars of [a-z0-9]')
    .optional(),
  ItemRef: RelationField({ collection: 'Items' }).optional(),
  ContainerRef: RelationField({ collection: 'Containers' }).optional(),
  format: z.string().min(1, 'Format is required'),
  data: z.string().optional(),
});

// Define the Zod schema for label update (all fields optional)
export const LabelUpdateSchema = z.object({
  ItemRef: RelationField({ collection: 'Items' }).optional(),
  ContainerRef: RelationField({ collection: 'Containers' }).optional(),
  format: z.string().min(1, 'Format is required').optional(),
  data: z.string().optional(),
});

// Database schema for the complete label record
// This includes the item/container relationships and timestamps
export const LabelSchema = z
  .object({
    ItemRef: RelationField({ collection: 'Items' }).optional(),
    ContainerRef: RelationField({ collection: 'Containers' }).optional(),
    format: z.string().min(1, 'Format is required'),
    data: z.string().optional(),
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

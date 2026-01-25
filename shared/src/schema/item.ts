import {
  RelationField,
  baseSchema,
  defineCollection,
} from 'pocketbase-zod-schema/schema';
import { z } from 'zod';
import { BoundingBoxSchema } from '../types/bounding-box.js';
import { slugify } from '../utils/slugify.js';

// Schema for individual item attributes (key-value pairs)
export const ItemAttributeSchema = z.object({
  name: z
    .string()
    .describe('Attribute name (e.g., Input Voltage, Quantity)')
    .transform(slugify),
  value: z
    .string()
    .describe('Attribute value (e.g., 12.0 Volts, 100 Count)')
    .transform(slugify),
});

// Define the Zod schema for item input (for creating new items)
export const ItemInputSchema = z.object({
  itemLabel: z.string().min(1, 'Item label is required'),
  itemName: z.string().optional().default(''),
  itemNotes: z.string().optional().default(''),
  categoryFunctional: z
    .string()
    .min(1, 'Functional category is required')
    .describe('Functional category (e.g., Tools, Electronics)')
    .transform(slugify),
  categorySpecific: z
    .string()
    .min(1, 'Specific category is required')
    .describe('Specific category (e.g., Power Tools, Sensors)')
    .transform(slugify),
  itemType: z
    .string()
    .min(1, 'Item type is required')
    .describe('Item type (e.g., Drill, Arduino)')
    .transform(slugify),
  itemManufacturer: z.string().optional().default(''),
  itemAttributes: z.array(ItemAttributeSchema).optional().default([]),
  ContainerRef: RelationField({ collection: 'Containers' }).optional(),
  ImageRef: RelationField({ collection: 'Images' }).optional(),
  boundingBox: BoundingBoxSchema.optional(),
  UserRef: RelationField({ collection: 'Users' }),
});

// Define the Zod schema for item update (all fields optional)
export const ItemUpdateSchema = z.object({
  itemLabel: z.string().min(1, 'Item label is required').optional(),
  itemName: z.string().optional(),
  itemNotes: z.string().optional(),
  categoryFunctional: z
    .string()
    .min(1, 'Functional category is required')
    .describe('Functional category (e.g., Tools, Electronics)')
    .transform(slugify)
    .optional(),
  categorySpecific: z
    .string()
    .min(1, 'Specific category is required')
    .describe('Specific category (e.g., Power Tools, Sensors)')
    .transform(slugify)
    .optional(),
  itemType: z
    .string()
    .min(1, 'Item type is required')
    .describe('Item type (e.g., Drill, Arduino)')
    .transform(slugify)
    .optional(),
  itemManufacturer: z.string().optional(),
  itemAttributes: z.array(ItemAttributeSchema).optional(),
  ContainerRef: RelationField({ collection: 'Containers' }).optional(),
  ImageRef: RelationField({ collection: 'Images' }).optional(),
  boundingBox: BoundingBoxSchema.optional(),
});

// Database schema for the complete item record
// This includes the container and image relationships and timestamps
export const ItemSchema = z
  .object({
    itemLabel: z.string().min(1, 'Item label is required'),
    itemName: z.string().default(''),
    itemNotes: z.string().default(''),
    categoryFunctional: z
      .string()
      .min(1, 'Functional category is required')
      .describe('Functional category (e.g., Tools, Electronics)')
      .transform(slugify),
    categorySpecific: z
      .string()
      .min(1, 'Specific category is required')
      .describe('Specific category (e.g., Power Tools, Sensors)')
      .transform(slugify),
    itemType: z
      .string()
      .min(1, 'Item type is required')
      .describe('Item type (e.g., Drill, Arduino)')
      .transform(slugify),
    itemManufacturer: z.string().default(''),
    itemAttributes: z.array(ItemAttributeSchema).default([]),
    ContainerRef: RelationField({ collection: 'Containers' }).optional(),
    ImageRef: RelationField({ collection: 'Images' }).optional(),
    boundingBox: BoundingBoxSchema.optional(),
    UserRef: RelationField({ collection: 'Users' }),
  })
  .extend(baseSchema);

// Define the collection with permissions
export const ItemCollection = defineCollection({
  schema: ItemSchema,
  collectionName: 'Items',
  type: 'base',
  permissions: {
    // Users can only list their own items
    listRule: 'UserRef = @request.auth.id',
    // Users can only view their own items
    viewRule: 'UserRef = @request.auth.id',
    // Authenticated Users can create items
    createRule: '@request.auth.id != ""',
    // Users can only update their own items
    updateRule: 'UserRef = @request.auth.id',
    // Users can only delete their own items
    deleteRule: 'UserRef = @request.auth.id',
  },
  indexes: [
    // Index on UserRef for efficient UserRef-based queries
    'CREATE INDEX `idx_UserRef_items` ON `items` (`UserRef`)',
    // Index on category fields for efficient filtering
    'CREATE INDEX `idx_categoryFunctional_items` ON `items` (`categoryFunctional`)',
    'CREATE INDEX `idx_categorySpecific_items` ON `items` (`categorySpecific`)',
    'CREATE INDEX `idx_itemType_items` ON `items` (`itemType`)',
    // Index on container for efficient relationship queries
    'CREATE INDEX `idx_container_items` ON `items` (`container`)',
    // Index on created field for chronological sorting
    'CREATE INDEX `idx_created_items` ON `items` (`created`)',
    // Composite index for search optimization
    'CREATE INDEX `idx_search_items` ON `items` (`itemType`, `itemName`, `itemLabel`)',
  ],
});

export default ItemCollection;

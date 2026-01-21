import {
  RelationField,
  baseSchema,
  defineCollection,
} from 'pocketbase-zod-schema/schema';
import { z } from 'zod';
import { BoundingBoxSchema } from '../types/bounding-box.js';

// Schema for individual item attributes (key-value pairs)
export const ItemAttributeSchema = z.object({
  name: z.string().describe('Attribute name (e.g., Input Voltage, Quantity)'),
  value: z.string().describe('Attribute value (e.g., 12.0 Volts, 100 Count)'),
});

// Define the Zod schema for item input (for creating new items)
export const ItemInputSchema = z.object({
  item_label: z.string().min(1, 'Item label is required'),
  item_notes: z.string().optional().default(''),
  category_functional: z
    .string()
    .min(1, 'Functional category is required')
    .describe('Functional category (e.g., Tools, Electronics)'),
  category_specific: z
    .string()
    .min(1, 'Specific category is required')
    .describe('Specific category (e.g., Power Tools, Sensors)'),
  item_type: z
    .string()
    .min(1, 'Item type is required')
    .describe('Item type (e.g., Drill, Arduino)'),
  item_manufacturer: z.string().optional().default(''),
  item_attributes: z.array(ItemAttributeSchema).optional().default([]),
  container: RelationField({ collection: 'Containers' }).optional(),
  primary_image: RelationField({ collection: 'Images' }).optional(),
  primary_image_bbox: BoundingBoxSchema.optional(),
});

// Define the Zod schema for item updates (all fields optional except validation rules)
// Internal update schema
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const ItemUpdateSchema = z.object({
  item_label: z.string().min(1, 'Item label is required').optional(),
  item_notes: z.string().optional(),
  category_functional: z
    .string()
    .min(1, 'Functional category is required')
    .optional(),
  category_specific: z
    .string()
    .min(1, 'Specific category is required')
    .optional(),
  item_type: z.string().min(1, 'Item type is required').optional(),
  item_manufacturer: z.string().optional(),
  item_attributes: z.array(ItemAttributeSchema).optional(),
  container: RelationField({ collection: 'Containers' }).optional(),
  primary_image: RelationField({ collection: 'Images' }).optional(),
  primary_image_bbox: BoundingBoxSchema.optional(),
});

// Database schema for the complete item record
// This includes the container and image relationships and timestamps
export const ItemSchema = z
  .object({
    item_label: z.string().min(1, 'Item label is required'),
    item_notes: z.string().default(''),
    category_functional: z
      .string()
      .min(1, 'Functional category is required')
      .describe('Functional category (e.g., Tools, Electronics)'),
    category_specific: z
      .string()
      .min(1, 'Specific category is required')
      .describe('Specific category (e.g., Power Tools, Sensors)'),
    item_type: z
      .string()
      .min(1, 'Item type is required')
      .describe('Item type (e.g., Drill, Arduino)'),
    item_manufacturer: z.string().default(''),
    item_attributes: z.array(ItemAttributeSchema).default([]),
    container: RelationField({ collection: 'Containers' }).optional(),
    primary_image: RelationField({ collection: 'Images' }).optional(),
    primary_image_bbox: BoundingBoxSchema.optional(),
  })
  .extend(baseSchema);

// Define the collection with permissions
export const ItemCollection = defineCollection({
  schema: ItemSchema,
  collectionName: 'Items',
  type: 'base',
  permissions: {
    // Anyone can list items (adjust based on your auth requirements)
    listRule: '',
    // Anyone can view items
    viewRule: '',
    // Authenticated users can create items
    createRule: '@request.auth.id != ""',
    // Authenticated users can update items
    updateRule: '@request.auth.id != ""',
    // Authenticated users can delete items
    deleteRule: '@request.auth.id != ""',
  },
  indexes: [
    // Index on category fields for efficient filtering
    'CREATE INDEX `idx_category_functional_items` ON `items` (`category_functional`)',
    'CREATE INDEX `idx_category_specific_items` ON `items` (`category_specific`)',
    'CREATE INDEX `idx_item_type_items` ON `items` (`item_type`)',
    // Index on container for efficient relationship queries
    'CREATE INDEX `idx_container_items` ON `items` (`container`)',
    // Index on created field for chronological sorting
    'CREATE INDEX `idx_created_items` ON `items` (`created`)',
    // Composite index for search optimization
    'CREATE INDEX `idx_search_items` ON `items` (`item_label`, `category_functional`)',
  ],
});

export default ItemCollection;

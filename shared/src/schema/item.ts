import {
  RelationField,
  baseSchema,
  defineCollection,
} from 'pocketbase-zod-schema';
import { z } from 'zod';
import { BoundingBoxSchema } from '../types/bounding-box.js';
import { CURRENCY_CODE_PATTERN, DEFAULT_CURRENCY } from '../utils/item-value.js';
import { pbOptional } from '../utils/pb-optional.js';
import { slugify } from '../utils/slugify.js';

// One currency shared by both value fields — never one per field. The AI
// prompt still guesses a bare number; this applies at display.
const valueCurrencyInput = z
  .string()
  .regex(
    CURRENCY_CODE_PATTERN,
    'Currency must be a 3-letter ISO 4217 code (e.g. USD)'
  )
  .optional()
  .default(DEFAULT_CURRENCY);
const valueCurrencyPatch = pbOptional(
  z
    .string()
    .regex(
      CURRENCY_CODE_PATTERN,
      'Currency must be a 3-letter ISO 4217 code (e.g. USD)'
    )
);

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
  // PocketBase returns `null` for unset json columns — tolerate it while
  // preserving the `[]` default (see issue #57).
  itemAttributes: z
    .array(ItemAttributeSchema)
    .nullish()
    .transform((v) => v ?? []),
  // The authoritative value: manual, user-entered only. No AI path ever writes
  // it — see `webapp/src/services/inventory.ts`.
  itemValue: pbOptional(z.number().nonnegative()),
  // The suggested value: AI image analysis writes it when AI_ESTIMATE_VALUE is
  // on (from `suggestedValue` in `shared/src/types/metadata.ts`) and may
  // overwrite it on re-analysis. Editable by hand too, for a fuzzy number the
  // user does not want to promote to `itemValue`.
  estimatedValue: pbOptional(z.number().nonnegative()),
  valueCurrency: valueCurrencyInput,
  ContainerRef: pbOptional(RelationField({ collection: 'Containers' })),
  ImageRef: pbOptional(RelationField({ collection: 'Images' })),
  boundingBox: pbOptional(BoundingBoxSchema),
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
  itemAttributes: pbOptional(z.array(ItemAttributeSchema)),
  itemValue: pbOptional(z.number().nonnegative()),
  estimatedValue: pbOptional(z.number().nonnegative()),
  valueCurrency: valueCurrencyPatch,
  ContainerRef: pbOptional(RelationField({ collection: 'Containers' })),
  ImageRef: pbOptional(RelationField({ collection: 'Images' })),
  boundingBox: pbOptional(BoundingBoxSchema),
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
    // Both stay `.optional()` rather than `.default(0)`: PocketBase already
    // guarantees the key is present on every record it returns (a number
    // column has no "unset" — it reads back as `0`), so the only records
    // missing it are ones built locally in tests. Read them through
    // `getEffectiveItemValue`, which treats `0`, `null` and `undefined`
    // alike as "no value recorded".
    itemValue: z.number().nonnegative().optional(),
    estimatedValue: z.number().nonnegative().optional(),
    // Always present on paper: new writes carry it via the input default
    // above. Pre-migration rows read back as `""` (a text column has no
    // "unset" distinct from empty), so display goes through
    // `resolveItemCurrency`, which treats that as USD.
    valueCurrency: z
      .string()
      .regex(
        CURRENCY_CODE_PATTERN,
        'Currency must be a 3-letter ISO 4217 code (e.g. USD)'
      )
      .optional()
      .default(DEFAULT_CURRENCY),
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

import {
  RelationField,
  baseSchema,
  defineCollection,
} from 'pocketbase-zod-schema/schema';
import { z } from 'zod';

// Schema for tracking snapshots of Item history
export const ItemRecordSchema = z
  .object({
    Item: RelationField({ collection: 'Items', cascadeDelete: true }),
    User: RelationField({ collection: 'Users' }).optional(),
    transaction: z.enum(['create', 'update', 'delete']),
    field_name: z.string().nullish().describe('Name of the field that changed'),
    new_value: z.string().describe('New value of the changed field'),
    previous_value: z
      .string()
      .optional()
      .describe('Previous value of the changed field'),
  })
  .extend(baseSchema);

export const ItemRecordCollection = defineCollection({
  schema: ItemRecordSchema,
  collectionName: 'ItemRecords',
  type: 'base',
  permissions: {
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != ""',
    deleteRule: '@request.auth.id != ""',
  },
  indexes: [
    'CREATE INDEX `idx_item_item_records` ON `item_records` (`item`)',
    'CREATE INDEX `idx_created_item_records` ON `item_records` (`created`)',
  ],
});

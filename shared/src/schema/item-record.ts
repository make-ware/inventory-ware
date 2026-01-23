import {
  RelationField,
  SelectField,
  TextField,
  baseSchema,
  defineCollection,
} from 'pocketbase-zod-schema/schema';
import { z } from 'zod';

// Schema for tracking snapshots of Item history
export const ItemRecordSchema = z
  .object({
    ItemRef: RelationField({ collection: 'Items', cascadeDelete: true }),
    UserRef: RelationField({ collection: 'Users' }),
    transactionType: SelectField(['create', 'update', 'delete']),
    fieldName: TextField().nullish().describe('Name of the field that changed'),
    newValue: TextField().describe('New value of the changed field'),
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
  indexes: [],
});

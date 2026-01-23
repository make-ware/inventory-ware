import {
  RelationField,
  SelectField,
  TextField,
  defineCollection,
  baseSchema,
} from 'pocketbase-zod-schema/schema';
import { z } from 'zod';

// Schema for tracking snapshots of Container history
export const ContainerRecordSchema = z
  .object({
    ContainerRef: RelationField({
      collection: 'Containers',
      cascadeDelete: true,
    }),
    UserRef: RelationField({ collection: 'Users' }),
    transactionType: SelectField(['create', 'update', 'delete']),
    fieldName: TextField().nullish().describe('Name of the field that changed'),
    newValue: TextField().describe('New value of the changed field'),
  })
  .extend(baseSchema);

export const ContainerRecordCollection = defineCollection({
  schema: ContainerRecordSchema,
  collectionName: 'ContainerRecords',
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

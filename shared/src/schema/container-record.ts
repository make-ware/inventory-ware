import {
  RelationField,
  defineCollection,
  baseSchema,
} from 'pocketbase-zod-schema/schema';
import { z } from 'zod';

// Schema for tracking snapshots of Container history
export const ContainerRecordSchema = z
  .object({
    Container: RelationField({ collection: 'Containers' }),
    User: RelationField({ collection: 'Users' }).optional(),
    transaction: z.enum(['create', 'update', 'delete']),
    fieldName: z.string().nullish().describe('Name of the field that changed'),
    newValue: z.string().describe('New value of the changed field'),
    previousValue: z.string().describe('Previous value of the changed field'),
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
  indexes: [
    'CREATE INDEX `idx_container_container_records` ON `container_records` (`container`)',
    'CREATE INDEX `idx_created_container_records` ON `container_records` (`created`)',
  ],
});

import {
  RelationField,
  baseSchema,
  defineCollection,
} from 'pocketbase-zod-schema/schema';
import z from 'zod';
import { BoundingBoxSchema } from '../types/bounding-box.js';

// Mapping for Container image history
export const ContainerImageMappingSchema = z
  .object({
    ContainerRef: RelationField({
      collection: 'Containers',
      cascadeDelete: true,
    }),
    ImageRef: RelationField({ collection: 'Images', cascadeDelete: true }),
    boundingBox: BoundingBoxSchema.optional(),
  })
  .extend(baseSchema);

export const ContainerImageMappingCollection = defineCollection({
  schema: ContainerImageMappingSchema,
  collectionName: 'ContainerImages',
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

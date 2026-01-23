import {
  RelationField,
  baseSchema,
  defineCollection,
} from 'pocketbase-zod-schema/schema';
import { z } from 'zod';
import { BoundingBoxSchema } from '../types/bounding-box.js';

// Mapping for Item image history
export const ItemImageMappingSchema = z
  .object({
    ItemRef: RelationField({ collection: 'Items', cascadeDelete: true }),
    ImageRef: RelationField({ collection: 'Images', cascadeDelete: true }),
    boundingBox: BoundingBoxSchema.optional(),
  })
  .extend(baseSchema);

export const ItemImageMappingCollection = defineCollection({
  schema: ItemImageMappingSchema,
  collectionName: 'ItemImages',
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

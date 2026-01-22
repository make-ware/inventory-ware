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
    container: RelationField({ collection: 'Containers', cascadeDelete: true }),
    image: RelationField({ collection: 'Images', cascadeDelete: true }),
    bounding_box: BoundingBoxSchema.optional(),
    primary_image_bbox: BoundingBoxSchema.optional(),
  })
  .extend(baseSchema);

export const ContainerImageMappingCollection = defineCollection({
  schema: ContainerImageMappingSchema,
  collectionName: 'ContainerImageMappings',
  type: 'base',
  permissions: {
    listRule: '@request.auth.id != ""',
    viewRule: '@request.auth.id != ""',
    createRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != ""',
    deleteRule: '@request.auth.id != ""',
  },
  indexes: [
    'CREATE INDEX `idx_container_container_image_mappings` ON `container_image_mappings` (`container`)',
    'CREATE INDEX `idx_image_container_image_mappings` ON `container_image_mappings` (`image`)',
  ],
});

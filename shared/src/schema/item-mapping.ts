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
        item: RelationField({ collection: 'Items' }),
        image: RelationField({ collection: 'Images' }),
        bounding_box: BoundingBoxSchema.optional(),
        primary_image_bbox: BoundingBoxSchema.optional(),
    })
    .extend(baseSchema);

export const ItemImageMappingCollection = defineCollection({
    schema: ItemImageMappingSchema,
    collectionName: 'ItemImageMappings',
    type: 'base',
    permissions: {
        listRule: '@request.auth.id != ""',
        viewRule: '@request.auth.id != ""',
        createRule: '@request.auth.id != ""',
        updateRule: '@request.auth.id != ""',
        deleteRule: '@request.auth.id != ""',
    },
    indexes: [
        'CREATE INDEX `idx_item_item_image_mappings` ON `item_image_mappings` (`item`)',
        'CREATE INDEX `idx_image_item_image_mappings` ON `item_image_mappings` (`image`)',
    ],
});



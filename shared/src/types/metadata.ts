import { z } from 'zod';
import { ItemAttributeSchema } from '../schema/item.js';
import { slugify, formatCategoryLabel } from '../utils/slugify.js';

export { slugify, formatCategoryLabel };

// Schema for AI to extract item metadata from images
// Note: This is for AI analysis output, not database storage
export const ItemMetadataSchema = z.object({
  itemLabel: z.string().describe('Label of the item'),
  itemNotes: z.string().describe('Additional notes about the item'),
  categoryFunctional: z
    .string()
    .describe(
      'Functional category (e.g., Tools, Electronics, Materials, Technology)'
    )
    .transform(slugify),
  categorySpecific: z
    .string()
    .describe(
      'Specific category (e.g., Power Tools, Fasteners, Sensors, Computer Components)'
    )
    .transform(slugify),
  itemType: z
    .string()
    .describe('Type of object (e.g., Drill, Screws, CPU Heatsink)')
    .transform(slugify),
  itemName: z.string().describe('The specific name of the item'),
  itemManufacturer: z
    .string()
    .describe('Specific brand or manufacturer of item'),
  itemAttributes: z
    .array(ItemAttributeSchema)
    .describe('Array of key-value pairs for item-specific attributes'),
});

// Schema for item image metadata (includes image-level fields)
export const ItemImageMetadataSchema = z.object({
  imageLabel: z.string().describe('Descriptive label for the image'),
  imageNotes: z
    .string()
    .describe('Additional notes about the image content or context'),
  item: ItemMetadataSchema,
});

// Schema for container metadata
export const ContainerMetadataSchema = z.object({
  containerLabel: z.string().describe('Label of the container'),
  containerNotes: z.string().describe('Notes about the container'),
  containerItems: z
    .array(ItemMetadataSchema)
    .describe('Array of items contained within this container'),
});

// Schema for container image metadata (includes image-level fields)
export const ContainerImageMetadataSchema = z.object({
  imageLabel: z.string().describe('Descriptive label for the container image'),
  imageNotes: z
    .string()
    .describe('Notes about the container image content or context'),
  container: ContainerMetadataSchema,
});

// Discriminated union for AI analysis result
export const AnalysisResultSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('item'), data: ItemImageMetadataSchema }),
  z.object({
    type: z.literal('container'),
    data: ContainerImageMetadataSchema,
  }),
]);

// Export types
export type ItemMetadata = z.infer<typeof ItemMetadataSchema>;
export type ItemImageMetadata = z.infer<typeof ItemImageMetadataSchema>;
export type ContainerMetadata = z.infer<typeof ContainerMetadataSchema>;
export type ContainerImageMetadata = z.infer<
  typeof ContainerImageMetadataSchema
>;
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

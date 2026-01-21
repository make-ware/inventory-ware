import { z } from 'zod';
import { ItemAttributeSchema } from '../schema/item.js';

// Schema for AI to extract item metadata from images
// Note: This is for AI analysis output, not database storage
export const ItemMetadataSchema = z.object({
  item_label: z.string().describe('Label of the item'),
  item_notes: z.string().describe('Additional notes about the item'),
  category_functional: z
    .string()
    .describe(
      'Functional category (e.g., Tools, Electronics, Materials, Technology)'
    ),
  category_specific: z
    .string()
    .describe(
      'Specific category (e.g., Power Tools, Fasteners, Sensors, Computer Components)'
    ),
  item_type: z
    .string()
    .describe(
      'Type of object (e.g., Drill, Screws, 9DOF Sensor, CPU Heatsink)'
    ),
  item_manufacturer: z
    .string()
    .describe('Specific brand or manufacturer of item'),
  item_attributes: z
    .array(ItemAttributeSchema)
    .describe('Array of key-value pairs for item-specific attributes'),
});

// Schema for item image metadata (includes image-level fields)
export const ItemImageMetadataSchema = z.object({
  image_label: z.string().describe('Descriptive label for the image'),
  image_notes: z
    .string()
    .describe('Additional notes about the image content or context'),
  item: ItemMetadataSchema,
});

// Schema for container metadata
export const ContainerMetadataSchema = z.object({
  container_label: z.string().describe('Label of the container'),
  container_notes: z.string().describe('Notes about the container'),
  container_items: z
    .array(ItemMetadataSchema)
    .describe('Array of items contained within this container'),
});

// Schema for container image metadata (includes image-level fields)
export const ContainerImageMetadataSchema = z.object({
  image_label: z.string().describe('Descriptive label for the container image'),
  image_notes: z
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

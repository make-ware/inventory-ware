import {
  FileField,
  RelationField,
  baseSchema,
  defineCollection,
} from 'pocketbase-zod-schema';
import { z } from 'zod';

/**
 * The canonical image enumerations.
 *
 * Exported as const tuples so consumers (the CLI's `--type`/`--status` flags,
 * mutator signatures) can validate against the same list the schemas use,
 * instead of redeclaring it and drifting.
 */
export const IMAGE_TYPES = ['item', 'container', 'unprocessed'] as const;
export const ANALYSIS_STATUSES = [
  'pending',
  'processing',
  'completed',
  'failed',
] as const;

export type ImageType = (typeof IMAGE_TYPES)[number];
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

// Define the Zod schema for image input (for creating new images)
export const ImageInputSchema = z.object({
  file: FileField(),
  fileHash: z.string().nullable().optional(),
  imageType: z.enum(IMAGE_TYPES).default('unprocessed'),
  analysisStatus: z.enum(ANALYSIS_STATUSES).default('pending'),
  UserRef: RelationField({ collection: 'Users' }),
});

// Define the Zod schema for image update (all fields optional)
export const ImageUpdateSchema = z.object({
  file: FileField().optional(),
  fileHash: z.string().nullable().optional(),
  imageType: z.enum(IMAGE_TYPES).optional(),
  analysisStatus: z.enum(ANALYSIS_STATUSES).optional(),
  UserRef: RelationField({ collection: 'Users' }).optional(),
});

// Database schema for the complete image record
// This includes the item and container relationships and timestamps
export const ImageSchema = z
  .object({
    file: FileField(),
    fileHash: z.string().nullable().optional(),
    imageType: z.enum(IMAGE_TYPES).default('unprocessed'),
    analysisStatus: z.enum(ANALYSIS_STATUSES).default('pending'),
    UserRef: RelationField({ collection: 'Users' }),
  })
  .extend(baseSchema);

// Define the collection with permissions
export const ImageCollection = defineCollection({
  schema: ImageSchema,
  collectionName: 'Images',
  type: 'base',
  permissions: {
    // Users can only list their own images
    listRule: 'UserRef = @request.auth.id',
    // Users can only view their own images
    viewRule: 'UserRef = @request.auth.id',
    // Authenticated Users can create images
    createRule: '@request.auth.id != ""',
    // Users can only update their own images
    updateRule: 'UserRef = @request.auth.id',
    // Users can only delete their own images
    deleteRule: 'UserRef = @request.auth.id',
  },
  indexes: [
    // Index on UserRef for efficient UserRef-based queries
    'CREATE INDEX `idx_UserRef_images` ON `images` (`UserRef`)',
    // Index on imageType for filtering
    'CREATE INDEX `idx_imageType_images` ON `images` (`imageType`)',
    // Index on analysisStatus for filtering
    'CREATE INDEX `idx_analysisStatus_images` ON `images` (`analysisStatus`)',
    // Index on created field for chronological sorting
    'CREATE INDEX `idx_created_images` ON `images` (`created`)',
  ],
});

export default ImageCollection;

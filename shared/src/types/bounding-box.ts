import { z } from 'zod';

// Shared bounding box schema for images
export const BoundingBoxSchema = z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
});

export type BoundingBox = z.infer<typeof BoundingBoxSchema>;

import { z } from 'zod';

export const LabelSchema = z.object({
  id: z.string(),
  created: z.string(),
  updated: z.string(),
  collectionId: z.string(),
  collectionName: z.literal('Labels'),
  type: z.enum(['item', 'container']),
  item: z.string().optional(),
  container: z.string().optional(),
  format: z.string(),
  data: z.any().optional(),
});

export type Label = z.infer<typeof LabelSchema>;

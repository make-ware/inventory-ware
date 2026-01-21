// Shared TypeScript types

import PocketBase from 'pocketbase';
import type { RecordService } from 'pocketbase';
import { z } from 'zod';
import { UserInputSchema, UserSchema } from '../schema/user.js';
import { ImageInputSchema, ImageSchema } from '../schema/image.js';
import {
  ItemInputSchema,
  ItemAttributeSchema,
  ItemSchema,
} from '../schema/item.js';
import { ContainerInputSchema, ContainerSchema } from '../schema/container.js';
import { ItemImageMappingSchema } from '../schema/item-mapping.js';
import { ItemRecordSchema } from '../schema/item-records.js';
import { ContainerRecordSchema } from '../schema/container-record.js';
import { ContainerImageMappingSchema } from '../schema/container-mapping.js';

// Auth Schemas (moved from schema/user.ts)
export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const RegisterSchema = UserInputSchema.omit({ avatar: true }).refine(
  (data) => data.password === data.passwordConfirm,
  {
    message: "Passwords don't match",
    path: ['passwordConfirm'],
  }
);

// Model Types (derived from Zod schemas)
export type User = z.infer<typeof UserSchema>;
export type UserInput = z.infer<typeof UserInputSchema>;
export type RegisterData = z.infer<typeof RegisterSchema>;
export type LoginData = z.infer<typeof LoginSchema>;

export type Image = z.infer<typeof ImageSchema>;
export type ImageInput = z.infer<typeof ImageInputSchema>;
export type ImageUpdate = Partial<ImageInput>;

export type Item = z.infer<typeof ItemSchema>;
export type ItemInput = z.infer<typeof ItemInputSchema>;
export type ItemUpdate = Partial<ItemInput>;
export type ItemAttribute = z.infer<typeof ItemAttributeSchema>;

export type Container = z.infer<typeof ContainerSchema>;
export type ContainerInput = z.infer<typeof ContainerInputSchema>;
export type ContainerUpdate = Partial<ContainerInput>;

export type ItemImageMapping = z.infer<typeof ItemImageMappingSchema>;
export type ContainerImageMapping = z.infer<typeof ContainerImageMappingSchema>;
export type ItemRecord = z.infer<typeof ItemRecordSchema>;
export type ContainerRecord = z.infer<typeof ContainerRecordSchema>;

// Typed PocketBase interface
export interface TypedPocketBase extends PocketBase {
  collection(idOrName: 'Users'): RecordService<User>;
  collection(idOrName: 'images'): RecordService<Image>;
  collection(idOrName: 'items'): RecordService<Item>;
  collection(idOrName: 'containers'): RecordService<Container>;
  collection(idOrName: 'item_image_mappings'): RecordService<ItemImageMapping>;
  collection(idOrName: 'container_image_mappings'): RecordService<ContainerImageMapping>;
  collection(idOrName: 'ItemRecords'): RecordService<ItemRecord>;
  collection(idOrName: 'ContainerRecords'): RecordService<ContainerRecord>;
}

// PocketBase response types
export interface PocketBaseResponse<T = Record<string, unknown>> {
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  items: T[];
}

// API response types
export interface ApiResponse<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Common utility types
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type RequiredFields<T, K extends keyof T> = T & Required<Pick<T, K>>;

// Shared TypeScript types

import PocketBase from 'pocketbase';
import type { RecordService } from 'pocketbase';
import { z } from 'zod';
import { UserInputSchema, UserSchema } from '../schema/user.js';
import {
  ImageInputSchema,
  ImageUpdateSchema,
  ImageSchema,
} from '../schema/image.js';
import {
  ItemInputSchema,
  ItemUpdateSchema,
  ItemAttributeSchema,
  ItemSchema,
} from '../schema/item.js';
import {
  ContainerInputSchema,
  ContainerUpdateSchema,
  ContainerSchema,
} from '../schema/container.js';
import { ItemImageMappingSchema } from '../schema/item-image.js';
import { ItemRecordSchema } from '../schema/item-record.js';
import { ContainerRecordSchema } from '../schema/container-record.js';
import { ContainerImageMappingSchema } from '../schema/container-image.js';
import { ImageMetadataSchema, ImageMetadataInputSchema } from '../schema.js';

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
export type ImageUpdate = z.infer<typeof ImageUpdateSchema>;

export type ImageMetadata = z.infer<typeof ImageMetadataSchema>;
export type ImageMetadataInput = z.infer<typeof ImageMetadataInputSchema>;

export type Item = z.infer<typeof ItemSchema>;
export type ItemInput = z.infer<typeof ItemInputSchema>;
export type ItemUpdate = z.infer<typeof ItemUpdateSchema>;
export type ItemAttribute = z.infer<typeof ItemAttributeSchema>;

export type Container = z.infer<typeof ContainerSchema>;
export type ContainerInput = z.infer<typeof ContainerInputSchema>;
export type ContainerUpdate = z.infer<typeof ContainerUpdateSchema>;

export type ItemImageMapping = z.infer<typeof ItemImageMappingSchema>;
export type ContainerImageMapping = z.infer<typeof ContainerImageMappingSchema>;
export type ItemRecord = z.infer<typeof ItemRecordSchema>;
export type ContainerRecord = z.infer<typeof ContainerRecordSchema>;

// Typed PocketBase interface
export interface TypedPocketBase extends PocketBase {
  collection(idOrName: 'Users'): RecordService<User>;
  collection(idOrName: 'ImageMetadata'): RecordService<ImageMetadata>;
  collection(idOrName: 'Images'): RecordService<Image>;
  collection(idOrName: 'Items'): RecordService<Item>;
  collection(idOrName: 'Containers'): RecordService<Container>;
  collection(idOrName: 'ItemImages'): RecordService<ItemImageMapping>;
  collection(idOrName: 'ContainerImages'): RecordService<ContainerImageMapping>;
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

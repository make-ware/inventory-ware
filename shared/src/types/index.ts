// Shared TypeScript types

import { z } from 'zod';
import {
  type UsersResponse,
  type ImagesResponse,
  type ImageMetadataResponse,
  type ItemsResponse,
  type ContainersResponse,
  type ItemImagesResponse,
  type ContainerImagesResponse,
  type ItemRecordsResponse,
  type ContainerRecordsResponse,
  type TypedPocketBase as GeneratedTypedPocketBase,
} from '../pocketbase-types.js';

export type {
  UsersResponse,
  ImagesResponse,
  ImageMetadataResponse,
  ItemsResponse,
  ContainersResponse,
  ItemImagesResponse,
  ContainerImagesResponse,
  ItemRecordsResponse,
  ContainerRecordsResponse,
};
import { UserInputSchema } from '../schema/user.js';
import { ImageInputSchema, ImageUpdateSchema } from '../schema/image.js';
import {
  ItemInputSchema,
  ItemUpdateSchema,
  ItemAttributeSchema,
} from '../schema/item.js';
import {
  ContainerInputSchema,
  ContainerUpdateSchema,
} from '../schema/container.js';
import { ImageMetadataInputSchema } from '../schema.js';

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

// Model Types (derived from Zod schemas or generated interfaces)
export type User = UsersResponse & {
  email?: string;
  username?: string;
};
export type UserInput = z.infer<typeof UserInputSchema>;
export type RegisterData = z.infer<typeof RegisterSchema>;
export type LoginData = z.infer<typeof LoginSchema>;

export type Image = ImagesResponse;
export type ImageInput = z.infer<typeof ImageInputSchema>;
export type ImageUpdate = z.infer<typeof ImageUpdateSchema>;

export type ImageMetadata = ImageMetadataResponse;
export type ImageMetadataInput = z.infer<typeof ImageMetadataInputSchema>;

export type Item = ItemsResponse;
export type ItemInput = z.infer<typeof ItemInputSchema>;
export type ItemUpdate = z.infer<typeof ItemUpdateSchema>;
export type ItemAttribute = z.infer<typeof ItemAttributeSchema>;

export type Container = ContainersResponse;
export type ContainerInput = z.infer<typeof ContainerInputSchema>;
export type ContainerUpdate = z.infer<typeof ContainerUpdateSchema>;

export type ItemImageMapping = ItemImagesResponse;
export type ContainerImageMapping = ContainerImagesResponse;
export type ItemRecord = ItemRecordsResponse;
export type ContainerRecord = ContainerRecordsResponse;

// Re-export the typed PocketBase client
export type TypedPocketBase = GeneratedTypedPocketBase;

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

import {
  TextField,
  EmailField,
  FileField,
  baseSchema,
  defineCollection,
} from 'pocketbase-zod-schema/schema';
import { z } from 'zod';

/** -- User Collections -- */
// Input schema for forms (includes passwordConfirm for validation)
export const UserInputSchema = z.object({
  name: TextField({ min: 0, max: 255, pattern: '' }).optional(),
  email: EmailField(),
  password: TextField({ min: 8 }),
  passwordConfirm: z.string(),
  avatar: FileField({
    mimeTypes: [
      'image/jpeg',
      'image/png',
      'image/svg+xml',
      'image/gif',
      'image/webp',
    ],
  }).optional(),
});

// Internal schemas used for defining UserCollection
// Use variables for side effects or logic as needed, or remove if truly redundant.
// Moved to types/index.ts for shared use.

// Use the variables to avoid lint errors (they are part of the logic, but currently tsc might complain if they are just consts)
// Actually, I'll just keep them as is and see if I can use them or if I should just ignore the lint
// For now, let's just make sure they are used or removed if they truly aren't needed.
// RegisterSchema and LoginSchema were moved to types/index.ts.
// I will remove them here since they are duplicates now.

// Database schema (excludes passwordConfirm, includes avatar as file field)
const UserCollectionSchema = z.object({
  name: TextField({ min: 0, max: 255, pattern: '' }).optional(),
  email: EmailField(),
  password: TextField({ min: 8 }),
  avatar: FileField({
    mimeTypes: [
      'image/jpeg',
      'image/png',
      'image/svg+xml',
      'image/gif',
      'image/webp',
    ],
  }).optional(),
});

// Full schema with base fields for type inference
export const UserSchema = UserCollectionSchema.extend(baseSchema);

// Matches PocketBase's default users collection configuration
export const UserCollection = defineCollection({
  collectionName: 'Users',
  type: 'auth',
  schema: UserSchema,
  permissions: {
    // Users can list their own profile
    listRule: 'id = @request.auth.id',
    // Users can view their own profile
    viewRule: 'id = @request.auth.id',
    // Anyone can create an account (sign up)
    createRule: '',
    // Users can only update their own profile
    updateRule: 'id = @request.auth.id',
    // Users can only delete their own account
    deleteRule: 'id = @request.auth.id',
    // manageRule is null in PocketBase default (not set)
  },
  indexes: [
    // PocketBase's default indexes for auth collections
    'CREATE UNIQUE INDEX `idx_tokenKey__pb_users_auth_` ON `users` (`tokenKey`)',
    "CREATE UNIQUE INDEX `idx_email__pb_users_auth_` ON `users` (`email`) WHERE `email` != ''",
  ],
});

// Default export - preferred pattern for schema files
export default UserCollection;

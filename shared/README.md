# Shared Package

This workspace contains shared types, schemas, mutators, and utilities for the Next.js + PocketBase monorepo.

## Features

- **Mutators**: Type-safe data access classes for all PocketBase operations (primary interface)
- **Zod Schemas**: Type-safe validation schemas for PocketBase collections
- **TypeScript Types**: Shared types and interfaces
- **Database Migrations**: Generate and manage PocketBase schema migrations
- **Utility Functions**: Common helper functions for validation and error handling
- **Type Generation**: Automatic TypeScript type generation from PocketBase schema

## Installation

This package is automatically installed as part of the monorepo workspace.

## Usage

### ⚠️ Important: Use Mutators for All Data Operations

**All PocketBase data operations should use mutators, not direct PocketBase SDK calls.** Mutators provide type safety, validation, and consistent error handling.

### In Next.js App

```typescript
// Import mutators and types
import { UserMutator } from '@project/shared';
import { pb } from '@/lib/pocketbase'; // Client-side PocketBase instance

// Create a mutator instance
const userMutator = new UserMutator(pb);

// Type-safe data operations
const user = await userMutator.getById('user-id');
const users = await userMutator.getList(1, 10, undefined, '-created');
const newUser = await userMutator.create({
  email: 'user@example.com',
  password: 'secure123',
  passwordConfirm: 'secure123',
});
await userMutator.update('user-id', { name: 'Updated Name' });
await userMutator.delete('user-id');

// With filters and expands
const adminUsers = await userMutator.getList(
  1,
  10,
  'role = "admin"',
  '-created',
  'profile'
);
```

### Creating New Mutators

Extend `BaseMutator` to create mutators for your collections:

```typescript
// src/mutator/postMutator.ts
import { RecordService } from 'pocketbase';
import { Post, PostInput, PostInputSchema } from '../schema/post';
import { TypedPocketBase } from '../types';
import { BaseMutator } from './baseMutator';

export class PostMutator extends BaseMutator<Post, PostInput> {
  constructor(pb: TypedPocketBase) {
    super(pb, {
      // Optional: Set default options
      expand: ['author'],
      filter: ['published = true'],
      sort: ['-created'],
    });
  }

  protected getCollection(): RecordService<Post> {
    return this.pb.collection<Post>('posts');
  }

  protected async validateInput(input: PostInput): Promise<PostInput> {
    return PostInputSchema.parse(input);
  }
}
```

### BaseMutator API

The `BaseMutator` class provides these methods:

- `create(input)` - Create a new record
- `update(id, input)` - Update an existing record
- `upsert(input)` - Create or update a record
- `getById(id, expand?)` - Get a record by ID
- `getFirstByFilter(filter, expand?, sort?)` - Get first matching record
- `getList(page, perPage, filter?, sort?, expand?)` - Get paginated list
- `delete(id)` - Delete a record
- `subscribeToRecord(id, callback, expand?)` - Subscribe to record changes
- `subscribeToCollection(callback, expand?)` - Subscribe to collection changes

### In PocketBase Hooks

```javascript
// pocketbase/pb_hooks/main.pb.js
// Import validation schemas (when using TypeScript hooks)
const { UserSchema } = require('shared');
```

## Scripts

- `yarn build` - Compile TypeScript to JavaScript
- `yarn dev` - Watch mode compilation
- `yarn clean` - Remove build artifacts
- `yarn typegen` - Generate TypeScript types from PocketBase schema
- `yarn migrate:generate` - Generate database migration from schema changes
- `yarn migrate:status` - Check migration status

## Type Generation

To generate TypeScript types from your PocketBase collections:

1. Make sure PocketBase is running (`yarn pb:dev`)
2. Run the type generator: `yarn workspace shared typegen`
3. Types will be generated in `src/types/pocketbase.ts`

## Structure

```
shared/
├── src/
│   ├── mutator/          # Mutator classes (BaseMutator, UserMutator, etc.)
│   │   ├── baseMutator.ts    # Base mutator class
│   │   └── userMutator.ts    # Example mutator implementation
│   ├── schemas/          # Zod validation schemas
│   ├── types/            # TypeScript type definitions
│   ├── utils/            # Utility functions
│   ├── pocketbase/       # PocketBase client configuration
│   └── index.ts          # Main exports
├── dist/                 # Compiled JavaScript (generated)
└── package.json
```

## Adding New Collections

When adding a new PocketBase collection, follow these steps:

1. **Create the schema** in `src/schema/`:

```typescript
// src/schema/post.ts
import { z } from 'zod';

export const PostSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  author: z.string(),
  created: z.string(),
  updated: z.string(),
});

export type Post = z.infer<typeof PostSchema>;

export const PostInputSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  author: z.string(),
});

export type PostInput = z.infer<typeof PostInputSchema>;
```

2. **Create a mutator** in `src/mutator/`:

```typescript
// src/mutator/postMutator.ts
import { RecordService } from 'pocketbase';
import { Post, PostInput, PostInputSchema } from '../schema/post';
import { TypedPocketBase } from '../types';
import { BaseMutator } from './baseMutator';

export class PostMutator extends BaseMutator<Post, PostInput> {
  constructor(pb: TypedPocketBase) {
    super(pb);
  }

  protected getCollection(): RecordService<Post> {
    return this.pb.collection<Post>('posts');
  }

  protected async validateInput(input: PostInput): Promise<PostInput> {
    return PostInputSchema.parse(input);
  }
}
```

3. **Export from index.ts**:

```typescript
export * from './schema/post.js';
export * from './mutator/postMutator.js';
```

4. **Use in your applications**:

```typescript
import { PostMutator, Post, PostInput } from '@project/shared';
```

## Database Migrations

The shared workspace can generate migrations for PocketBase schema changes using `pocketbase-migrate`:

```bash
# Generate a migration from schema changes
yarn workspace shared migrate:generate

# Check migration status
yarn workspace shared migrate:status
```

Migrations are stored in `pocketbase/pb_migrations/` and can be applied when deploying schema changes.

## Development

The shared package is built as an ES module and provides both TypeScript types and compiled JavaScript for use across the monorepo.

**Remember:** Always use mutators for PocketBase data operations, never direct SDK calls.

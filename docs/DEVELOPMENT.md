# Development Guide

This guide provides technical information for developers contributing to Inventory Ware.

## Monorepo Structure

This project is a Yarn v4 workspace monorepo with the following structure:

```
inventory-ware/
├── webapp/          # Next.js application (@project/webapp)
├── shared/         # Shared types, schemas, and utilities (@project/shared)
├── pocketbase/      # PocketBase instance and migrations
└── scripts/         # Setup and utility scripts
```

### Workspaces

- **`@project/webapp`**: Next.js 16 application with React 19, TypeScript, and Tailwind CSS
- **`@project/shared`**: Shared package containing:
  - Zod validation schemas for PocketBase collections
  - TypeScript type definitions
  - PocketBase client utilities
  - Migration configuration
  - Type generation tools

## Getting Started

1. **Initial Setup:**
   ```bash
   yarn install
   yarn setup
   ```

2. **Start Development:**
   ```bash
   yarn dev
   ```
   This starts both services:
   - Next.js: http://localhost:3000
   - PocketBase: http://localhost:8090

3. **Create Admin Account:**
   ```bash
   yarn pb:admin
   ```

4. **Build Shared Package:**
   ```bash
   yarn workspace @project/shared build
   ```
   The shared package must be built before the webapp can use it.

## Development Workflow

### Backend Development (PocketBase)

1. **Access Admin UI:** http://localhost:8090/_/
2. **Create Collections:** Use the admin interface to define your data schema
3. **Add Custom Logic:** Edit `pocketbase/pb_hooks/main.pb.js` for custom business logic
4. **API Testing:** Use the built-in API explorer in the admin UI

### Shared Package Development

The `@project/shared` workspace contains all shared types, schemas, and utilities used across the monorepo.

#### Package Structure

```
shared/
├── src/
│   ├── schema/          # Zod schemas for collections (e.g., user.ts)
│   ├── schema.ts        # Main schema exports
│   ├── enums.ts         # Shared enums
│   ├── types.ts         # TypeScript type definitions
│   ├── mutator.ts       # Data transformation utilities
│   ├── pocketbase/      # PocketBase client configuration
│   └── utils/           # Utility functions
├── dist/                # Compiled JavaScript (generated)
└── package.json
```

#### Using Shared Schemas in Webapp

Import schemas and types from `@project/shared`:

```typescript
// Import schemas
import { UserSchema, LoginSchema, RegisterSchema } from '@project/shared/schema';
import { UserRole, PostStatus } from '@project/shared/enums';
import type { User, LoginData, RegisterData } from '@project/shared/schema';

// Use in validation
const validatedUser = UserSchema.parse(userData);

// Use in forms
const loginData = LoginSchema.parse(formData);
```

#### Adding New Schemas

1. **Create schema file** in `shared/src/schema/`:
   ```typescript
   // shared/src/schema/post.ts
   import { baseSchema, baseSchemaWithTimestamps, defineCollection } from "pocketbase-zod-schema/schema";
   import { z } from "zod";

   export const PostSchema = z
     .object({
       title: z.string().min(1),
       content: z.string(),
       status: z.enum(['draft', 'published']),
     })
     .extend(baseSchema)
     .extend(baseSchemaWithTimestamps);

   const postCollection = defineCollection({
     schema: PostSchema,
     collectionName: "Posts",
     type: "base",
     permissions: {
       listRule: "",
       viewRule: "",
       createRule: "@request.auth.id != ''",
       updateRule: "userId = @request.auth.id",
       deleteRule: "userId = @request.auth.id",
     },
   });

   export default postCollection;
   export type Post = z.infer<typeof PostSchema>;
   ```

2. **Export from** `shared/src/schema.ts`:
   ```typescript
   export * from './schema/post.js';
   ```

3. **Rebuild the shared package:**
   ```bash
   yarn workspace @project/shared build
   ```

4. **Use in webapp:**
   ```typescript
   import { PostSchema, Post } from '@project/shared/schema';
   ```

#### Schema Development Workflow

1. Edit schema files in `shared/src/schema/`
2. Run `yarn workspace @project/shared dev` for watch mode, or
3. Run `yarn workspace @project/shared build` to compile
4. The webapp will automatically pick up changes after rebuild

### Frontend Development (Next.js)

The `@project/webapp` workspace is a Next.js 16 application.

#### Using PocketBase Client

The shared package provides PocketBase client utilities:

```typescript
// Import PocketBase client from shared package
import { createPocketBaseClient } from '@project/shared/pocketbase';

// Or use directly
import PocketBase from 'pocketbase';

export const pb = new PocketBase(process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://localhost:8090');
```

#### Example Usage

```typescript
// Fetch data with validation
import { UserSchema } from '@project/shared/schema';

const records = await pb.collection('users').getFullList();
const validatedUsers = records.map(record => UserSchema.parse(record));

// Authentication
await pb.collection('users').authWithPassword(email, password);

// Real-time subscriptions
pb.collection('posts').subscribe('*', (e) => {
  console.log(e.action, e.record);
});
```

#### Form Validation with React Hook Form

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { LoginSchema, type LoginData } from '@project/shared/schema';

function LoginForm() {
  const { register, handleSubmit, formState: { errors } } = useForm<LoginData>({
    resolver: zodResolver(LoginSchema),
  });

  const onSubmit = async (data: LoginData) => {
    await pb.collection('users').authWithPassword(data.email, data.password);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {/* form fields */}
    </form>
  );
}
```

## Type Generation

Generate TypeScript types from your PocketBase collections:

1. **Start PocketBase:**
   ```bash
   yarn pb:dev
   ```

2. **Generate types:**
   ```bash
   yarn typegen
   # or
   yarn workspace @project/shared typegen
   ```

3. **Types will be generated in** `shared/src/types/pocketbase.ts`

## Migrations

The shared package includes PocketBase migration configuration in `shared/pocketbase-migrate.config.js`.

### Migration Workflow

1. Define schemas in `shared/src/schema/` using `defineCollection()`
2. Use PocketBase admin UI to create/update collections
3. Generate migration snapshots (when migration tooling is implemented)
4. Apply migrations to sync schema definitions

## Common Tasks

### Adding a New Collection

1. **Define the schema** in `shared/src/schema/` (see "Adding New Schemas" above)
2. **Create the collection** in PocketBase Admin UI (http://localhost:8090/_/)
3. **Set up validation rules** and API permissions in the admin UI
4. **Rebuild shared package:**
   ```bash
   yarn workspace @project/shared build
   ```
5. **Generate types** (optional):
   ```bash
   yarn typegen
   ```

### Custom API Endpoints

Add to `pocketbase/pb_hooks/main.pb.js`:

```javascript
routerAdd("GET", "/api/custom", (c) => {
  return c.json(200, { message: "Custom endpoint" });
});
```

### Environment Variables

Create `.env.local` in the webapp directory:

```bash
# webapp/.env.local
NEXT_PUBLIC_POCKETBASE_URL=http://localhost:8090
```

## Troubleshooting

### PocketBase Issues

- Check if port 8090 is available
- Verify binary permissions: `chmod +x pocketbase/pocketbase`
- Check logs in `pocketbase/pb_data/logs/`

### Next.js Issues

- Clear cache: `yarn workspace @project/webapp clean`
- Check TypeScript errors: `yarn workspace @project/webapp lint`
- Rebuild shared package if imports fail: `yarn workspace @project/shared build`

### Shared Package Issues

- **Import errors**: Make sure the shared package is built (`yarn workspace @project/shared build`)
- **Type errors**: Rebuild the shared package after schema changes
- **Module not found**: Check that `@project/shared` is listed in `webapp/package.json` dependencies

### Yarn Workspace Issues

- Reinstall dependencies: `yarn install`
- Check workspace configuration in root `package.json`
- Verify `.yarnrc.yml` exists and is configured correctly
- Ensure all workspaces use the same Yarn version (4.12.0)

## Production Deployment

### PocketBase

1. Build for production
2. Set environment variables
3. Configure reverse proxy (nginx/caddy)
4. Set up SSL certificates

### Next.js

1. **Build shared package:**
   ```bash
   yarn workspace @project/shared build
   ```

2. **Build webapp:**
   ```bash
   yarn workspace @project/webapp build
   ```
   Or build everything:
   ```bash
   yarn build
   ```

3. Deploy to your preferred platform
4. Update `NEXT_PUBLIC_POCKETBASE_URL` to production URL

## Useful Commands

```bash
# Development
yarn dev                              # Start both services (Next.js + PocketBase)
yarn pb:dev                          # PocketBase only
yarn workspace @project/webapp dev    # Next.js only
yarn workspace @project/shared dev   # Watch mode for shared package

# Building
yarn build                           # Build all packages
yarn workspace @project/shared build # Build shared package only
yarn workspace @project/webapp build # Build webapp only

# Linting
yarn lint                            # Lint all workspaces
yarn lint:fix                        # Auto-fix lint issues
yarn lint:webapp                     # Lint Next.js app only
yarn lint:shared                     # Lint shared package only

# Type Generation
yarn typegen                         # Generate TypeScript types from PocketBase

# Testing
yarn workspace @project/shared test  # Run tests in shared package
yarn workspace @project/shared test:watch  # Watch mode tests

# Production
yarn pb:serve                        # Start PocketBase in production mode

# Maintenance
yarn clean                           # Clean all build artifacts
yarn setup                           # Reinstall PocketBase
```

## Workspace Package Names

When running workspace commands, use the package names:

- `@project/webapp` - Next.js application
- `@project/shared` - Shared types and schemas

Example:
```bash
yarn workspace @project/webapp add some-package
yarn workspace @project/shared add some-package
```

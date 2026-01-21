# Inventory Ware Web Application

This is the Next.js frontend application for Inventory Ware.

## Quick Start

### Development

From the root of the monorepo:

```bash
# Start both Next.js and PocketBase
yarn dev

# Or start Next.js only (if PocketBase is already running)
yarn workspace webapp dev
```

The app will be available at [http://localhost:3000](http://localhost:3000).

### Build

```bash
# Build from root (builds shared package first)
yarn build

# Or build webapp only
yarn workspace webapp build
```

### Production

```bash
yarn workspace webapp start
```

## Project Structure

The webapp follows a clean layered architecture with clear import flows:

```
webapp/src/
├── app/                    # Next.js App Router (pages & layouts)
├── components/
│   ├── auth/               # Authentication feature components
│   ├── inventory/          # Inventory feature components
│   ├── layout/             # Layout components (navigation, etc.)
│   └── ui/                 # shadcn/ui primitives
├── contexts/               # React contexts (consume services)
├── hooks/                  # Custom React hooks (use contexts)
├── lib/
│   ├── pocketbase.ts       # PocketBase client singleton
│   ├── types.ts            # Local TypedPocketBase interface
│   └── utils.ts            # General utilities
├── mutators/               # Data mutation layer (CRUD operations)
│   ├── base.ts             # BaseMutator abstract class
│   ├── item.ts             # ItemMutator
│   ├── user.ts             # UserMutator
│   └── index.ts            # Barrel export
├── services/               # Business logic layer
│   ├── auth.ts             # AuthService (login, register, etc.)
│   └── index.ts            # Barrel export
└── test/                   # Test files
```

### Architecture & Import Flow

```
@project/shared (Types & Schemas)
       ↓
lib/pocketbase.ts (PocketBase Client)
       ↓
mutators/ (Data Layer)
       ↓
services/ (Business Logic)
       ↓
contexts/ (State Management)
       ↓
hooks/ (Reusable Logic)
       ↓
components/ (UI)
       ↓
app/ (Pages)
```

## Using the Shared Package

The `@project/shared` package exports:

- **Types & Schemas**: `User`, `Item`, `ItemInput`, validation schemas, etc.
- **Utility Functions**: Error handling, data transformations
- **Enums**: Shared constants

The shared package does NOT export mutators or services - these are application-specific and live in the webapp.

### Importing Types

```typescript
// Import types and schemas from shared
import type { Item, ItemInput, User } from '@project/shared';
import { ItemInputSchema } from '@project/shared';
```

## Data Layer: Mutators

All PocketBase data operations use mutators. Mutators provide type safety, validation, and consistent error handling.

### Using Mutators

```typescript
'use client';

import { ItemMutator } from '@/mutators';
import pb from '@/lib/pocketbase';
import type { ItemInput } from '@project/shared';

export function MyComponent() {
  // Create mutator instance
  const itemMutator = new ItemMutator(pb);

  const fetchItems = async () => {
    // Type-safe CRUD operations
    const result = await itemMutator.getList(1, 10);
    return result.items;
  };

  const createItem = async (data: ItemInput) => {
    const newItem = await itemMutator.create({
      name: data.name,
      description: data.description,
      // ...
    });
    return newItem;
  };

  // ...
}
```

### Available Mutators

- **`BaseMutator`**: Abstract base class with CRUD operations
- **`ItemMutator`**: Item-specific operations
- **`UserMutator`**: User-specific operations

All mutators are in `webapp/src/mutators/` and imported via `@/mutators`.

## Business Logic: Services

Services encapsulate complex business logic and compose mutators.

### Using the Auth Service

```typescript
'use client';

import { createAuthService } from '@/services';
import pb from '@/lib/pocketbase';

export function LoginForm() {
  const authService = createAuthService(pb);

  const handleLogin = async (email: string, password: string) => {
    try {
      const user = await authService.login(email, password);
      console.log('Logged in:', user);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  // ...
}
```

### Available Services

- **`AuthService`**: Authentication operations (login, register, logout, refresh, password change)

All services are in `webapp/src/services/` and imported via `@/services`.

## State Management: Contexts

Use React contexts for state management. Contexts consume services and provide data/actions to components.

### Using Contexts

```typescript
'use client';

import { useInventory } from '@/hooks/use-inventory';

export function ItemList() {
  const { items, isLoading, createItem, updateItem, deleteItem } = useInventory();

  // Use items and actions in your component
}
```

### Available Contexts

- **`AuthContext`**: Authentication state and actions
- **`InventoryContext`**: Inventory state and CRUD operations

Access contexts via hooks: `useAuth()`, `useInventory()`

## Tech Stack

- **Framework:** Next.js 16+ with App Router
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4
- **Components:** shadcn/ui (Radix UI primitives)
- **Forms:** React Hook Form + Zod validation
- **Icons:** Lucide React
- **Themes:** next-themes (dark mode support)
- **Backend:** PocketBase (client-side only)

## Connecting to PocketBase

### Client-Side Only (No SSR)

This project does NOT use Server-Side Rendering (SSR) for PocketBase data. All PocketBase operations are performed client-side only. This avoids security issues with shared SDK instances and simplifies the architecture.

See [PB_SSR.md](../../docs/PB_SSR.md) for detailed information about why SSR is not recommended.

### PocketBase Client Setup

The PocketBase client is configured in `lib/pocketbase.ts`:

```typescript
// webapp/src/lib/pocketbase.ts
import PocketBase from 'pocketbase';
import type { TypedPocketBase } from './types';

const pb = new PocketBase(
  process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://localhost:8090'
) as TypedPocketBase;

export default pb;
```

Always use this singleton instance - never create new PocketBase instances.

## Development Best Practices

### 1. Follow the Import Flow

```typescript
// CORRECT: Follow the architecture layers
import type { Item } from '@project/shared'; // Types from shared
import pb from '@/lib/pocketbase'; // Client from lib
import { ItemMutator } from '@/mutators'; // Mutator from mutators
import { createAuthService } from '@/services'; // Service from services
import { useInventory } from '@/hooks/use-inventory'; // Hook from hooks

// WRONG: Skip layers or use direct SDK calls
import { pb } from '@project/shared'; // Don't import from shared
const item = await pb.collection('items').create(); // Don't use SDK directly
```

### 2. Use Mutators for All Data Operations

```typescript
// CORRECT: Use mutators
const itemMutator = new ItemMutator(pb);
const item = await itemMutator.create({ name: 'New Item' });

// WRONG: Direct SDK calls
const item = await pb.collection('items').create({ name: 'New Item' });
```

### 3. Client-Side Only

```typescript
// CORRECT: Client components for PocketBase
'use client';

import { useInventory } from '@/hooks/use-inventory';

export function ItemList() {
  const { items } = useInventory();
  return <div>{/* ... */}</div>;
}

// WRONG: Server components with PocketBase
// Don't use PocketBase in Server Components
export default async function InventoryPage() {
  const items = await pb.collection('items').getList(); // NO!
}
```

### 4. Type Safety

```typescript
// CORRECT: Import and use types
import type { ItemInput, Item } from '@project/shared';
import { ItemInputSchema } from '@project/shared';

const validateInput = (data: ItemInput): Item => {
  const validated = ItemInputSchema.parse(data);
  // ...
};

// WRONG: Untyped data
const createItem = (data: any) => {
  // No type checking
  // ...
};
```

### 5. Environment Variables

Create `.env.local` in the webapp directory:

```bash
NEXT_PUBLIC_POCKETBASE_URL=http://localhost:8090
```

Use `NEXT_PUBLIC_` prefix for client-side environment variables.

## Available Scripts

- `yarn workspace webapp dev` - Start development server
- `yarn workspace webapp build` - Build for production
- `yarn workspace webapp start` - Start production server
- `yarn workspace webapp lint` - Run ESLint
- `yarn workspace webapp lint:fix` - Fix ESLint issues
- `yarn workspace webapp typecheck` - Run TypeScript type checking
- `yarn workspace webapp test` - Run tests
- `yarn workspace webapp clean` - Remove `.next` directory

## Adding Components

This project uses shadcn/ui. Add new components:

```bash
# From the webapp directory
npx shadcn@latest add [component-name]
```

Components are added to `components/ui/` and can be customized as needed.

## Creating New Features

When adding a new feature (e.g., "Containers"), follow this pattern:

### 1. Define Schema in Shared Package

```typescript
// shared/src/schema/container.ts
import { z } from 'zod';

export const ContainerInputSchema = z.object({
  name: z.string().min(1),
  location: z.string(),
});

export type ContainerInput = z.infer<typeof ContainerInputSchema>;
export type Container = ContainerInput & {
  id: string;
  user: string;
  created: string;
  updated: string;
};
```

### 2. Create Mutator in Webapp

```typescript
// webapp/src/mutators/container.ts
import { RecordService } from 'pocketbase';
import { type Container, type ContainerInput, ContainerInputSchema } from '@project/shared';
import type { TypedPocketBase } from '@/lib/types';
import { BaseMutator } from './base';

export class ContainerMutator extends BaseMutator<Container, ContainerInput> {
  constructor(pb: TypedPocketBase) {
    super(pb);
  }

  protected getCollection(): RecordService<Container> {
    return this.pb.collection('containers');
  }

  protected async validateInput(input: ContainerInput): Promise<ContainerInput> {
    return ContainerInputSchema.parse(input);
  }
}
```

### 3. Create Service (if needed)

```typescript
// webapp/src/services/container.ts
import type PocketBase from 'pocketbase';
import type { TypedPocketBase } from '@/lib/types';
import { ContainerMutator } from '@/mutators';

export class ContainerService {
  private containerMutator: ContainerMutator;

  constructor(pb: PocketBase) {
    this.containerMutator = new ContainerMutator(pb as TypedPocketBase);
  }

  // Add complex business logic here
}
```

### 4. Create Context

```typescript
// webapp/src/contexts/container-context.tsx
'use client';

import { createContext, useState } from 'react';
import { ContainerMutator } from '@/mutators';
import pb from '@/lib/pocketbase';

// ... context implementation
```

### 5. Create Hook

```typescript
// webapp/src/hooks/use-container.ts
import { useContext } from 'react';
import { ContainerContext } from '@/contexts/container-context';

export function useContainer() {
  const context = useContext(ContainerContext);
  if (!context) {
    throw new Error('useContainer must be used within ContainerProvider');
  }
  return context;
}
```

### 6. Create Components

```typescript
// webapp/src/components/containers/container-list.tsx
'use client';

import { useContainer } from '@/hooks/use-container';

export function ContainerList() {
  const { containers, isLoading } = useContainer();
  // ... component implementation
}
```

## Documentation

- [Main README](../../README.md) - Project overview
- [Shared Package](../shared/README.md) - Types, schemas, and utilities
- [PocketBase Introduction](../../docs/PB_INTRO.md) - Getting started with PocketBase
- [PocketBase SSR Guide](../../docs/PB_SSR.md) - Using PocketBase with Next.js SSR
- [PocketBase Authentication](../../docs/PB_AUTH.md) - Auth patterns and examples

## Deployment

### Platforms

Build the app and deploy the `.next` output:

```bash
yarn workspace webapp build
# Deploy the webapp/.next directory
```

Make sure to set the correct `NEXT_PUBLIC_POCKETBASE_URL` environment variable for your production PocketBase instance.

## Troubleshooting

### Type Errors with PocketBase

If you see type mismatches between PocketBase versions:

1. Check that `webapp/src/lib/types.ts` defines `TypedPocketBase` using the local PocketBase package
2. Always cast the client: `pb as TypedPocketBase` when passing to mutators
3. Keep PocketBase versions in sync between `shared` and `webapp`

### Import Errors

If imports fail:

1. Verify the import path follows the architecture layers
2. Check that `@/` path alias is configured in `tsconfig.json`
3. Rebuild shared package: `yarn workspace @project/shared build`

### Authentication Issues

If authentication doesn't persist:

1. Check that `NEXT_PUBLIC_POCKETBASE_URL` is set correctly
2. Verify PocketBase is running and accessible
3. Check browser console for CORS errors
4. Ensure cookies are enabled in the browser

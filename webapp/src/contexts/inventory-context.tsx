'use client';

/**
 * The AI upload entry point, plus the two ad-hoc reads that hang off it.
 *
 * This context holds no records and, since the write paths moved to
 * `@/hooks/use-item-mutations` and `@/hooks/use-container-mutations`, no
 * mutations either. Those hooks patch the query cache optimistically and
 * invalidate what they touched, which a context method wrapping a mutator
 * could not do — every caller now reaches for the hook directly.
 *
 * What is left is `uploadAndAnalyze`: one POST to `/api-next/process-image`
 * whose result is entities created server-side, so there is nothing to patch
 * optimistically and every list is potentially out of date when it returns.
 * The `isLoading` / `error` pair belongs to that call.
 */
import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useMemo,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ItemMutator } from '@project/shared';
import pb from '@/lib/pocketbase-client';
import type { Item } from '@project/shared';
import type { SearchFilters } from '@/components/inventory';
import {
  qk,
  invalidateContainerCaches,
  invalidateItemCaches,
} from '@/lib/query';

interface InventoryState {
  isLoading: boolean;
  error: string | null;
}

interface InventoryContextValue extends InventoryState {
  /** Upload an image and analyze it with AI to create items/containers */
  uploadAndAnalyze: (file: File) => Promise<void>;
  /** Reset loading state after the upload settles */
  clearLoadingState: () => Promise<void>;
  /** Search items by query and optional filters */
  searchItems: (query: string, filters?: SearchFilters) => Promise<Item[]>;
  /** Get items belonging to a specific container */
  getItemsByContainer: (containerId: string) => Promise<Item[]>;
}

const InventoryContext = createContext<InventoryContextValue | null>(null);

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<InventoryState>({
    isLoading: false,
    error: null,
  });

  const queryClient = useQueryClient();

  // Create mutators - memoized to prevent recreation on every render
  const itemMutator = useMemo(() => new ItemMutator(pb), []);

  // Reset loading state after the upload (records are read through the cache)
  const clearLoadingState = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: false }));
  }, []);

  // Upload and analyze an image with AI
  // Uses API route to ensure server-side processing where env vars are available
  const uploadAndAnalyze = useCallback(
    async (file: File) => {
      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        // Use API route for server-side processing
        const formData = new FormData();
        formData.append('file', file);

        const authToken = pb.authStore.token;
        const response = await fetch('/api-next/process-image', {
          method: 'POST',
          headers: {
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to process image');
        }

        // Analysis creates items and containers from the new image, so every
        // list is potentially out of date, not just the images one.
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: qk.imagesPrefix() }),
          invalidateItemCaches(queryClient),
          invalidateContainerCaches(queryClient),
        ]);
        await clearLoadingState();
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error:
            error instanceof Error ? error.message : 'Failed to upload image',
        }));
        throw error;
      }
    },
    [clearLoadingState, queryClient]
  );

  // Search items by query and filters
  const searchItems = useCallback(
    async (query: string, filters?: SearchFilters): Promise<Item[]> => {
      try {
        // Map SearchFilters to ItemSearchFilters format
        const itemFilters = filters
          ? {
              categoryFunctional: filters.functional,
              categorySpecific: filters.specific,
              itemType: filters.itemType,
            }
          : undefined;
        return (await itemMutator.search(query, { filters: itemFilters }))
          .items;
      } catch (error) {
        console.error('Search failed:', error);
        return [];
      }
    },
    [itemMutator]
  );

  // Get items belonging to a specific container
  const getItemsByContainer = useCallback(
    async (containerId: string): Promise<Item[]> => {
      try {
        return (await itemMutator.getByContainer(containerId)).items;
      } catch (error) {
        console.error('Failed to get items by container:', error);
        return [];
      }
    },
    [itemMutator]
  );

  const value: InventoryContextValue = {
    ...state,
    uploadAndAnalyze,
    clearLoadingState,
    searchItems,
    getItemsByContainer,
  };

  return (
    <InventoryContext.Provider value={value}>
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventory() {
  const context = useContext(InventoryContext);
  if (!context) {
    throw new Error('useInventory must be used within InventoryProvider');
  }
  return context;
}

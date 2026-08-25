'use client';

/**
 * Write-path helpers for inventory records.
 *
 * This context no longer holds any records. Reads all go through TanStack Query
 * (`@/hooks/use-items`, `use-containers`, `use-images`, `use-categories`), so
 * what is left here is the mutation side plus the `isLoading` / `error` pair
 * the forms show while one is in flight. After a write the affected query keys
 * are invalidated rather than refetched into local state — the cache is the
 * single copy of the data, and whichever page is mounted re-reads it.
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
import { ItemMutator, ContainerMutator } from '@project/shared';
import pb from '@/lib/pocketbase-client';
import type {
  Item,
  Container,
  ItemInput,
  ContainerInput,
} from '@project/shared';
import type { SearchFilters } from '@/components/inventory';
import { qk } from '@/lib/query';

interface InventoryState {
  isLoading: boolean;
  error: string | null;
}

interface InventoryContextValue extends InventoryState {
  /** Upload an image and analyze it with AI to create items/containers */
  uploadAndAnalyze: (file: File) => Promise<void>;
  /** Reset loading state after mutations */
  clearLoadingState: () => Promise<void>;
  /** Search items by query and optional filters */
  searchItems: (query: string, filters?: SearchFilters) => Promise<Item[]>;
  /** Update an existing item */
  updateItem: (id: string, data: Partial<ItemInput>) => Promise<void>;
  /** Delete an item by ID */
  deleteItem: (id: string) => Promise<void>;
  /** Create a new item */
  createItem: (data: ItemInput) => Promise<Item>;
  /** Update an existing container */
  updateContainer: (id: string, data: Partial<ContainerInput>) => Promise<void>;
  /** Delete a container by ID */
  deleteContainer: (id: string) => Promise<void>;
  /** Create a new container */
  createContainer: (data: ContainerInput) => Promise<Container>;
  /** Get items belonging to a specific container */
  getItemsByContainer: (containerId: string) => Promise<Item[]>;
  /** Add an item to a container */
  addItemToContainer: (itemId: string, containerId: string) => Promise<void>;
  /** Remove an item from its container */
  removeItemFromContainer: (itemId: string) => Promise<void>;
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
  const containerMutator = useMemo(() => new ContainerMutator(pb), []);

  // Reset loading state after mutations (records are read through the query cache)
  const clearLoadingState = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: false }));
  }, []);

  /**
   * Mark the item queries stale after a write.
   *
   * Category values live on items, so the library the comboboxes and filter
   * selects offer moves with them and is dropped in the same breath.
   */
  const invalidateItems = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.itemsPrefix() }),
        queryClient.invalidateQueries({ queryKey: qk.categoriesPrefix() }),
      ]),
    [queryClient]
  );

  const invalidateContainers = useCallback(
    () => queryClient.invalidateQueries({ queryKey: qk.containersPrefix() }),
    [queryClient]
  );

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
          invalidateItems(),
          invalidateContainers(),
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
    [clearLoadingState, invalidateItems, invalidateContainers, queryClient]
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

  // Create a new item
  const createItem = useCallback(
    async (data: ItemInput): Promise<Item> => {
      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));
        const item = await itemMutator.create(data);
        await clearLoadingState();
        await invalidateItems();
        return item;
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error:
            error instanceof Error ? error.message : 'Failed to create item',
        }));
        throw error;
      }
    },
    [itemMutator, clearLoadingState, invalidateItems]
  );

  // Update an existing item
  const updateItem = useCallback(
    async (id: string, data: Partial<ItemInput>) => {
      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));
        await itemMutator.update(id, data as Partial<Item>);
        await clearLoadingState();
        await invalidateItems();
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error:
            error instanceof Error ? error.message : 'Failed to update item',
        }));
        throw error;
      }
    },
    [itemMutator, clearLoadingState, invalidateItems]
  );

  // Delete an item
  const deleteItem = useCallback(
    async (id: string) => {
      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));
        await itemMutator.delete(id);
        await clearLoadingState();
        await invalidateItems();
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error:
            error instanceof Error ? error.message : 'Failed to delete item',
        }));
        throw error;
      }
    },
    [itemMutator, clearLoadingState, invalidateItems]
  );

  // Create a new container
  const createContainer = useCallback(
    async (data: ContainerInput): Promise<Container> => {
      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));
        const container = await containerMutator.create(data);
        await clearLoadingState();
        await invalidateContainers();
        return container;
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to create container',
        }));
        throw error;
      }
    },
    [containerMutator, clearLoadingState, invalidateContainers]
  );

  // Update an existing container
  const updateContainer = useCallback(
    async (id: string, data: Partial<ContainerInput>) => {
      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));
        await containerMutator.update(id, data as Partial<Container>);
        await clearLoadingState();
        await invalidateContainers();
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to update container',
        }));
        throw error;
      }
    },
    [containerMutator, clearLoadingState, invalidateContainers]
  );

  // Delete a container
  const deleteContainer = useCallback(
    async (id: string) => {
      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));
        // First, remove container reference from all items in this container
        const itemsInContainer = (await itemMutator.getByContainer(id)).items;
        for (const item of itemsInContainer) {
          await itemMutator.update(item.id, {
            container: undefined,
          } as Partial<Item>);
        }
        // Then delete the container
        await containerMutator.delete(id);
        await clearLoadingState();
        // Every item in it lost its ContainerRef on the way here.
        await Promise.all([invalidateContainers(), invalidateItems()]);
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to delete container',
        }));
        throw error;
      }
    },
    [
      containerMutator,
      itemMutator,
      clearLoadingState,
      invalidateContainers,
      invalidateItems,
    ]
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

  // Add an item to a container
  const addItemToContainer = useCallback(
    async (itemId: string, containerId: string) => {
      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));
        await itemMutator.update(itemId, {
          container: containerId,
        } as Partial<Item>);
        await clearLoadingState();
        await invalidateItems();
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to add item to container',
        }));
        throw error;
      }
    },
    [itemMutator, clearLoadingState, invalidateItems]
  );

  // Remove an item from its container (set container to undefined)
  const removeItemFromContainer = useCallback(
    async (itemId: string) => {
      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));
        await itemMutator.update(itemId, {
          container: undefined,
        } as Partial<Item>);
        await clearLoadingState();
        await invalidateItems();
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Failed to remove item from container',
        }));
        throw error;
      }
    },
    [itemMutator, clearLoadingState, invalidateItems]
  );

  const value: InventoryContextValue = {
    ...state,
    uploadAndAnalyze,
    clearLoadingState,
    searchItems,
    createItem,
    updateItem,
    deleteItem,
    createContainer,
    updateContainer,
    deleteContainer,
    getItemsByContainer,
    addItemToContainer,
    removeItemFromContainer,
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

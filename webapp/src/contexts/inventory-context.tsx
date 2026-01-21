'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useEffect,
  useMemo,
} from 'react';
import { createInventoryService } from '@/services';
import { ItemMutator, ContainerMutator, ImageMutator } from '@project/shared';
import pb from '@/lib/pocketbase-client';
import type {
  Item,
  Container,
  Image,
  ItemInput,
  ContainerInput,
} from '@project/shared';
import type { CategoryLibrary, SearchFilters } from '@/components/inventory';

interface InventoryState {
  items: Item[];
  containers: Container[];
  images: Map<string, Image>;
  categories: CategoryLibrary;
  isLoading: boolean;
  error: string | null;
}

interface InventoryContextValue extends InventoryState {
  /** Upload an image and analyze it with AI to create items/containers */
  uploadAndAnalyze: (file: File) => Promise<void>;
  /** Refresh the items list from the database */
  refreshItems: () => Promise<void>;
  /** Refresh the containers list from the database */
  refreshContainers: () => Promise<void>;
  /** Refresh the category library from existing items */
  refreshCategories: () => Promise<void>;
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
  /** Get the URL for an image by its ID */
  getImageUrl: (imageId?: string) => string | undefined;
  /** Get the URL for an item's image, falling back to container's image if item has none */
  getItemImageUrl: (item: Item) => string | undefined;
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
    items: [],
    containers: [],
    images: new Map(),
    categories: { functional: [], specific: [], item_type: [] },
    isLoading: false,
    error: null,
  });

  // Create service and mutators - memoized to prevent recreation on every render
  const service = useMemo(() => createInventoryService(pb), []);
  const itemMutator = useMemo(() => new ItemMutator(pb), []);
  const containerMutator = useMemo(() => new ContainerMutator(pb), []);
  const imageMutator = useMemo(() => new ImageMutator(pb), []);

  // Refresh items from the database
  const refreshItems = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      const result = await itemMutator.getList(1, 500);
      setState((prev) => ({ ...prev, items: result.items, isLoading: false }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load items',
      }));
    }
  }, [itemMutator]);

  // Refresh containers from the database
  const refreshContainers = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));
      const result = await containerMutator.getList(1, 500);
      setState((prev) => ({
        ...prev,
        containers: result.items,
        isLoading: false,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error:
          error instanceof Error ? error.message : 'Failed to load containers',
      }));
    }
  }, [containerMutator]);

  // Refresh categories from existing items
  const refreshCategories = useCallback(async () => {
    try {
      const categoryLibrary = await service.getCategoryLibrary();
      setState((prev) => ({ ...prev, categories: categoryLibrary }));
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  }, [service]);

  // Load images into the cache
  const loadImages = useCallback(async () => {
    try {
      const result = await imageMutator.getList(1, 500);
      const imageMap = new Map<string, Image>();
      result.items.forEach((image) => {
        imageMap.set(image.id, image);
      });
      setState((prev) => ({ ...prev, images: imageMap }));
    } catch (error) {
      console.error('Failed to load images:', error);
    }
  }, [imageMutator]);

  // Upload and analyze an image with AI
  // Uses API route to ensure server-side processing where env vars are available
  const uploadAndAnalyze = useCallback(
    async (file: File) => {
      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        // Use API route for server-side processing
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api-next/process-image', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to process image');
        }

        // Refresh all data after successful upload
        await Promise.all([
          refreshItems(),
          refreshContainers(),
          refreshCategories(),
          loadImages(),
        ]);
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
    [refreshItems, refreshContainers, refreshCategories, loadImages]
  );

  // Search items by query and filters
  const searchItems = useCallback(
    async (query: string, filters?: SearchFilters): Promise<Item[]> => {
      try {
        // Map SearchFilters to ItemSearchFilters format
        const itemFilters = filters
          ? {
              category_functional: filters.functional,
              category_specific: filters.specific,
              item_type: filters.item_type,
            }
          : undefined;
        return await itemMutator.search(query, itemFilters);
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
        await refreshItems();
        await refreshCategories();
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
    [itemMutator, refreshItems, refreshCategories]
  );

  // Update an existing item
  const updateItem = useCallback(
    async (id: string, data: Partial<ItemInput>) => {
      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));
        await itemMutator.update(id, data as Partial<Item>);
        await refreshItems();
        await refreshCategories();
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
    [itemMutator, refreshItems, refreshCategories]
  );

  // Delete an item
  const deleteItem = useCallback(
    async (id: string) => {
      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));
        await itemMutator.delete(id);
        await refreshItems();
        await refreshCategories();
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
    [itemMutator, refreshItems, refreshCategories]
  );

  // Create a new container
  const createContainer = useCallback(
    async (data: ContainerInput): Promise<Container> => {
      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));
        const container = await containerMutator.create(data);
        await refreshContainers();
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
    [containerMutator, refreshContainers]
  );

  // Update an existing container
  const updateContainer = useCallback(
    async (id: string, data: Partial<ContainerInput>) => {
      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));
        await containerMutator.update(id, data as Partial<Container>);
        await refreshContainers();
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
    [containerMutator, refreshContainers]
  );

  // Delete a container
  const deleteContainer = useCallback(
    async (id: string) => {
      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));
        // First, remove container reference from all items in this container
        const itemsInContainer = await itemMutator.getByContainer(id);
        for (const item of itemsInContainer) {
          await itemMutator.update(item.id, {
            container: undefined,
          } as Partial<Item>);
        }
        // Then delete the container
        await containerMutator.delete(id);
        await Promise.all([refreshContainers(), refreshItems()]);
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
    [containerMutator, itemMutator, refreshContainers, refreshItems]
  );

  // Get items belonging to a specific container
  const getItemsByContainer = useCallback(
    async (containerId: string): Promise<Item[]> => {
      try {
        return await itemMutator.getByContainer(containerId);
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
        await refreshItems();
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
    [itemMutator, refreshItems]
  );

  // Remove an item from its container (set container to undefined)
  const removeItemFromContainer = useCallback(
    async (itemId: string) => {
      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));
        await itemMutator.update(itemId, {
          container: undefined,
        } as Partial<Item>);
        await refreshItems();
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
    [itemMutator, refreshItems]
  );

  // Get the URL for an image by its ID
  const getImageUrl = useCallback(
    (imageId?: string): string | undefined => {
      if (!imageId) return undefined;
      const image = state.images.get(imageId);
      if (!image) return undefined;
      return pb.files.getUrl(image, image.file as string);
    },
    [state.images]
  );

  // Get the URL for an item's image, falling back to container's image if item has none
  const getItemImageUrl = useCallback(
    (item: Item): string | undefined => {
      // First try the item's primary image
      if (item.primary_image) {
        const url = getImageUrl(item.primary_image);
        if (url) return url;
      }

      // Fallback to container's primary image if item doesn't have one
      if (item.container) {
        const container = state.containers.find((c) => c.id === item.container);
        if (container?.primary_image) {
          return getImageUrl(container.primary_image);
        }
      }

      return undefined;
    },
    [state.containers, getImageUrl]
  );

  // Initial data load
  useEffect(() => {
    const loadInitialData = async () => {
      setState((prev) => ({ ...prev, isLoading: true }));
      try {
        await Promise.all([
          refreshItems(),
          refreshContainers(),
          refreshCategories(),
          loadImages(),
        ]);
      } catch (error) {
        console.error('Failed to load initial data:', error);
      } finally {
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    };

    loadInitialData();
  }, [refreshItems, refreshContainers, refreshCategories, loadImages]);

  const value: InventoryContextValue = {
    ...state,
    uploadAndAnalyze,
    refreshItems,
    refreshContainers,
    refreshCategories,
    searchItems,
    createItem,
    updateItem,
    deleteItem,
    createContainer,
    updateContainer,
    deleteContainer,
    getImageUrl,
    getItemImageUrl,
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

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import pb from '@/lib/pocketbase-client';
import { ItemMutator, ContainerMutator, ImageMutator } from '@project/shared';
import type { Item, Container, Image } from '@project/shared';
import type { CategoryLibrary, SearchFilters } from '@/components/inventory';
import {
  ImageUpload,
  SearchFilter,
  ItemCard,
  ContainerCard,
} from '@/components/inventory';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Loader2, Plus, Box, Package } from 'lucide-react';

const ITEMS_PER_PAGE = 12;

export default function InventoryPage() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [containers, setContainers] = useState<Container[]>([]);
  const [images, setImages] = useState<Map<string, Image>>(new Map());
  const [categories, setCategories] = useState<CategoryLibrary>({
    functional: [],
    specific: [],
    itemType: [],
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({});
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'items' | 'containers'>('items');
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualDialog, setManualDialog] = useState<{
    open: boolean;
    imageId?: string;
  }>({ open: false });

  const itemMutator = useMemo(() => new ItemMutator(pb), []);
  const containerMutator = useMemo(() => new ContainerMutator(pb), []);
  const imageMutator = useMemo(() => new ImageMutator(pb), []);

  const loadImages = useCallback(
    async (imageIds: string[]) => {
      try {
        const currentImages = images;
        const newImages = new Map(currentImages);
        const imagesToLoad: string[] = [];

        for (const imageId of imageIds) {
          if (!newImages.has(imageId)) {
            imagesToLoad.push(imageId);
          }
        }

        for (const imageId of imagesToLoad) {
          try {
            const image = await imageMutator.getById(imageId);
            if (image) {
              newImages.set(imageId, image);
            }
          } catch {
            // Ignore errors for individual images
          }
        }

        if (imagesToLoad.length > 0) {
          setImages(newImages);
        }
      } catch (error) {
        console.error('Failed to load images:', error);
      }
    },
    [images, imageMutator]
  );

  const loadItems = useCallback(async () => {
    try {
      const results = await itemMutator.search(searchQuery, {
        categoryFunctional: searchFilters.functional,
        categorySpecific: searchFilters.specific,
        itemType: searchFilters.itemType,
      });
      setItems(results);
      setCurrentPage(1); // Reset to first page on new search

      // Load images for items
      const imageIds = results
        .map((item) => item.primaryImage)
        .filter((id): id is string => Boolean(id));
      await loadImages(imageIds);
    } catch (error) {
      console.error('Failed to load items:', error);
      toast.error('Failed to load items');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, searchFilters, loadImages]);

  const loadContainers = useCallback(async () => {
    try {
      const results = await containerMutator.search('');
      setContainers(results);

      // Load images for containers
      const imageIds = results
        .map((container) => container.primaryImage)
        .filter((id): id is string => Boolean(id));
      await loadImages(imageIds);
    } catch (error) {
      console.error('Failed to load containers:', error);
      toast.error('Failed to load containers');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadImages]);

  const loadCategories = useCallback(async () => {
    try {
      const categoryLibrary = await itemMutator.getDistinctCategories();
      setCategories(categoryLibrary);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      await Promise.all([loadItems(), loadContainers(), loadCategories()]);
    } catch (error) {
      console.error('Failed to load inventory data:', error);
      toast.error('Failed to load inventory data');
    } finally {
      setIsLoading(false);
    }
  }, [loadItems, loadContainers, loadCategories]);

  // Load initial data
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Listen for background upload completion events to refresh data
  useEffect(() => {
    const handleUpdate = () => {
      loadData();
    };
    window.addEventListener('inventory-updated', handleUpdate);
    return () => window.removeEventListener('inventory-updated', handleUpdate);
  }, [loadData]);

  // Reload data when search/filters change
  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Removed local scale-out logic as it is now handled by UploadContext

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      await itemMutator.delete(itemId);
      toast.success('Item deleted successfully');
      await loadItems();
    } catch (error) {
      console.error('Failed to delete item:', error);
      toast.error('Failed to delete item');
    }
  };

  const handleDeleteContainer = async (containerId: string) => {
    // Check if container has items
    const containerItems = items.filter(
      (item) => item.container === containerId
    );
    if (containerItems.length > 0) {
      if (
        !confirm(
          `This container has ${containerItems.length} items. Delete anyway?`
        )
      ) {
        return;
      }
    }

    try {
      await containerMutator.delete(containerId);
      toast.success('Container deleted successfully');
      await loadContainers();
      await loadItems(); // Reload items to update container references
    } catch (error) {
      console.error('Failed to delete container:', error);
      toast.error('Failed to delete container');
    }
  };

  const getImageUrl = (imageId?: string): string | undefined => {
    if (!imageId) return undefined;
    const image = images.get(imageId);
    if (!image) return undefined;
    return imageMutator.getFileUrl(image);
  };

  const getItemImageUrl = (item: Item): string | undefined => {
    // First try the item's primary image
    if (item.primaryImage) {
      const url = getImageUrl(item.primaryImage);
      if (url) return url;
    }

    // Fallback to container's primary image if item doesn't have one
    if (item.container) {
      const container = containers.find((c) => c.id === item.container);
      if (container?.primaryImage) {
        return getImageUrl(container.primaryImage);
      }
    }

    return undefined;
  };

  const getContainerItemCount = (containerId: string): number => {
    return items.filter((item) => item.container === containerId).length;
  };

  // Pagination
  const paginatedItems = items.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );
  const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Inventory Manager</h1>
          <p className="text-muted-foreground">
            Upload images to automatically catalog items and containers
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => router.push('/inventory/items/new')}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Item
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push('/inventory/containers/new')}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Container
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center space-x-2 justify-end">
          <Switch
            id="manual-mode"
            checked={isManualMode}
            onCheckedChange={setIsManualMode}
          />
          <Label htmlFor="manual-mode">
            Manual Labeling Mode {isManualMode ? '(On)' : '(Off)'}
          </Label>
        </div>

        <ImageUpload isManualMode={isManualMode} />
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'items' | 'containers')}
      >
        <TabsList>
          <TabsTrigger value="items">Items ({items.length})</TabsTrigger>
          <TabsTrigger value="containers">
            Containers ({containers.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="space-y-6">
          <SearchFilter
            query={searchQuery}
            onQueryChange={setSearchQuery}
            categories={categories}
            selectedFilters={searchFilters}
            onFilterChange={setSearchFilters}
          />

          {paginatedItems.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {searchQuery || Object.keys(searchFilters).length > 0
                  ? 'No items match your search criteria'
                  : 'No items yet. Upload an image or create an item manually.'}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {paginatedItems.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    imageUrl={getItemImageUrl(item)}
                    boundingBox={
                      item.primaryImage ? item.primaryImageBbox : undefined
                    }
                    onClick={() => router.push(`/inventory/items/${item.id}`)}
                    onEdit={() =>
                      router.push(`/inventory/items/${item.id}/edit`)
                    }
                    onDelete={() => handleDeleteItem(item.id)}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="containers" className="space-y-6">
          {containers.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                No containers yet. Upload an image or create a container
                manually.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {containers.map((container) => (
                <ContainerCard
                  key={container.id}
                  container={container}
                  imageUrl={getImageUrl(container.primaryImage)}
                  boundingBox={container.primaryImageBbox}
                  itemCount={getContainerItemCount(container.id)}
                  onClick={() =>
                    router.push(`/inventory/containers/${container.id}`)
                  }
                  onEdit={() =>
                    router.push(`/inventory/containers/${container.id}/edit`)
                  }
                  onDelete={() => handleDeleteContainer(container.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog
        open={manualDialog.open}
        onOpenChange={(open) => setManualDialog((prev) => ({ ...prev, open }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Entry</DialogTitle>
            <DialogDescription>
              What would you like to create from this image?
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <Button
              variant="outline"
              className="h-32 flex flex-col items-center justify-center gap-4 hover:bg-primary/5 hover:border-primary"
              onClick={() => {
                if (manualDialog.imageId) {
                  router.push(
                    `/inventory/items/new?imageId=${manualDialog.imageId}`
                  );
                }
              }}
            >
              <Package className="h-10 w-10 text-primary" />
              <span className="font-semibold">New Item</span>
            </Button>
            <Button
              variant="outline"
              className="h-32 flex flex-col items-center justify-center gap-4 hover:bg-primary/5 hover:border-primary"
              onClick={() => {
                if (manualDialog.imageId) {
                  router.push(
                    `/inventory/containers/new?imageId=${manualDialog.imageId}`
                  );
                }
              }}
            >
              <Box className="h-10 w-10 text-primary" />
              <span className="font-semibold">New Container</span>
            </Button>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() =>
                setManualDialog((prev) => ({ ...prev, open: false }))
              }
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

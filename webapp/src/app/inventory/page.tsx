'use client';

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  Suspense,
  useRef,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import {
  Loader2,
  Plus,
  Box,
  Package,
  Image as ImageIcon,
  PenTool,
} from 'lucide-react';
import { useUpload } from '@/contexts/upload-context';

const ITEMS_PER_PAGE = 12;

function InventoryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { queue, clearCompleted, addFiles } = useUpload();

  // Initialize state from query string
  const initialPage = Math.max(
    1,
    parseInt(searchParams.get('page') || '1', 10)
  );
  const initialTab =
    (searchParams.get('tab') as 'items' | 'containers') || 'items';

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
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [activeTab, setActiveTab] = useState<'items' | 'containers'>(
    initialTab === 'containers' ? 'containers' : 'items'
  );

  // Logic state
  const [isAIEnabled, setIsAIEnabled] = useState(true);
  const [isManualMode, setIsManualMode] = useState(false);
  const handledUploads = useRef<Set<string>>(new Set());

  // Dialog state
  const [createOptionDialog, setCreateOptionDialog] = useState<{
    open: boolean;
    type: 'item' | 'container';
  }>({ open: false, type: 'item' });

  const itemMutator = useMemo(() => new ItemMutator(pb), []);
  const containerMutator = useMemo(() => new ContainerMutator(pb), []);
  const imageMutator = useMemo(() => new ImageMutator(pb), []);

  // Fetch Config
  useEffect(() => {
    fetch('/api-next/config')
      .then((res) => res.json())
      .then((data) => {
        setIsAIEnabled(data.isAIEnabled);
        if (!data.isAIEnabled) {
          setIsManualMode(true);
        }
      })
      .catch(console.error);
  }, []);

  // Watch Upload Queue for Manual Completions
  useEffect(() => {
    const newManualCompleted = queue.filter(
      (item) =>
        item.status === 'completed' &&
        item.isManualMode &&
        item.imageId &&
        !handledUploads.current.has(item.id)
    );

    if (newManualCompleted.length > 0) {
      newManualCompleted.forEach((item) => handledUploads.current.add(item.id));

      if (newManualCompleted.length === 1) {
        // Redirect to wizard for single item
        const imageId = newManualCompleted[0].imageId;
        router.push(`/inventory/images/${imageId}/wizard`);
      } else {
        // Show toast for multiple items
        const firstImageId = newManualCompleted[0].imageId;
        toast.success(`${newManualCompleted.length} images uploaded.`, {
          action: {
            label: 'Label First',
            onClick: () =>
              router.push(`/inventory/images/${firstImageId}/wizard`),
          },
          duration: 5000,
        });
      }
    }
  }, [queue, router]);

  const loadItems = useCallback(async () => {
    try {
      // Fetch items with expanded primaryImage to avoid N+1 queries
      const results = await itemMutator.search(
        searchQuery,
        {
          categoryFunctional: searchFilters.functional,
          categorySpecific: searchFilters.specific,
          itemType: searchFilters.itemType,
        },
        'primaryImage'
      );
      setItems(results);

      // Extract expanded images into cache
      setImages((prev) => {
        const newImages = new Map(prev);
        for (const item of results) {
          const expanded = item as Item & { expand?: { primaryImage?: Image } };
          if (expanded.expand?.primaryImage) {
            newImages.set(
              expanded.expand.primaryImage.id,
              expanded.expand.primaryImage
            );
          }
        }
        return newImages;
      });
    } catch (error) {
      console.error('Failed to load items:', error);
      toast.error('Failed to load items');
    }
  }, [searchQuery, searchFilters, itemMutator]);

  const loadContainers = useCallback(async () => {
    try {
      // Fetch containers with expanded primaryImage to avoid N+1 queries
      const results = await containerMutator.search('', 'primaryImage');
      setContainers(results);

      // Extract expanded images into cache
      setImages((prev) => {
        const newImages = new Map(prev);
        for (const container of results) {
          const expanded = container as Container & {
            expand?: { primaryImage?: Image };
          };
          if (expanded.expand?.primaryImage) {
            newImages.set(
              expanded.expand.primaryImage.id,
              expanded.expand.primaryImage
            );
          }
        }
        return newImages;
      });
    } catch (error) {
      console.error('Failed to load containers:', error);
      toast.error('Failed to load containers');
    }
  }, [containerMutator]);

  const loadCategories = useCallback(async () => {
    try {
      const categoryLibrary = await itemMutator.getDistinctCategories();
      setCategories(categoryLibrary);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  }, [itemMutator]);

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

  // Reset page to 1 when search query or filters change
  useEffect(() => {
    if (currentPage !== 1) {
      handlePageChange(1);
    }
    // Only reset when search/filters change, not when currentPage or handlePageChange changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, searchFilters]);

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

  // Update URL when page or tab changes
  const updateUrl = useCallback(
    (newPage: number, newTab: 'items' | 'containers') => {
      const params = new URLSearchParams();
      if (newPage > 1) {
        params.set('page', newPage.toString());
      }
      if (newTab !== 'items') {
        params.set('tab', newTab);
      }
      const query = params.toString();
      router.replace(query ? `?${query}` : '/inventory', { scroll: false });
    },
    [router]
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      setCurrentPage(newPage);
      updateUrl(newPage, activeTab);
    },
    [activeTab, updateUrl]
  );

  const handleTabChange = useCallback(
    (newTab: 'items' | 'containers') => {
      setActiveTab(newTab);
      setCurrentPage(1); // Reset page when switching tabs
      updateUrl(1, newTab);
    },
    [updateUrl]
  );

  // Pagination
  const paginatedItems = items.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );
  const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);

  // Ensure current page is valid when items change
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      handlePageChange(totalPages);
    }
  }, [totalPages, currentPage, handlePageChange]);

  const handleStartWithImage = () => {
    setCreateOptionDialog((prev) => ({ ...prev, open: false }));
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        addFiles(Array.from(files), true); // Force manual mode
      }
    };
    input.click();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container py-4 sm:py-8 space-y-6 sm:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Inventory Manager</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Upload images to automatically catalog items and containers
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => setCreateOptionDialog({ open: true, type: 'item' })}
            className="w-full sm:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Item
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              setCreateOptionDialog({ open: true, type: 'container' })
            }
            className="w-full sm:w-auto"
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
            disabled={!isAIEnabled}
          />
          <Label htmlFor="manual-mode" className="text-sm sm:text-base">
            Manual Labeling Mode {isManualMode ? '(On)' : '(Off)'}
          </Label>
        </div>

        <ImageUpload isManualMode={isManualMode} />
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(v) => handleTabChange(v as 'items' | 'containers')}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
                <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
                  <Button
                    variant="outline"
                    onClick={() =>
                      handlePageChange(Math.max(1, currentPage - 1))
                    }
                    disabled={currentPage === 1}
                    className="w-full sm:w-auto"
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() =>
                      handlePageChange(Math.min(totalPages, currentPage + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="w-full sm:w-auto"
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
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
        open={createOptionDialog.open}
        onOpenChange={(open) =>
          setCreateOptionDialog((prev) => ({ ...prev, open }))
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Create New{' '}
              {createOptionDialog.type === 'item' ? 'Item' : 'Container'}
            </DialogTitle>
            <DialogDescription>
              How would you like to create this {createOptionDialog.type}?
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <Button
              variant="outline"
              className="h-32 flex flex-col items-center justify-center gap-4 hover:bg-primary/5 hover:border-primary"
              onClick={handleStartWithImage}
            >
              <ImageIcon className="h-10 w-10 text-primary" />
              <span className="font-semibold">Start with Image</span>
            </Button>
            <Button
              variant="outline"
              className="h-32 flex flex-col items-center justify-center gap-4 hover:bg-primary/5 hover:border-primary"
              onClick={() => {
                setCreateOptionDialog((prev) => ({ ...prev, open: false }));
                router.push(`/inventory/${createOptionDialog.type}s/new`);
              }}
            >
              <PenTool className="h-10 w-10 text-primary" />
              <span className="font-semibold">Manual Entry</span>
            </Button>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() =>
                setCreateOptionDialog((prev) => ({ ...prev, open: false }))
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

export default function InventoryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <InventoryPageContent />
    </Suspense>
  );
}

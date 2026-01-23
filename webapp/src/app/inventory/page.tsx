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
import type {
  CategoryLibrary,
  SearchFilters,
  BulkEditData,
} from '@/components/inventory';
import {
  ImageUpload,
  SearchFilter,
  ItemCard,
  ContainerCard,
  BulkEditDialog,
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
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
  Loader2,
  Plus,
  Image as ImageIcon,
  PenTool,
  Sparkles,
  HelpCircle,
  Search,
  CheckSquare,
  X,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useUpload } from '@/contexts/upload-context';

const ITEMS_PER_PAGE = 12;

function InventoryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { queue, addFiles } = useUpload();

  // Parse URL parameters
  const tabParam = searchParams.get('tab');
  const pageParam = searchParams.get('page');
  const searchParam = searchParams.get('q') || '';
  const functionalParam = searchParams.get('functional');
  const specificParam = searchParams.get('specific');
  const typeParam = searchParams.get('type');

  const activeTab = (tabParam === 'containers' ? 'containers' : 'items') as
    | 'items'
    | 'containers';
  const currentPage = Math.max(1, parseInt(pageParam || '1', 10));

  // Local state for search input (debounced sync to URL)
  const [queryInput, setQueryInput] = useState(searchParam);

  // Sync queryInput with URL if URL changes externally
  useEffect(() => {
    setQueryInput(searchParam);
  }, [searchParam]);

  const [items, setItems] = useState<Item[]>([]);
  const [containers, setContainers] = useState<Container[]>([]);
  const [images, setImages] = useState<Map<string, Image>>(new Map());
  const [categories, setCategories] = useState<CategoryLibrary>({
    functional: [],
    specific: [],
    itemType: [],
  });
  const [isLoading, setIsLoading] = useState(true);

  // Logic state
  const [useAIAnalysis, setUseAIAnalysis] = useState(true);
  const [isSystemAIEnabled, setIsSystemAIEnabled] = useState(false);
  const handledUploads = useRef<Set<string>>(new Set());

  // Bulk Edit State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isBulkEditDialogOpen, setIsBulkEditDialogOpen] = useState(false);

  // Dialog state
  const [createOptionDialog, setCreateOptionDialog] = useState<{
    open: boolean;
    type: 'item' | 'container';
  }>({ open: false, type: 'item' });

  const itemMutator = useMemo(() => new ItemMutator(pb), []);
  const containerMutator = useMemo(() => new ContainerMutator(pb), []);
  const imageMutator = useMemo(() => new ImageMutator(pb), []);

  // Fetch Config & User Preference
  useEffect(() => {
    const storedPref = localStorage.getItem('inventory_use_ai_analysis');
    const userPref = storedPref === null ? true : storedPref === 'true';

    fetch('/api-next/config')
      .then((res) => res.json())
      .then((data) => {
        setIsSystemAIEnabled(data.isAIEnabled);
        if (!data.isAIEnabled) {
          setUseAIAnalysis(false);
        } else {
          setUseAIAnalysis(userPref);
        }
      })
      .catch(console.error);
  }, []);

  const handleAIToggle = (checked: boolean) => {
    setUseAIAnalysis(checked);
    localStorage.setItem('inventory_use_ai_analysis', String(checked));
  };

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

  // Load Categories
  const loadCategories = useCallback(async () => {
    try {
      const categoryLibrary = await itemMutator.getDistinctCategories();
      setCategories(categoryLibrary);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  }, [itemMutator]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // Load Items based on URL params
  const loadItems = useCallback(async () => {
    try {
      const results = await itemMutator.search(
        searchParam,
        {
          categoryFunctional: functionalParam || undefined,
          categorySpecific: specificParam || undefined,
          itemType: typeParam || undefined,
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
  }, [searchParam, functionalParam, specificParam, typeParam, itemMutator]);

  // Load Containers based on URL params
  const loadContainers = useCallback(async () => {
    try {
      // Fetch containers with expanded primaryImage to avoid N+1 queries
      // Also apply search query
      const results = await containerMutator.search(
        searchParam,
        'primaryImage'
      );
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
  }, [containerMutator, searchParam]);

  // Main Data Loading Effect
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'items') {
        await loadItems();
        await loadContainers();
      } else {
        await loadContainers();
        await loadItems(); // Load items to get counts for containers
      }
    } catch (error) {
      console.error('Failed to load inventory data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, loadItems, loadContainers]);

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

  const updateUrl = useCallback(
    (updates: {
      tab?: 'items' | 'containers';
      page?: number;
      q?: string;
      functional?: string;
      specific?: string;
      type?: string;
    }) => {
      const params = new URLSearchParams(searchParams.toString());

      if (updates.tab !== undefined) {
        params.set('tab', updates.tab);
        // Reset page on tab change
        if (!updates.page) params.delete('page');
      }

      if (updates.page !== undefined) {
        if (updates.page > 1) params.set('page', updates.page.toString());
        else params.delete('page');
      }

      if (updates.q !== undefined) {
        if (updates.q) params.set('q', updates.q);
        else params.delete('q');
      }

      if (updates.functional !== undefined) {
        if (updates.functional) params.set('functional', updates.functional);
        else params.delete('functional');
      }

      if (updates.specific !== undefined) {
        if (updates.specific) params.set('specific', updates.specific);
        else params.delete('specific');
      }

      if (updates.type !== undefined) {
        if (updates.type) params.set('type', updates.type);
        else params.delete('type');
      }

      router.push(`/inventory?${params.toString()}`);
    },
    [searchParams, router]
  );

  // Debounce search update
  useEffect(() => {
    const timer = setTimeout(() => {
      if (queryInput !== searchParam) {
        updateUrl({ q: queryInput, page: 1 });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [queryInput, searchParam, updateUrl]);

  const handleTabChange = (newTab: 'items' | 'containers') => {
    if (newTab === activeTab) return;
    updateUrl({ tab: newTab, page: 1 });
    // Exit selection mode on tab change
    if (isSelectionMode) {
      toggleSelectionMode();
    }
  };

  const handlePageChange = (newPage: number) => {
    updateUrl({ page: newPage });
  };

  const handleFilterChange = (filters: SearchFilters) => {
    updateUrl({
      functional: filters.functional || '',
      specific: filters.specific || '',
      type: filters.itemType || '',
      page: 1,
    });
  };

  // Bulk Actions
  const toggleSelectionMode = () => {
    setIsSelectionMode((prev) => {
      if (prev) {
        setSelectedItems(new Set()); // Clear on exit
      }
      return !prev;
    });
  };

  const toggleItemSelection = (id: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (
      !confirm(`Are you sure you want to delete ${selectedItems.size} items?`)
    )
      return;

    try {
      await Promise.all(
        Array.from(selectedItems).map((id) => itemMutator.delete(id))
      );
      toast.success(`Deleted ${selectedItems.size} items`);
      setSelectedItems(new Set());
      setIsSelectionMode(false);
      await loadItems();
    } catch (error) {
      console.error('Failed to bulk delete:', error);
      toast.error('Failed to bulk delete items');
    }
  };

  const handleBulkEditConfirm = async (data: BulkEditData) => {
    try {
      await Promise.all(
        Array.from(selectedItems).map((id) => itemMutator.update(id, data))
      );
      toast.success(`Updated ${selectedItems.size} items`);
      setSelectedItems(new Set());
      setIsSelectionMode(false);
      await loadItems();
    } catch (error) {
      console.error('Failed to bulk update:', error);
      toast.error('Failed to bulk update items');
    }
  };

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
    if (item.primaryImage) {
      const url = getImageUrl(item.primaryImage);
      if (url) return url;
    }
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

  // Pagination Logic
  const activeList = activeTab === 'items' ? items : containers;
  const paginatedList = activeList.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );
  const totalPages = Math.ceil(activeList.length / ITEMS_PER_PAGE);

  // Validate page
  useEffect(() => {
    if (!isLoading && totalPages > 0 && currentPage > totalPages) {
      handlePageChange(totalPages);
    }
  }, [totalPages, currentPage, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading && items.length === 0 && containers.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container py-4 sm:py-8 space-y-6 sm:space-y-8 relative">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Inventory Manager</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Upload images to automatically catalog items and containers
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          {activeTab === 'items' && (
            <Button
              variant={isSelectionMode ? 'secondary' : 'outline'}
              onClick={toggleSelectionMode}
              className="w-full sm:w-auto"
            >
              {isSelectionMode ? (
                <X className="h-4 w-4 mr-2" />
              ) : (
                <CheckSquare className="h-4 w-4 mr-2" />
              )}
              {isSelectionMode ? 'Cancel Selection' : 'Select Items'}
            </Button>
          )}
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
          <div className="flex items-center gap-2">
            <Switch
              id="ai-mode"
              checked={useAIAnalysis}
              onCheckedChange={handleAIToggle}
              disabled={!isSystemAIEnabled}
            />
            <Label
              htmlFor="ai-mode"
              className={cn(
                'text-sm sm:text-base flex items-center gap-2 transition-colors',
                useAIAnalysis ? 'font-bold' : 'text-muted-foreground'
              )}
            >
              AI Image Analysis {useAIAnalysis ? '(On)' : '(Off)'}
              {useAIAnalysis && <Sparkles className="h-4 w-4 text-green-600" />}
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help opacity-50 hover:opacity-100 transition-opacity" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">
                  When enabled, images are automatically analyzed by AI to
                  detect items and details. Turn off to manually label images
                  via the wizard instead.
                  {!isSystemAIEnabled && (
                    <span className="block mt-1 text-red-400 font-semibold">
                      AI is currently disabled by system configuration.
                    </span>
                  )}
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <ImageUpload isManualMode={!useAIAnalysis} />
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
            query={queryInput}
            onQueryChange={setQueryInput}
            categories={categories}
            selectedFilters={{
              functional: functionalParam || undefined,
              specific: specificParam || undefined,
              itemType: typeParam || undefined,
            }}
            onFilterChange={handleFilterChange}
          />

          {paginatedList.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {searchParam || functionalParam || specificParam || typeParam
                  ? 'No items match your search criteria'
                  : 'No items yet. Upload an image or create an item manually.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {paginatedList.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item as Item}
                  imageUrl={getItemImageUrl(item as Item)}
                  boundingBox={
                    (item as Item).primaryImage
                      ? (item as Item).primaryImageBbox
                      : undefined
                  }
                  onClick={() => router.push(`/inventory/items/${item.id}`)}
                  onEdit={() => router.push(`/inventory/items/${item.id}/edit`)}
                  onClone={() =>
                    router.push(`/inventory/items/new?clone_from=${item.id}`)
                  }
                  onDelete={() => handleDeleteItem(item.id)}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedItems.has(item.id)}
                  onToggleSelect={() => toggleItemSelection(item.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="containers" className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="container-search">Search Containers</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="container-search"
                placeholder="Search containers..."
                value={queryInput}
                onChange={(e) => setQueryInput(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {paginatedList.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">
                {searchParam
                  ? 'No containers match your search'
                  : 'No containers yet. Upload an image or create a container manually.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {paginatedList.map((container) => (
                <ContainerCard
                  key={container.id}
                  container={container as Container}
                  imageUrl={getImageUrl((container as Container).primaryImage)}
                  boundingBox={(container as Container).primaryImageBbox}
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

      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
          <Button
            variant="outline"
            onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
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

      {selectedItems.size > 0 && (
        <div className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 bg-background border rounded-lg shadow-lg p-3 sm:p-4 flex flex-col sm:flex-row items-center gap-2 sm:gap-4 z-50 max-w-[calc(100%-2rem)] sm:max-w-none">
          <span className="font-medium text-sm sm:text-base">
            {selectedItems.size} selected
          </span>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              onClick={() => setIsBulkEditDialogOpen(true)}
              className="flex-1 sm:flex-none"
            >
              Edit
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              className="flex-1 sm:flex-none"
            >
              Delete
            </Button>
          </div>
        </div>
      )}

      <BulkEditDialog
        open={isBulkEditDialogOpen}
        onOpenChange={setIsBulkEditDialogOpen}
        selectedCount={selectedItems.size}
        onConfirm={handleBulkEditConfirm}
        categories={categories}
      />

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

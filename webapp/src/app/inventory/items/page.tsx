'use client';

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  Suspense,
  useRef,
} from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import pb from '@/lib/pocketbase-client';
import { ItemMutator, ImageMutator } from '@project/shared';
import type { Item, Image } from '@project/shared';
import type {
  CategoryLibrary,
  SearchFilters,
  BulkEditData,
} from '@/components/inventory';
import {
  ImageUpload,
  SearchFilter,
  ItemCard,
  BulkEditDialog,
  PaginationControls,
  SortSelect,
} from '@/components/inventory';
import { Button } from '@/components/ui/button';
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
  Image as ImageIcon,
  PenTool,
  Sparkles,
  CheckSquare,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUpload } from '@/contexts/upload-context';
import { useConfirm } from '@/components/ui/confirm-dialog';

const ITEMS_PER_PAGE = 12;

function ItemsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { queue, addFiles } = useUpload();
  const { confirm } = useConfirm();

  // Initialize state from query string
  const [initialState] = useState(() => ({
    page: Math.max(1, parseInt(searchParams.get('page') || '1', 10)),
    sort: searchParams.get('sort') || '-created',
    query: searchParams.get('q') || '',
    filters: {
      functional: searchParams.get('functional') || undefined,
      specific: searchParams.get('specific') || undefined,
      itemType: searchParams.get('itemType') || undefined,
    } as SearchFilters,
  }));

  const [items, setItems] = useState<Item[]>([]);
  const [images, setImages] = useState<Map<string, Image>>(new Map());
  const [categories, setCategories] = useState<CategoryLibrary>({
    functional: [],
    specific: [],
    itemType: [],
  });

  // Search/Sort State
  const [searchQuery, setSearchQuery] = useState(initialState.query);
  const [sortValue, setSortValue] = useState(initialState.sort);
  const [searchFilters, setSearchFilters] = useState<SearchFilters>(
    initialState.filters
  );

  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(initialState.page);

  // Bulk Edit State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isBulkEditDialogOpen, setIsBulkEditDialogOpen] = useState(false);

  // Logic state
  const [useAIAnalysis, setUseAIAnalysis] = useState(true);
  const [isSystemAIEnabled, setIsSystemAIEnabled] = useState(false);
  const handledUploads = useRef<Set<string>>(new Set());

  // Dialog state
  const [createOptionDialog, setCreateOptionDialog] = useState<{
    open: boolean;
    type: 'item' | 'container';
  }>({ open: false, type: 'item' });

  const itemMutator = useMemo(() => new ItemMutator(pb), []);
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

  // Watch Upload Queue
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
        const imageId = newManualCompleted[0].imageId;
        router.push(`/inventory/images/${imageId}/wizard`);
      } else {
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
      const results = await itemMutator.search(
        searchQuery,
        {
          categoryFunctional: searchFilters.functional,
          categorySpecific: searchFilters.specific,
          itemType: searchFilters.itemType,
        },
        'ImageRef',
        sortValue
      );
      setItems(results);

      setImages((prev) => {
        const newImages = new Map(prev);
        for (const item of results) {
          const expanded = item as Item & { expand?: { ImageRef?: Image } };
          if (expanded.expand?.ImageRef) {
            newImages.set(
              expanded.expand.ImageRef.id,
              expanded.expand.ImageRef
            );
          }
        }
        return newImages;
      });
    } catch (error) {
      console.error('Failed to load items:', error);
      toast.error('Failed to load items');
    }
  }, [searchQuery, searchFilters, sortValue, itemMutator]);

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
      await Promise.all([loadItems(), loadCategories()]);
    } catch (error) {
      console.error('Failed to load inventory data:', error);
      toast.error('Failed to load inventory data');
    } finally {
      setIsLoading(false);
    }
  }, [loadItems, loadCategories]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const handleUpdate = () => {
      loadData();
    };
    window.addEventListener('inventory-updated', handleUpdate);
    return () => window.removeEventListener('inventory-updated', handleUpdate);
  }, [loadData]);

  // Sync state FROM URL
  useEffect(() => {
    const q = searchParams.get('q') || '';
    if (q !== searchQuery) setSearchQuery(q);

    const sort = searchParams.get('sort') || '-created';
    if (sort !== sortValue) setSortValue(sort);

    const functional = searchParams.get('functional') || undefined;
    const specific = searchParams.get('specific') || undefined;
    const itemType = searchParams.get('itemType') || undefined;

    setSearchFilters((prev) => {
      if (
        prev.functional === functional &&
        prev.specific === specific &&
        prev.itemType === itemType
      )
        return prev;
      return { functional, specific, itemType };
    });

    const page = parseInt(searchParams.get('page') || '1', 10);
    if (page !== currentPage) setCurrentPage(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Sync state TO URL
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (currentPage > 1) params.set('page', currentPage.toString());
      if (searchQuery) params.set('q', searchQuery);
      if (sortValue !== '-created') params.set('sort', sortValue);
      if (searchFilters.functional)
        params.set('functional', searchFilters.functional);
      if (searchFilters.specific)
        params.set('specific', searchFilters.specific);
      if (searchFilters.itemType)
        params.set('itemType', searchFilters.itemType);

      const query = params.toString();
      const url = query ? `?${query}` : pathname;

      const currentParams = new URLSearchParams(searchParams.toString());
      if (query !== currentParams.toString()) {
        router.push(url, { scroll: false });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [
    searchQuery,
    sortValue,
    searchFilters,
    currentPage,
    router,
    pathname,
    searchParams,
  ]);

  // Reload items when search/filters/sort change
  useEffect(() => {
    loadItems();
  }, [searchQuery, searchFilters, sortValue, loadItems]);

  const handleDeleteItem = async (itemId: string) => {
    if (!(await confirm('Are you sure you want to delete this item?'))) return;

    try {
      await itemMutator.delete(itemId);
      toast.success('Item deleted successfully');
      await loadItems();
    } catch (error) {
      console.error('Failed to delete item:', error);
      toast.error('Failed to delete item');
    }
  };

  const getItemImageUrl = (item: Item): string | undefined => {
    if (item.ImageRef) {
      const image = images.get(item.ImageRef);
      if (image) return imageMutator.getFileUrl(image);
    }
    return undefined;
  };

  const handlePageChange = useCallback((newPage: number) => {
    setCurrentPage(newPage);
  }, []);

  // Bulk Edit Handlers
  const toggleSelectionMode = () => {
    setIsSelectionMode((prev) => {
      if (prev) {
        setSelectedItems(new Set());
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
      !(await confirm(
        `Are you sure you want to delete ${selectedItems.size} items?`
      ))
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

  const paginatedItems = items.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );
  const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);

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
        addFiles(Array.from(files), true);
      }
    };
    input.click();
  };

  const sortOptions = [
    { label: 'Created (Newest)', value: '-created' },
    { label: 'Created (Oldest)', value: '+created' },
    { label: 'Name (A-Z)', value: '+itemLabel' },
    { label: 'Name (Z-A)', value: '-itemLabel' },
  ];

  if (isLoading && items.length === 0) {
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
          <h1 className="text-2xl sm:text-3xl font-bold">Items</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage your inventory items
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
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
            onClick={() => router.push('/inventory/containers')}
            className="w-full sm:w-auto"
          >
            View Containers
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
          </div>
        </div>

        <ImageUpload isManualMode={!useAIAnalysis} />
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
          <div className="flex-1 w-full">
            <SearchFilter
              query={searchQuery}
              onQueryChange={setSearchQuery}
              categories={categories}
              selectedFilters={searchFilters}
              onFilterChange={setSearchFilters}
            />
          </div>
          <div className="w-full md:w-auto pb-4 md:pb-0">
            <SortSelect
              value={sortValue}
              onValueChange={setSortValue}
              options={sortOptions}
              className="w-full"
            />
          </div>
        </div>

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
                  boundingBox={item.ImageRef ? item.boundingBox : undefined}
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

            <PaginationControls
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          </>
        )}
      </div>

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
    </div>
  );
}

export default function ItemsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ItemsPageContent />
    </Suspense>
  );
}

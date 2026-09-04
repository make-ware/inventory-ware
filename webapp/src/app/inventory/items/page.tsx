'use client';

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  Suspense,
} from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import pb from '@/lib/pocketbase-client';
import { ImageMutator, ItemMutator } from '@project/shared';
import type { Item } from '@project/shared';
import type { SearchFilters, BulkEditData } from '@/components/inventory';
import {
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
import { toast } from 'sonner';
import {
  Loader2,
  Plus,
  Image as ImageIcon,
  PenTool,
  CheckSquare,
  X,
  FileDown,
} from 'lucide-react';
import { useUpload } from '@/contexts/upload-context';
import { useAuth } from '@/hooks/use-auth';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useItemsInfinite } from '@/hooks/use-items';
import {
  useBulkDeleteItems,
  useBulkUpdateItems,
  useDeleteItem,
} from '@/hooks/use-item-mutations';
import { useCategoryLibrary } from '@/hooks/use-categories';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { printItemsAsPdf } from '@/services/item-pdf-export';

function ItemsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { addFiles } = useUpload();
  const { confirm } = useConfirm();
  const { userId, isLoading: isAuthLoading } = useAuth();

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

  // Search/Sort State
  const [searchQuery, setSearchQuery] = useState(initialState.query);
  const [sortValue, setSortValue] = useState(initialState.sort);
  const [searchFilters, setSearchFilters] = useState<SearchFilters>(
    initialState.filters
  );

  const [currentPage, setCurrentPage] = useState(initialState.page);

  // Bulk Edit State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isBulkEditDialogOpen, setIsBulkEditDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Dialog state
  const [createOptionDialog, setCreateOptionDialog] = useState<{
    open: boolean;
    type: 'item' | 'container';
  }>({ open: false, type: 'item' });

  const imageMutator = useMemo(() => new ImageMutator(pb), []);
  const itemMutator = useMemo(() => new ItemMutator(pb), []);

  // Writes go through mutations, which patch the cache themselves: the row
  // leaves the grid on the click and comes back if the request is refused.
  const deleteItem = useDeleteItem();
  const bulkDeleteItems = useBulkDeleteItems();
  const bulkUpdateItems = useBulkUpdateItems();

  // Only the free-text box needs debouncing; the sort and category selects
  // change one discrete step at a time.
  const debouncedQuery = useDebouncedValue(searchQuery);

  const { categories } = useCategoryLibrary(userId);

  const {
    pages,
    totalPages,
    itemsForPage,
    isRejectedQuery,
    isLoading,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useItemsInfinite({
    userId,
    q: debouncedQuery,
    filters: searchFilters,
    sort: sortValue,
  });

  const visibleItems = itemsForPage(currentPage);
  // Landing on ?page=3 means pages 2 and 3 are still being walked to; that is a
  // load, not an empty result.
  const isAwaitingPage =
    pages.length > 0 &&
    pages.length < currentPage &&
    (hasNextPage || isFetchingNextPage);

  useEffect(() => {
    if (isError) {
      toast.error('Failed to load items');
    }
  }, [isError]);

  // An infinite query only ever holds a contiguous run of pages from the first,
  // so deep-linking to ?page=3 has to walk forward to it.
  useEffect(() => {
    if (pages.length === 0) return;
    if (pages.length >= currentPage) return;
    if (!hasNextPage || isFetchingNextPage) return;
    fetchNextPage();
  }, [
    pages.length,
    currentPage,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  ]);

  // A new query/filter/sort restarts paging at page 1, so keep the visible page
  // in step instead of walking forward through pages nobody asked for.
  const queryInputs = JSON.stringify([
    debouncedQuery,
    searchFilters,
    sortValue,
  ]);
  const previousQueryInputs = useRef(queryInputs);
  useEffect(() => {
    if (previousQueryInputs.current === queryInputs) return;
    previousQueryInputs.current = queryInputs;
    setCurrentPage(1);
  }, [queryInputs]);

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

  const handleDeleteItem = async (itemId: string) => {
    if (!(await confirm('Are you sure you want to delete this item?'))) return;

    try {
      await deleteItem.mutateAsync(itemId);
      toast.success('Item deleted successfully');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete item'
      );
    }
  };

  const getItemImageUrl = (item: Item): string | undefined => {
    // `expand: 'ImageRef'` on the list query means the image record travels
    // with the item; there is no separate lookup table to keep in sync.
    const image = item.expand?.ImageRef;
    return image ? imageMutator.getFileUrl(image) : undefined;
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
    // Read the selection once: it is cleared below, and the count belongs to
    // the operation rather than to whatever is selected when the toast fires.
    const ids = Array.from(selectedItems);
    if (
      !(await confirm(`Are you sure you want to delete ${ids.length} items?`))
    )
      return;

    try {
      await bulkDeleteItems.mutateAsync(ids);
      toast.success(`Deleted ${ids.length} items`);
      setSelectedItems(new Set());
      setIsSelectionMode(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to bulk delete items'
      );
    }
  };

  const handleBulkEditConfirm = async (data: BulkEditData) => {
    const ids = Array.from(selectedItems);

    try {
      await bulkUpdateItems.mutateAsync({ ids, data });
      toast.success(`Updated ${ids.length} items`);
      setSelectedItems(new Set());
      setIsSelectionMode(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to bulk update items'
      );
    }
  };

  const handleExport = async (ids?: string[]) => {
    setIsExporting(true);
    try {
      const items: Item[] = [];
      if (ids) {
        const fetchedItems = await Promise.all(
          ids.map((id) => itemMutator.getById(id, 'ImageRef,ContainerRef'))
        );
        items.push(...fetchedItems.filter((item): item is Item => item !== null));
      } else {
        let page = 1;
        let totalPages = 1;
        do {
          const result = await itemMutator.search(debouncedQuery, {
            page,
            perPage: 100,
            filters: {
              categoryFunctional: searchFilters.functional,
              categorySpecific: searchFilters.specific,
              itemType: searchFilters.itemType,
            },
            sort: sortValue,
            expand: 'ImageRef,ContainerRef',
          });
          items.push(...result.items);
          totalPages = result.totalPages;
          page += 1;
        } while (page <= totalPages);
      }

      if (items.length === 0) {
        toast.info('There are no items to export');
        return;
      }
      printItemsAsPdf(
        items.map((item) => ({
          ...item,
          exportContainerLabel: item.expand?.ContainerRef?.containerLabel,
        }))
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to export PDF'
      );
    } finally {
      setIsExporting(false);
    }
  };

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

  if (isAuthLoading || (isLoading && pages.length === 0)) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8 relative">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Items</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage your inventory items
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <Button
            variant={isSelectionMode ? 'secondary' : 'outline'}
            onClick={toggleSelectionMode}
            className="col-span-2 sm:col-span-1"
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
          >
            <Plus className="h-4 w-4 mr-2" />
            New Item
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push('/inventory/containers')}
          >
            View Containers
          </Button>
          <Button
            variant="outline"
            onClick={() => void handleExport()}
            disabled={isExporting}
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4 mr-2" />
            )}
            Export Filtered
          </Button>
        </div>
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

        {isAwaitingPage ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {isRejectedQuery
                ? 'A search cannot end with a backslash'
                : searchQuery || Object.keys(searchFilters).length > 0
                  ? 'No items match your search criteria'
                  : 'No items yet. Upload an image or create an item manually.'}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {visibleItems.map((item) => (
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 py-4">
            <Button
              variant="outline"
              className="h-24 sm:h-32 flex flex-col items-center justify-center gap-3 sm:gap-4 hover:bg-primary/5 hover:border-primary"
              onClick={handleStartWithImage}
            >
              <ImageIcon className="h-8 w-8 sm:h-10 sm:w-10 text-primary" />
              <span className="font-semibold">Start with Image</span>
            </Button>
            <Button
              variant="outline"
              className="h-24 sm:h-32 flex flex-col items-center justify-center gap-3 sm:gap-4 hover:bg-primary/5 hover:border-primary"
              onClick={() => {
                setCreateOptionDialog((prev) => ({ ...prev, open: false }));
                router.push(`/inventory/${createOptionDialog.type}s/new`);
              }}
            >
              <PenTool className="h-8 w-8 sm:h-10 sm:w-10 text-primary" />
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
            <Button
              variant="outline"
              onClick={() => void handleExport(Array.from(selectedItems))}
              disabled={isExporting}
              className="flex-1 sm:flex-none"
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileDown className="h-4 w-4 mr-2" />
              )}
              PDF
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
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ItemsPageContent />
    </Suspense>
  );
}

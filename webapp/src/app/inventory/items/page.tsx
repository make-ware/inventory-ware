'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import pb from '@/lib/pocketbase-client';
import { ItemMutator, ContainerMutator } from '@project/shared';
import type { Item, Container } from '@project/shared';
import { getExpandedImageUrl } from '@/lib/image-utils';
import type {
  CategoryLibrary,
  SearchFilters,
  BulkEditData,
} from '@/components/inventory';
import { SearchFilter, ItemCard, BulkEditDialog } from '@/components/inventory';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Plus, CheckSquare, X } from 'lucide-react';

const ITEMS_PER_PAGE = 12;

function ItemsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize currentPage from query string
  const initialPage = Math.max(
    1,
    parseInt(searchParams.get('page') || '1', 10)
  );

  const [items, setItems] = useState<Item[]>([]);
  const [containers, setContainers] = useState<Container[]>([]);
  const [categories, setCategories] = useState<CategoryLibrary>({
    functional: [],
    specific: [],
    itemType: [],
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({});
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(initialPage);

  // Bulk Edit State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [isBulkEditDialogOpen, setIsBulkEditDialogOpen] = useState(false);

  const itemMutator = useMemo(() => new ItemMutator(pb), []);
  const containerMutator = useMemo(() => new ContainerMutator(pb), []);

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
    } catch (error) {
      console.error('Failed to load items:', error);
      toast.error('Failed to load items');
    }
  }, [searchQuery, searchFilters, itemMutator]);

  const loadContainers = useCallback(async () => {
    try {
      // Fetch containers with expanded primaryImage (needed for item image fallback)
      const results = await containerMutator.search('', 'primaryImage');
      setContainers(results);
    } catch (error) {
      console.error('Failed to load containers:', error);
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
      console.error('Failed to load items data:', error);
      toast.error('Failed to load items data');
    } finally {
      setIsLoading(false);
    }
  }, [loadItems, loadContainers, loadCategories]);

  // Load initial data
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Reload data when search/filters change
  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Update URL when page changes
  const handlePageChange = useCallback(
    (newPage: number) => {
      setCurrentPage(newPage);
      const params = new URLSearchParams(searchParams.toString());
      if (newPage === 1) {
        params.delete('page');
      } else {
        params.set('page', newPage.toString());
      }
      const query = params.toString();
      router.replace(query ? `?${query}` : '/inventory/items', {
        scroll: false,
      });
    },
    [router, searchParams]
  );

  // Reset page to 1 when search query or filters change
  useEffect(() => {
    if (currentPage !== 1) {
      handlePageChange(1);
    }
    // Only reset when search/filters change, not when currentPage or handlePageChange changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, searchFilters]);

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

  const getItemImageUrl = (item: Item): string | undefined => {
    // Try item's expanded primary image
    const itemUrl = getExpandedImageUrl(item);
    if (itemUrl) return itemUrl;

    // Fallback to container's expanded image
    if (item.container) {
      const container = containers.find((c) => c.id === item.container);
      if (container) return getExpandedImageUrl(container);
    }
    return undefined;
  };

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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-4 sm:py-8 space-y-6 sm:space-y-8 relative">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Items</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage your inventory items ({items.length} total)
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
            onClick={() => router.push('/inventory/items/new')}
            className="w-full sm:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Item
          </Button>
        </div>
      </div>

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
        </>
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

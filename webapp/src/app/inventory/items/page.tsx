'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import pb from '@/lib/pocketbase-client';
import { ItemMutator, ContainerMutator, ImageMutator } from '@project/shared';
import type { Item, Container, Image } from '@project/shared';
import type { CategoryLibrary, SearchFilters } from '@/components/inventory';
import { SearchFilter, ItemCard } from '@/components/inventory';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';

const ITEMS_PER_PAGE = 12;

export default function ItemsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [containers, setContainers] = useState<Container[]>([]);
  const [images, setImages] = useState<Map<string, Image>>(new Map());
  const [categories, setCategories] = useState<CategoryLibrary>({
    functional: [],
    specific: [],
    item_type: [],
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilters, setSearchFilters] = useState<SearchFilters>({});
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  const itemMutator = new ItemMutator(pb);
  const containerMutator = new ContainerMutator(pb);
  const imageMutator = new ImageMutator(pb);

  const loadImages = useCallback(async (imageIds: string[]) => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [images]);

  const loadItems = useCallback(async () => {
    try {
      const results = await itemMutator.search(searchQuery, {
        category_functional: searchFilters.functional,
        category_specific: searchFilters.specific,
        item_type: searchFilters.item_type,
      });
      setItems(results);
      setCurrentPage(1); // Reset to first page on new search

      // Load images for items
      const imageIds = results
        .map((item) => item.primary_image)
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

      // Load images for containers (needed for item image fallback)
      const containerImageIds = results
        .map((container) => container.primary_image)
        .filter((id): id is string => Boolean(id));
      await loadImages(containerImageIds);
    } catch (error) {
      console.error('Failed to load containers:', error);
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

  const getImageUrl = (imageId?: string): string | undefined => {
    if (!imageId) return undefined;
    const image = images.get(imageId);
    if (!image) return undefined;
    return pb.files.getUrl(image, image.file);
  };

  const getItemImageUrl = (item: Item): string | undefined => {
    // First try the item's primary image
    if (item.primary_image) {
      const url = getImageUrl(item.primary_image);
      if (url) return url;
    }

    // Fallback to container's primary image if item doesn't have one
    if (item.container) {
      const container = containers.find((c) => c.id === item.container);
      if (container?.primary_image) {
        return getImageUrl(container.primary_image);
      }
    }

    return undefined;
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
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Items</h1>
          <p className="text-muted-foreground">
            Manage your inventory items ({items.length} total)
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => router.push('/inventory/items/new')}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Item
        </Button>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {paginatedItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                imageUrl={getItemImageUrl(item)}
                onClick={() => router.push(`/inventory/items/${item.id}`)}
                onEdit={() => router.push(`/inventory/items/${item.id}/edit`)}
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
    </div>
  );
}

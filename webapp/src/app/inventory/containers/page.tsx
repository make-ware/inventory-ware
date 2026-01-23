'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import pb from '@/lib/pocketbase-client';
import { ItemMutator, ContainerMutator } from '@project/shared';
import type { Item, Container } from '@project/shared';
import { getExpandedImageUrl } from '@/lib/image-utils';
import { ContainerCard } from '@/components/inventory';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';

const CONTAINERS_PER_PAGE = 12;

export default function ContainersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize currentPage from query string
  const initialPage = Math.max(
    1,
    parseInt(searchParams.get('page') || '1', 10)
  );
  const [currentPage, setCurrentPage] = useState(initialPage);

  const [items, setItems] = useState<Item[]>([]);
  const [containers, setContainers] = useState<Container[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const itemMutator = useMemo(() => new ItemMutator(pb), []);
  const containerMutator = useMemo(() => new ContainerMutator(pb), []);

  const loadItems = useCallback(async () => {
    try {
      const results = await itemMutator.search('');
      setItems(results);
    } catch (error) {
      console.error('Failed to load items:', error);
    }
  }, [itemMutator]);

  const loadContainers = useCallback(async () => {
    try {
      // Fetch containers with expanded primaryImage to avoid N+1 queries
      const results = await containerMutator.search('', 'primaryImage');
      setContainers(results);
    } catch (error) {
      console.error('Failed to load containers:', error);
      toast.error('Failed to load containers');
    }
  }, [containerMutator]);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      await Promise.all([loadContainers(), loadItems()]);
    } catch (error) {
      console.error('Failed to load containers data:', error);
      toast.error('Failed to load containers data');
    } finally {
      setIsLoading(false);
    }
  }, [loadContainers, loadItems]);

  // Load initial data
  useEffect(() => {
    loadData();
  }, [loadData]);

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
    } catch (error) {
      console.error('Failed to delete container:', error);
      toast.error('Failed to delete container');
    }
  };

  const getContainerItemCount = (containerId: string): number => {
    return items.filter((item) => item.container === containerId).length;
  };

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
      router.replace(query ? `?${query}` : '/inventory/containers', {
        scroll: false,
      });
    },
    [router, searchParams]
  );

  // Pagination
  const paginatedContainers = containers.slice(
    (currentPage - 1) * CONTAINERS_PER_PAGE,
    currentPage * CONTAINERS_PER_PAGE
  );
  const totalPages = Math.ceil(containers.length / CONTAINERS_PER_PAGE);

  // Ensure current page is valid when containers change
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
    <div className="container mx-auto py-4 sm:py-8 space-y-6 sm:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Containers</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage your containers ({containers.length} total)
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => router.push('/inventory/containers/new')}
          className="w-full sm:w-auto"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Container
        </Button>
      </div>

      {containers.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            No containers yet. Upload an image or create a container manually.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {paginatedContainers.map((container) => (
              <ContainerCard
                key={container.id}
                container={container}
                imageUrl={getExpandedImageUrl(container)}
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
    </div>
  );
}

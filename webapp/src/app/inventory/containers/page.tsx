'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import pb from '@/lib/pocketbase-client';
import { ContainerMutator, ImageMutator } from '@project/shared';
import type { Container, Image } from '@project/shared';
import {
  ContainerCard,
  PaginationControls,
  SearchInput,
  SortSelect,
} from '@/components/inventory';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Plus, ArrowLeft, CheckSquare, X } from 'lucide-react';
import { useConfirm } from '@/components/ui/confirm-dialog';

const CONTAINERS_PER_PAGE = 12;

function ContainersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();

  // Initialize state from query string
  const [initialState] = useState(() => ({
    page: Math.max(1, parseInt(searchParams.get('page') || '1', 10)),
    sort: searchParams.get('sort') || '-created',
    query: searchParams.get('q') || '',
  }));

  const [containers, setContainers] = useState<Container[]>([]);
  const [images, setImages] = useState<Map<string, Image>>(new Map());

  // Search/Sort State
  const [searchQuery, setSearchQuery] = useState(initialState.query);
  const [sortValue, setSortValue] = useState(initialState.sort);

  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(initialState.page);

  // Bulk Selection State
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedContainers, setSelectedContainers] = useState<Set<string>>(
    new Set()
  );

  const containerMutator = useMemo(() => new ContainerMutator(pb), []);
  const imageMutator = useMemo(() => new ImageMutator(pb), []);
  const { confirm } = useConfirm();

  const loadContainers = useCallback(async () => {
    try {
      // Pass sortValue to search
      const results = await containerMutator.search(
        searchQuery,
        'ImageRef',
        sortValue
      );
      setContainers(results);

      setImages((prev) => {
        const newImages = new Map(prev);
        for (const container of results) {
          if (container.expand?.ImageRef) {
            newImages.set(
              container.expand.ImageRef.id,
              container.expand.ImageRef
            );
          }
        }
        return newImages;
      });
    } catch (error) {
      console.error('Failed to load containers:', error);
      toast.error('Failed to load containers');
    }
  }, [containerMutator, searchQuery, sortValue]);

  const loadData = useCallback(async () => {
    try {
      setIsLoading(true);
      await loadContainers();
    } catch (error) {
      console.error('Failed to load containers:', error);
      toast.error('Failed to load containers');
    } finally {
      setIsLoading(false);
    }
  }, [loadContainers]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Sync state FROM URL
  useEffect(() => {
    const q = searchParams.get('q') || '';
    if (q !== searchQuery) setSearchQuery(q);

    const sort = searchParams.get('sort') || '-created';
    if (sort !== sortValue) setSortValue(sort);

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

      const query = params.toString();
      const url = query ? `?${query}` : pathname;

      const currentParams = new URLSearchParams(searchParams.toString());
      if (query !== currentParams.toString()) {
        router.push(url, { scroll: false });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery, sortValue, currentPage, router, pathname, searchParams]);

  // Reload containers when search/sort change
  useEffect(() => {
    loadContainers();
  }, [searchQuery, sortValue, loadContainers]);

  const handleDeleteContainer = async (containerId: string) => {
    if (!(await confirm('Are you sure you want to delete this container?')))
      return;

    try {
      await containerMutator.delete(containerId);
      toast.success('Container deleted successfully');
      await loadContainers();
    } catch (error) {
      console.error('Failed to delete container:', error);
      toast.error('Failed to delete container');
    }
  };

  // Bulk Edit Handlers
  const toggleSelectionMode = () => {
    setIsSelectionMode((prev) => {
      if (prev) {
        setSelectedContainers(new Set());
      }
      return !prev;
    });
  };

  const toggleContainerSelection = (id: string) => {
    setSelectedContainers((prev) => {
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
        `Are you sure you want to delete ${selectedContainers.size} containers?`
      ))
    )
      return;

    try {
      await Promise.all(
        Array.from(selectedContainers).map((id) => containerMutator.delete(id))
      );
      toast.success(`Deleted ${selectedContainers.size} containers`);
      setSelectedContainers(new Set());
      setIsSelectionMode(false);
      await loadContainers();
    } catch (error) {
      console.error('Failed to bulk delete:', error);
      toast.error('Failed to bulk delete containers');
    }
  };

  const getImageUrl = (imageId?: string): string | undefined => {
    if (!imageId) return undefined;
    const image = images.get(imageId);
    if (!image) return undefined;
    return imageMutator.getFileUrl(image);
  };

  const handlePageChange = useCallback((newPage: number) => {
    setCurrentPage(newPage);
  }, []);

  const paginatedContainers = containers.slice(
    (currentPage - 1) * CONTAINERS_PER_PAGE,
    currentPage * CONTAINERS_PER_PAGE
  );
  const totalPages = Math.ceil(containers.length / CONTAINERS_PER_PAGE);

  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      handlePageChange(totalPages);
    }
  }, [totalPages, currentPage, handlePageChange]);

  const sortOptions = [
    { label: 'Created (Newest)', value: '-created' },
    { label: 'Created (Oldest)', value: '+created' },
    { label: 'Name (A-Z)', value: '+containerLabel' },
    { label: 'Name (Z-A)', value: '-containerLabel' },
  ];

  if (isLoading && containers.length === 0) {
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
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/inventory/items')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl sm:text-3xl font-bold">Containers</h1>
          </div>
          <p className="text-sm sm:text-base text-muted-foreground ml-10">
            Manage your storage containers
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
            {isSelectionMode ? 'Cancel Selection' : 'Select Containers'}
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push('/inventory/containers/new')}
            className="w-full sm:w-auto"
          >
            <Plus className="h-4 w-4 mr-2" />
            New Container
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
          <div className="flex-1 w-full">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search containers..."
              label="Search"
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

        {paginatedContainers.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {searchQuery
                ? 'No containers match your search criteria'
                : 'No containers yet. Create a container to organize items.'}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {paginatedContainers.map((container) => (
                <ContainerCard
                  key={container.id}
                  container={container}
                  imageUrl={getImageUrl(container.ImageRef)}
                  boundingBox={container.boundingBox}
                  itemCount={0}
                  onClick={() =>
                    router.push(`/inventory/containers/${container.id}`)
                  }
                  onEdit={() =>
                    router.push(`/inventory/containers/${container.id}/edit`)
                  }
                  onDelete={() => handleDeleteContainer(container.id)}
                  isSelectionMode={isSelectionMode}
                  isSelected={selectedContainers.has(container.id)}
                  onToggleSelect={() => toggleContainerSelection(container.id)}
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

      {selectedContainers.size > 0 && (
        <div className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 bg-background border rounded-lg shadow-lg p-3 sm:p-4 flex flex-col sm:flex-row items-center gap-2 sm:gap-4 z-50 max-w-[calc(100%-2rem)] sm:max-w-none">
          <span className="font-medium text-sm sm:text-base">
            {selectedContainers.size} selected
          </span>
          <div className="flex gap-2 w-full sm:w-auto">
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
    </div>
  );
}

export default function ContainersPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ContainersPageContent />
    </Suspense>
  );
}

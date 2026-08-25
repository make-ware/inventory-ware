'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import pb from '@/lib/pocketbase-client';
import { ImageMutator } from '@project/shared';
import type { Image } from '@project/shared';
import { ImageCard, PaginationControls } from '@/components/inventory';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, Search } from 'lucide-react';

const IMAGES_PER_PAGE = 24;

function ImagesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize state from query string
  const [initialState] = useState(() => ({
    page: Math.max(1, parseInt(searchParams.get('page') || '1', 10)),
    query: searchParams.get('q') || '',
    type: searchParams.get('type') || 'all',
    status: searchParams.get('status') || 'all',
  }));

  const [images, setImages] = useState<Image[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [currentPage, setCurrentPage] = useState(initialState.page);
  const [searchQuery, setSearchQuery] = useState(initialState.query);
  const [imageTypeFilter, setImageTypeFilter] = useState<string>(
    initialState.type
  );
  const [statusFilter, setStatusFilter] = useState<string>(initialState.status);

  const [processingImages, setProcessingImages] = useState<Set<string>>(
    new Set()
  );
  const { confirm } = useConfirm();

  const imageMutator = new ImageMutator(pb);

  const loadImages = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await imageMutator.getList(1, 1000, undefined, '-created');
      setImages(result.items);
    } catch (error) {
      console.error('Failed to load images:', error);
      toast.error('Failed to load images');
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredImages = useMemo(() => {
    let filtered = images;

    if (imageTypeFilter !== 'all') {
      filtered = filtered.filter((img) => img.imageType === imageTypeFilter);
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((img) => img.analysisStatus === statusFilter);
    }

    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (img) =>
          img.file.toLowerCase().includes(lowerQuery) ||
          img.id.toLowerCase().includes(lowerQuery)
      );
    }

    return filtered;
  }, [images, imageTypeFilter, statusFilter, searchQuery]);

  // Sync state FROM URL
  useEffect(() => {
    const q = searchParams.get('q') || '';
    if (q !== searchQuery) setSearchQuery(q);

    const type = searchParams.get('type') || 'all';
    if (type !== imageTypeFilter) setImageTypeFilter(type);

    const status = searchParams.get('status') || 'all';
    if (status !== statusFilter) setStatusFilter(status);

    const page = parseInt(searchParams.get('page') || '1', 10);
    if (page !== currentPage) setCurrentPage(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Sync state TO URL. `history.replaceState` rather than `router.push`:
  // Next keeps `useSearchParams` in sync with it, but skips the router
  // navigation (and history spam) a push would cost on every filter change.
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (currentPage > 1) params.set('page', currentPage.toString());
      if (searchQuery) params.set('q', searchQuery);
      if (imageTypeFilter !== 'all') params.set('type', imageTypeFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const query = params.toString();
      const currentParams = new URLSearchParams(searchParams.toString());
      if (query !== currentParams.toString()) {
        window.history.replaceState(
          null,
          '',
          query ? `?${query}` : '/inventory/images'
        );
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, imageTypeFilter, statusFilter, currentPage, searchParams]);

  // Load initial data
  useEffect(() => {
    loadImages();
  }, [loadImages]);

  // Poll for status updates on processing images
  useEffect(() => {
    const processing = images.filter(
      (img) => img.analysisStatus === 'processing'
    );
    if (processing.length === 0) return;

    const intervalId = setInterval(() => {
      loadImages();
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(intervalId);
  }, [images, loadImages]);

  const handleDeleteImage = async (imageId: string) => {
    if (!(await confirm('Are you sure you want to delete this image?'))) return;

    try {
      await imageMutator.delete(imageId);
      toast.success('Image deleted successfully');
      await loadImages();
    } catch (error) {
      console.error('Failed to delete image:', error);
      toast.error('Failed to delete image');
    }
  };

  const handleProcessImage = async (imageId: string) => {
    try {
      setProcessingImages((prev) => new Set(prev).add(imageId));
      toast.info('Processing image... This may take a moment.');

      const authToken = pb.authStore.token;
      const response = await fetch(`/api-next/process-image/${imageId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to process image');
      }

      toast.success('Image processed successfully!');
      await loadImages();
    } catch (error) {
      console.error('Failed to process image:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to process image. Please try again.'
      );
    } finally {
      setProcessingImages((prev) => {
        const next = new Set(prev);
        next.delete(imageId);
        return next;
      });
    }
  };

  const getImageUrl = (image: Image): string => {
    return imageMutator.getFileUrl(image);
  };

  const handlePageChange = useCallback((newPage: number) => {
    setCurrentPage(newPage);
  }, []);

  // Pagination
  const paginatedImages = filteredImages.slice(
    (currentPage - 1) * IMAGES_PER_PAGE,
    currentPage * IMAGES_PER_PAGE
  );
  const totalPages = Math.ceil(filteredImages.length / IMAGES_PER_PAGE);

  // Ensure current page is valid when filtered images change
  useEffect(() => {
    if (totalPages > 0 && currentPage > totalPages) {
      handlePageChange(totalPages);
    }
  }, [totalPages, currentPage, handlePageChange]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Images</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage your images ({filteredImages.length} of {images.length}{' '}
            total)
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search images by filename or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {/* Fixed-width triggers overflow narrow screens, so share the row instead. */}
        <div className="grid grid-cols-2 gap-2 sm:gap-4 md:flex">
          <Select value={imageTypeFilter} onValueChange={setImageTypeFilter}>
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="item">Item</SelectItem>
              <SelectItem value="container">Container</SelectItem>
              <SelectItem value="unprocessed">Unprocessed</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {paginatedImages.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            {images.length === 0
              ? 'No images yet. Upload images from the inventory page.'
              : 'No images match your filters.'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {paginatedImages.map((image) => (
              <ImageCard
                key={image.id}
                image={image}
                imageUrl={getImageUrl(image)}
                onClick={() => router.push(`/inventory/images/${image.id}`)}
                onDelete={() => handleDeleteImage(image.id)}
                onProcess={() => handleProcessImage(image.id)}
                isProcessing={processingImages.has(image.id)}
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
  );
}

export default function ImagesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ImagesPageContent />
    </Suspense>
  );
}

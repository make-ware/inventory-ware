'use client';

import { useState, useEffect, useCallback, Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import pb from '@/lib/pocketbase-client';
import { ImageMutator } from '@project/shared';
import type { Image } from '@project/shared';
import { ImageCard } from '@/components/inventory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

  // Parse URL parameters
  const pageParam = searchParams.get('page');
  const searchParam = searchParams.get('q') || '';
  const typeParam = searchParams.get('type') || 'all';
  const statusParam = searchParams.get('status') || 'all';

  const currentPage = Math.max(1, parseInt(pageParam || '1', 10));

  // Local state for search input (debounced sync to URL)
  const [queryInput, setQueryInput] = useState(searchParam);

  // Sync queryInput with URL if URL changes externally
  useEffect(() => {
    setQueryInput(searchParam);
  }, [searchParam]);

  const [images, setImages] = useState<Image[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [processingImages, setProcessingImages] = useState<Set<string>>(
    new Set()
  );

  const imageMutator = useMemo(() => new ImageMutator(pb), []);

  const loadImages = useCallback(async () => {
    try {
      setIsLoading(true);

      const filters: string[] = [];
      if (typeParam !== 'all') {
        filters.push(`imageType="${typeParam}"`);
      }
      if (statusParam !== 'all') {
        filters.push(`analysisStatus="${statusParam}"`);
      }
      if (searchParam) {
        // Search by file name
        filters.push(`file~"${searchParam}"`);
      }

      const filterString = filters.length > 0 ? filters.join(' && ') : undefined;

      const result = await imageMutator.getList(
        currentPage,
        IMAGES_PER_PAGE,
        filterString,
        '-created'
      );

      setImages(result.items);
      setTotalPages(result.totalPages);
      setTotalItems(result.totalItems);
    } catch (error) {
      console.error('Failed to load images:', error);
      toast.error('Failed to load images');
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, searchParam, typeParam, statusParam, imageMutator]);

  // Load initial data and when params change
  useEffect(() => {
    loadImages();
  }, [loadImages]);

  // Update URL helper
  const updateUrl = useCallback(
    (updates: {
      page?: number;
      q?: string;
      type?: string;
      status?: string;
    }) => {
      const params = new URLSearchParams(searchParams.toString());

      if (updates.page !== undefined) {
        if (updates.page > 1) params.set('page', updates.page.toString());
        else params.delete('page');
      }

      if (updates.q !== undefined) {
        if (updates.q) params.set('q', updates.q);
        else params.delete('q');
      }

      if (updates.type !== undefined) {
        if (updates.type !== 'all') params.set('type', updates.type);
        else params.delete('type');
      }

      if (updates.status !== undefined) {
        if (updates.status !== 'all') params.set('status', updates.status);
        else params.delete('status');
      }

      router.push(`/inventory/images?${params.toString()}`);
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
    if (!confirm('Are you sure you want to delete this image?')) return;

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

  const handlePageChange = (newPage: number) => {
    updateUrl({ page: newPage });
  };

  const handleTypeChange = (value: string) => {
    updateUrl({ type: value, page: 1 });
  };

  const handleStatusChange = (value: string) => {
    updateUrl({ status: value, page: 1 });
  };

  if (isLoading && images.length === 0) {
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
          <h1 className="text-3xl font-bold">Images</h1>
          <p className="text-muted-foreground">
            Manage your images ({totalItems} total)
          </p>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by filename..."
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={typeParam} onValueChange={handleTypeChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="item">Item</SelectItem>
            <SelectItem value="container">Container</SelectItem>
            <SelectItem value="unprocessed">Unprocessed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusParam} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-[180px]">
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

      {images.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            {totalItems === 0
              ? 'No images yet. Upload images from the inventory page.'
              : 'No images match your filters.'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {images.map((image) => (
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

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
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
                  handlePageChange(Math.min(totalPages, currentPage + 1))
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

export default function ImagesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <ImagesPageContent />
    </Suspense>
  );
}

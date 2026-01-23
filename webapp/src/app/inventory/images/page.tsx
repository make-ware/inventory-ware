'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import pb from '@/lib/pocketbase-client';
import { ImageMutator } from '@project/shared';
import type { Image } from '@project/shared';
import { ImageCard } from '@/components/inventory';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

const IMAGES_PER_PAGE = 24;

export default function ImagesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Initialize currentPage from query string
  const initialPage = Math.max(
    1,
    parseInt(searchParams.get('page') || '1', 10)
  );

  const [images, setImages] = useState<Image[]>([]);
  const [filteredImages, setFilteredImages] = useState<Image[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [imageTypeFilter, setImageTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [processingImages, setProcessingImages] = useState<Set<string>>(
    new Set()
  );

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

  const filterImages = useCallback(() => {
    let filtered = [...images];

    if (imageTypeFilter !== 'all') {
      filtered = filtered.filter((img) => img.imageType === imageTypeFilter);
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter((img) => img.analysisStatus === statusFilter);
    }

    setFilteredImages(filtered);
  }, [images, imageTypeFilter, statusFilter]);

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
      router.replace(query ? `?${query}` : '/inventory/images', {
        scroll: false,
      });
    },
    [router, searchParams]
  );

  // Load initial data
  useEffect(() => {
    loadImages();
  }, [loadImages]);

  // Filter images when filters change
  useEffect(() => {
    filterImages();
  }, [filterImages]);

  // Reset page to 1 when filters change
  useEffect(() => {
    if (currentPage !== 1) {
      handlePageChange(1);
    }
    // Only reset when filters change, not when currentPage or handlePageChange changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageTypeFilter, statusFilter]);

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

      // Use API route for server-side processing where env vars are available
      // Pass the auth token from PocketBase
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
            Manage your images ({filteredImages.length} of {images.length}{' '}
            total)
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select value={imageTypeFilter} onValueChange={setImageTypeFilter}>
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

        <Select value={statusFilter} onValueChange={setStatusFilter}>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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

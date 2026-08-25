'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ImageWithLoader } from '@/components/image/image-with-loader';
import pb from '@/lib/pocketbase-client';
import { ImageMutator } from '@project/shared';
import { getImageFileUrl } from '@/lib/image-utils';
import { qk } from '@/lib/query';
import { useImage } from '@/hooks/use-images';
import { useItemsByImage } from '@/hooks/use-items';
import { useContainersByImage } from '@/hooks/use-containers';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import {
  Loader2,
  ArrowLeft,
  Trash2,
  Package,
  Box,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
} from 'lucide-react';

export default function ImageDetailPage() {
  const router = useRouter();
  const params = useParams();
  const imageId = params.id as string;
  const queryClient = useQueryClient();

  const [isProcessing, setIsProcessing] = useState(false);
  // Set the moment the delete lands, so the "image is gone" the invalidation
  // below turns up reads as the delete rather than as a failed load.
  const [isDeleted, setIsDeleted] = useState(false);
  const { confirm } = useConfirm();

  const imageMutator = useMemo(() => new ImageMutator(pb), []);

  // The record, and what analysis made of it, all read from the query cache:
  // arriving from the grid repaints from the row that was just on screen, and
  // `useImage` keeps polling on its own while the status says `processing`.
  const { image, isPending, isError, isMissing } = useImage(imageId);
  const { items } = useItemsByImage(imageId);
  const { containers } = useContainersByImage(imageId);

  // Analysis creates at most one of each per image, and the page only offers a
  // link to it.
  const item = items[0] ?? null;
  const container = containers[0] ?? null;

  // A missing image and a failed request are the same dead end here: there is
  // no page to render, so say so once and go back to the grid.
  const isImageUnavailable = !isDeleted && (isError || isMissing);
  useEffect(() => {
    if (!isImageUnavailable) return;
    toast.error('Failed to load image details');
    router.push('/inventory/images');
  }, [isImageUnavailable, router]);

  const handleDelete = async () => {
    if (!(await confirm('Are you sure you want to delete this image?'))) return;

    try {
      await imageMutator.delete(imageId);
      setIsDeleted(true);
      toast.success('Image deleted successfully');
      router.push('/inventory/images');
      // The detail key lives under the images prefix, so this drops it with the
      // grid — which is what we want, since the record is gone.
      await queryClient.invalidateQueries({ queryKey: qk.imagesPrefix() });
    } catch (error) {
      console.error('Failed to delete image:', error);
      toast.error('Failed to delete image');
    }
  };

  /** Everything a (re-)analysis can have rewritten. */
  const invalidateAnalysis = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.imagesPrefix() }),
        queryClient.invalidateQueries({ queryKey: qk.itemsPrefix() }),
        queryClient.invalidateQueries({ queryKey: qk.containersPrefix() }),
        queryClient.invalidateQueries({ queryKey: qk.categoriesPrefix() }),
      ]),
    [queryClient]
  );

  const handleProcessImage = async () => {
    if (!image) return;

    try {
      setIsProcessing(true);
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
      await invalidateAnalysis();
    } catch (error) {
      console.error('Failed to process image:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to process image. Please try again.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'default';
      case 'processing':
        return 'secondary';
      case 'pending':
        return 'outline';
      case 'failed':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'pending':
        return <Clock className="h-4 w-4" />;
      case 'failed':
        return <XCircle className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'item':
        return 'Item';
      case 'container':
        return 'Container';
      case 'unprocessed':
        return 'Unprocessed';
      default:
        return type;
    }
  };

  if (isPending) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!image) {
    return null;
  }

  const status = image.analysisStatus || 'pending';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="ghost"
          onClick={() => router.push('/inventory/images')}
          className="gap-2 self-start"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Images
        </Button>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <Button
            onClick={handleProcessImage}
            disabled={isProcessing}
            variant="default"
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Process Image
              </>
            )}
          </Button>

          <Button variant="destructive" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      {/* Status Alert */}
      <Alert
        variant={
          status === 'completed'
            ? 'default'
            : status === 'processing'
              ? 'default'
              : status === 'failed'
                ? 'destructive'
                : 'default'
        }
      >
        <div className="flex items-center gap-2">
          {getStatusIcon(status)}
          <AlertTitle className="flex items-center gap-2">
            Analysis Status: {status.charAt(0).toUpperCase() + status.slice(1)}
          </AlertTitle>
        </div>
        <AlertDescription>
          {status === 'pending' &&
            "This image is waiting to be processed. Click 'Process Image' to start analysis."}
          {status === 'processing' &&
            'This image is currently being analyzed. This page will update automatically.'}
          {status === 'completed' &&
            'This image has been successfully processed and items/containers have been created.'}
          {status === 'failed' &&
            "Processing failed. Click 'Process Image' to retry."}
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - Image */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">Image</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative aspect-square rounded-lg overflow-hidden border bg-muted">
                <ImageWithLoader
                  src={getImageFileUrl(image)}
                  alt="Image"
                  fill
                  sizes="(max-width: 1024px) 100vw, 66vw"
                  className="object-contain"
                  unoptimized
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-2">Type</h3>
                <Badge variant="outline">
                  {getTypeLabel(image.imageType || 'unprocessed')}
                </Badge>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-medium mb-2">Analysis Status</h3>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={getStatusColor(image.analysisStatus || 'pending')}
                    className="flex items-center gap-1"
                  >
                    {getStatusIcon(image.analysisStatus || 'pending')}
                    {image.analysisStatus || 'pending'}
                  </Badge>
                  {image.analysisStatus === 'processing' && (
                    <span className="text-xs text-muted-foreground">
                      Processing...
                    </span>
                  )}
                </div>
              </div>

              {item && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-medium mb-2">
                      Associated Item
                    </h3>
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() => router.push(`/inventory/items/${item.id}`)}
                    >
                      <Box className="h-4 w-4" />
                      {item.itemLabel}
                    </Button>
                  </div>
                </>
              )}

              {container && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-medium mb-2">
                      Associated Container
                    </h3>
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() =>
                        router.push(`/inventory/containers/${container.id}`)
                      }
                    >
                      <Package className="h-4 w-4" />
                      {container.containerLabel}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar - Metadata */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{new Date(image.created).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Updated</span>
                <span>{new Date(image.updated).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Image ID</span>
                <span className="font-mono text-xs">{image.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">File</span>
                <span className="font-mono text-xs truncate max-w-[150px]">
                  {image.file}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

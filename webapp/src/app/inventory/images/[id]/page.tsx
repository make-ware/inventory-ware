'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import NextImage from 'next/image';
import pb from '@/lib/pocketbase-client';
import { ImageMutator, ItemMutator, ContainerMutator } from '@project/shared';
import type { Image, Item, Container } from '@project/shared';
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

  const [image, setImage] = useState<Image | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [container, setContainer] = useState<Container | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const imageMutator = new ImageMutator(pb);
  const itemMutator = new ItemMutator(pb);
  const containerMutator = new ContainerMutator(pb);

  const loadImageDetails = useCallback(async () => {
    try {
      setIsLoading(true);

      // Load image
      const imageData = await imageMutator.getById(imageId);
      if (!imageData) {
        throw new Error('Image not found');
      }
      setImage(imageData);

      // Find associated item by querying items with this image as primary_image
      try {
        const items = await itemMutator.getList(
          1,
          100,
          `primary_image="${imageId}"`
        );
        if (items.items.length > 0) {
          setItem(items.items[0]);
        }
      } catch (error) {
        console.error('Failed to load item:', error);
      }

      // Find associated container by querying containers with this image as primary_image
      try {
        const containers = await containerMutator.getList(
          1,
          100,
          `primary_image="${imageId}"`
        );
        if (containers.items.length > 0) {
          setContainer(containers.items[0]);
        }
      } catch (error) {
        console.error('Failed to load container:', error);
      }
    } catch (error) {
      console.error('Failed to load image details:', error);
      toast.error('Failed to load image details');
      router.push('/inventory/images');
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageId, router]);

  useEffect(() => {
    loadImageDetails();
  }, [loadImageDetails]);

  // Poll for status updates if image is processing
  useEffect(() => {
    if (image?.analysis_status !== 'processing') return;

    const intervalId = setInterval(() => {
      loadImageDetails();
    }, 3000); // Poll every 3 seconds

    return () => {
      clearInterval(intervalId);
    };
  }, [image?.analysis_status, loadImageDetails]);

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this image?')) return;

    try {
      await imageMutator.delete(imageId);
      toast.success('Image deleted successfully');
      router.push('/inventory/images');
    } catch (error) {
      console.error('Failed to delete image:', error);
      toast.error('Failed to delete image');
    }
  };

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
      await loadImageDetails();
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

  const getImageUrl = (image: Image): string => {
    return pb.files.getURL(image, image.file);
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

  const canRequeue = (status: string) => {
    return (
      status === 'pending' || status === 'failed' || status === 'unprocessed'
    );
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!image) {
    return null;
  }

  const status = image.analysis_status || 'pending';

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => router.push('/inventory/images')}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Images
        </Button>
        <div className="flex gap-2">
          {canRequeue(status) && (
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
          )}
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
              <div className="relative aspect-square rounded-lg overflow-hidden border">
                <NextImage
                  src={getImageUrl(image)}
                  alt="Image"
                  fill
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
                  {getTypeLabel(image.image_type || 'unprocessed')}
                </Badge>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-medium mb-2">Analysis Status</h3>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={getStatusColor(image.analysis_status || 'pending')}
                    className="flex items-center gap-1"
                  >
                    {getStatusIcon(image.analysis_status || 'pending')}
                    {image.analysis_status || 'pending'}
                  </Badge>
                  {image.analysis_status === 'processing' && (
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
                      {item.item_label}
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
                      {container.container_label}
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

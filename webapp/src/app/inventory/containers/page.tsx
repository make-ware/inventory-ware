'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import pb from '@/lib/pocketbase-client';
import { ItemMutator, ContainerMutator, ImageMutator } from '@project/shared';
import type { Item, Container, Image } from '@project/shared';
import { ContainerCard } from '@/components/inventory';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Loader2, Plus } from 'lucide-react';

export default function ContainersPage() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [containers, setContainers] = useState<Container[]>([]);
  const [images, setImages] = useState<Map<string, Image>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

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
      const results = await itemMutator.search('');
      setItems(results);
    } catch (error) {
      console.error('Failed to load items:', error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadContainers = useCallback(async () => {
    try {
      const results = await containerMutator.search('');
      setContainers(results);

      // Load images for containers
      const imageIds = results
        .map((container) => container.primary_image)
        .filter((id): id is string => Boolean(id));
      await loadImages(imageIds);
    } catch (error) {
      console.error('Failed to load containers:', error);
      toast.error('Failed to load containers');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadImages]);

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

  const getImageUrl = (imageId?: string): string | undefined => {
    if (!imageId) return undefined;
    const image = images.get(imageId);
    if (!image) return undefined;
    return pb.files.getUrl(image, image.file);
  };

  const getContainerItemCount = (containerId: string): number => {
    return items.filter((item) => item.container === containerId).length;
  };

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
          <h1 className="text-3xl font-bold">Containers</h1>
          <p className="text-muted-foreground">
            Manage your containers ({containers.length} total)
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => router.push('/inventory/containers/new')}
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {containers.map((container) => (
            <ContainerCard
              key={container.id}
              container={container}
              imageUrl={getImageUrl(container.primary_image)}
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
      )}
    </div>
  );
}

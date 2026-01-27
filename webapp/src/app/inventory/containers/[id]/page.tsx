'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import pb from '@/lib/pocketbase-client';
import { CroppedImageViewer } from '@/components/image/cropped-image-viewer';
import { ContainerMutator, ItemMutator } from '@project/shared';
import type { Container, Item } from '@project/shared';
import { getImageFileUrl, getExpandedImageUrl } from '@/lib/image-utils';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ItemCard } from '@/components/inventory';
import { useConfirm, ConfirmButton } from '@/components/ui/confirm-dialog';
import { LabelGeneratorDialog } from '@/components/inventory/label-generator-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Loader2,
  ArrowLeft,
  Edit,
  Trash2,
  Plus,
  Package,
  Image as ImageIcon,
  Printer,
} from 'lucide-react';

export default function ContainerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const containerId = params.id as string;

  const [container, setContainer] = useState<Container | null>(null);
  const [containerItems, setContainerItems] = useState<Item[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [isLabelDialogOpen, setIsLabelDialogOpen] = useState(false);
  const { confirm } = useConfirm();

  const containerMutator = new ContainerMutator(pb);
  const itemMutator = new ItemMutator(pb);

  const loadContainerDetails = useCallback(async () => {
    try {
      setIsLoading(true);

      // Load container with expanded ImageRef
      const containerData = await containerMutator.getById(
        containerId,
        'ImageRef'
      );
      if (!containerData) {
        throw new Error('Container not found');
      }
      setContainer(containerData);

      // Load items in this container with expanded ImageRef
      const items = await itemMutator.getByContainer(containerId, 'ImageRef');
      setContainerItems(items);

      // Load all items (for add item dropdown)
      const allItemsResult = await itemMutator.search('');
      // Filter out items already in this container
      const availableItems = allItemsResult.filter(
        (item) => item.ContainerRef !== containerId
      );
      setAllItems(availableItems);
    } catch (error) {
      console.error('Failed to load container details:', error);
      toast.error('Failed to load container details');
      router.push('/inventory');
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId, router]);

  useEffect(() => {
    loadContainerDetails();
  }, [loadContainerDetails]);

  const handleDelete = async () => {
    try {
      await containerMutator.delete(containerId);
      toast.success('Container deleted successfully');
      router.push('/inventory');
    } catch (error) {
      console.error('Failed to delete container:', error);
      toast.error('Failed to delete container');
    }
  };

  const getDeleteMessage = () => {
    if (containerItems.length > 0) {
      return `This container has ${containerItems.length} items. Delete anyway?`;
    }
    return 'Are you sure you want to delete this container?';
  };

  const handleAddItem = async () => {
    if (!selectedItemId) {
      toast.error('Please select an item to add');
      return;
    }

    try {
      setIsAddingItem(true);
      await itemMutator.update(selectedItemId, { ContainerRef: containerId });
      toast.success('Item added to container');
      setSelectedItemId('');
      await loadContainerDetails();
    } catch (error) {
      console.error('Failed to add item to container:', error);
      toast.error('Failed to add item to container');
    } finally {
      setIsAddingItem(false);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!(await confirm('Remove this item from the container?'))) return;

    try {
      await itemMutator.update(itemId, { ContainerRef: undefined });
      toast.success('Item removed from container');
      await loadContainerDetails();
    } catch (error) {
      console.error('Failed to remove item from container:', error);
      toast.error('Failed to remove item from container');
    }
  };

  const getItemImageUrl = (item: Item): string | undefined => {
    // Try item's expanded primary image
    const itemUrl = getExpandedImageUrl(item);
    if (itemUrl) return itemUrl;

    // Fallback to container's expanded image
    if (container) {
      return getExpandedImageUrl(container);
    }

    return undefined;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!container) {
    return null;
  }

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => router.push('/inventory')}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Inventory
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() =>
              router.push(`/inventory/containers/${containerId}/edit`)
            }
          >
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button
             variant="outline"
             onClick={() => setIsLabelDialogOpen(true)}
          >
             <Printer className="h-4 w-4 mr-2" />
             Print Label
          </Button>
          <ConfirmButton
            variant="destructive"
            onConfirm={handleDelete}
            message={getDeleteMessage()}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </ConfirmButton>
        </div>
      </div>

      <LabelGeneratorDialog
        open={isLabelDialogOpen}
        onOpenChange={setIsLabelDialogOpen}
        target={container}
        targetType="container"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Package className="h-6 w-6 text-muted-foreground" />
                <CardTitle className="text-2xl">
                  {container.containerLabel}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {container.containerNotes && (
                <div>
                  <h3 className="text-sm font-medium mb-2">Notes</h3>
                  <p className="text-sm text-muted-foreground">
                    {container.containerNotes}
                  </p>
                </div>
              )}

              <Separator />

              <div>
                <h3 className="text-sm font-medium mb-2">
                  Items ({containerItems.length})
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Items stored in this container
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Add Item Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Add Item to Container</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Select
                  value={selectedItemId}
                  onValueChange={setSelectedItemId}
                  disabled={isAddingItem || allItems.length === 0}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select an item..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allItems.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.itemLabel}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleAddItem}
                  disabled={isAddingItem || !selectedItemId}
                >
                  {isAddingItem ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Add
                    </>
                  )}
                </Button>
              </div>
              {allItems.length === 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  No available items to add. All items are either in this
                  container or other containers.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Items Grid */}
          {containerItems.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Package className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground">
                  This container is empty. Add items using the form above.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {containerItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  imageUrl={getItemImageUrl(item)}
                  boundingBox={item.ImageRef ? item.boundingBox : undefined}
                  onClick={() => router.push(`/inventory/items/${item.id}`)}
                  onEdit={() => router.push(`/inventory/items/${item.id}/edit`)}
                  onDelete={() => handleRemoveItem(item.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Sidebar - Images */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Images</CardTitle>
            </CardHeader>
            <CardContent>
              {!container.expand?.ImageRef ? (
                <div className="text-center py-8">
                  <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    No images available
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative aspect-square rounded-lg overflow-hidden border">
                    <CroppedImageViewer
                      imageUrl={getImageFileUrl(container.expand.ImageRef)}
                      boundingBox={container.boundingBox}
                      alt="Container image"
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Metadata</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{new Date(container.created).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Updated</span>
                <span>{new Date(container.updated).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Container ID</span>
                <span className="font-mono text-xs">{container.id}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

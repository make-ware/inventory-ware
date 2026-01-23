'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import pb from '@/lib/pocketbase-client';
import { CroppedImageViewer } from '@/components/image/cropped-image-viewer';
import {
  ItemMutator,
  ContainerMutator,
  formatCategoryLabel,
} from '@project/shared';
import type { Item, Image, Container } from '@project/shared';
import { getImageFileUrl } from '@/lib/image-utils';
import { ItemHistory } from '@/components/inventory/item-history';

type ItemWithExpand = Item & { expand?: { primaryImage?: Image } };
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Loader2,
  ArrowLeft,
  Edit,
  Trash2,
  Package,
  Image as ImageIcon,
  Copy,
} from 'lucide-react';

export default function ItemDetailPage() {
  const router = useRouter();
  const params = useParams();
  const itemId = params.id as string;

  const [item, setItem] = useState<ItemWithExpand | null>(null);
  const [container, setContainer] = useState<Container | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const itemMutator = new ItemMutator(pb);
  const containerMutator = new ContainerMutator(pb);

  const loadItemDetails = useCallback(async () => {
    try {
      setIsLoading(true);

      // Load item with expanded primaryImage
      const itemData = (await itemMutator.getById(
        itemId,
        'primaryImage'
      )) as ItemWithExpand | null;
      if (!itemData) {
        throw new Error('Item not found');
      }
      setItem(itemData);

      // Load container if item is in one
      if (itemData.container) {
        const containerData = await containerMutator.getById(
          itemData.container
        );
        if (containerData) {
          setContainer(containerData);
        }
      }
    } catch (error) {
      console.error('Failed to load item details:', error);
      toast.error('Failed to load item details');
      router.push('/inventory');
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, router]);

  useEffect(() => {
    loadItemDetails();
  }, [loadItemDetails]);

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      await itemMutator.delete(itemId);
      toast.success('Item deleted successfully');
      router.push('/inventory');
    } catch (error) {
      console.error('Failed to delete item:', error);
      toast.error('Failed to delete item');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!item) {
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
              router.push(`/inventory/items/new?clone_from=${itemId}`)
            }
          >
            <Copy className="h-4 w-4 mr-2" />
            Clone
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push(`/inventory/items/${itemId}/edit`)}
          >
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
          <Button variant="destructive" onClick={handleDelete}>
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">
                {formatCategoryLabel(item.itemType)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {item.itemName && (
                <div>
                  <h3 className="text-sm font-medium mb-1">Product Name</h3>
                  <p className="text-lg font-semibold">{item.itemName}</p>
                </div>
              )}
              {item.itemLabel && (
                <div>
                  <h3 className="text-sm font-medium mb-1">Label</h3>
                  <p className="text-sm text-muted-foreground">
                    {item.itemLabel}
                  </p>
                </div>
              )}
              {item.itemNotes && (
                <div>
                  <h3 className="text-sm font-medium mb-2">Notes</h3>
                  <p className="text-sm text-muted-foreground">
                    {item.itemNotes}
                  </p>
                </div>
              )}

              <Separator />

              <div>
                <h3 className="text-sm font-medium mb-2">Categories</h3>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    {formatCategoryLabel(item.categoryFunctional)}
                  </Badge>
                  <Badge variant="secondary">
                    {formatCategoryLabel(item.categorySpecific)}
                  </Badge>
                  <Badge>{formatCategoryLabel(item.itemType)}</Badge>
                </div>
              </div>

              {item.itemManufacturer && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-medium mb-2">Manufacturer</h3>
                    <p className="text-sm text-muted-foreground">
                      {item.itemManufacturer}
                    </p>
                  </div>
                </>
              )}

              {item.itemAttributes && item.itemAttributes.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-medium mb-2">Attributes</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {item.itemAttributes.map((attr, index) => (
                        <div key={index} className="space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">
                            {attr.name}
                          </p>
                          <p className="text-sm">{attr.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {container && (
                <>
                  <Separator />
                  <div>
                    <h3 className="text-sm font-medium mb-2">Container</h3>
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

          <ItemHistory itemId={item.id} />
        </div>

        {/* Sidebar - Images */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Images</CardTitle>
            </CardHeader>
            <CardContent>
              {!item.expand?.primaryImage ? (
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
                      imageUrl={getImageFileUrl(item.expand.primaryImage)}
                      boundingBox={item.primaryImageBbox}
                      alt="Item image"
                    />
                    <Badge className="absolute top-2 right-2 z-10">
                      Primary
                    </Badge>
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
                <span>{new Date(item.created).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last Updated</span>
                <span>{new Date(item.updated).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Item ID</span>
                <span className="font-mono text-xs">{item.id}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

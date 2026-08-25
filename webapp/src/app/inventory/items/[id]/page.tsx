'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { CroppedImageViewer } from '@/components/image/cropped-image-viewer';
import { formatCategoryLabel } from '@project/shared';
import { getImageFileUrl } from '@/lib/image-utils';
import { ItemHistory } from '@/components/inventory/item-history';
import { ConfirmButton } from '@/components/ui/confirm-dialog';
import { LabelGeneratorDialog } from '@/components/inventory/label-generator-dialog';
import { ItemImageUpload } from '@/components/inventory/item-image-upload';
import { useItem } from '@/hooks/use-items';
import { useDeleteItem } from '@/hooks/use-item-mutations';
import { useContainer } from '@/hooks/use-containers';

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
  Printer,
} from 'lucide-react';

export default function ItemDetailPage() {
  const router = useRouter();
  const params = useParams();
  const itemId = params.id as string;

  const [isLabelDialogOpen, setIsLabelDialogOpen] = useState(false);

  const deleteItem = useDeleteItem();

  const { item, isPending, isError, isMissing } = useItem(itemId);
  // The container is a secondary read: it only names the button below, so its
  // own failure hides that button rather than taking the page down.
  const { container } = useContainer(item?.ContainerRef);

  // A missing item and a failed request are the same dead end here: there is
  // no page to render, so say so once and go back to the inventory.
  const isUnavailable = isError || isMissing;
  useEffect(() => {
    if (!isUnavailable) return;
    toast.error('Failed to load item details');
    router.push('/inventory');
  }, [isUnavailable, router]);

  const handleDelete = async () => {
    try {
      // The mutation evicts this page's own detail key on the way out, so
      // there is nothing left here to read once it resolves.
      await deleteItem.mutateAsync(itemId);
      toast.success('Item deleted successfully');
      router.push('/inventory');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete item'
      );
    }
  };

  if (isPending) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!item) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="ghost"
          onClick={() => router.push('/inventory')}
          className="gap-2 self-start"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Inventory
        </Button>
        {/* Two-up on phones so four actions never push past the viewport. */}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
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
          <Button variant="outline" onClick={() => setIsLabelDialogOpen(true)}>
            <Printer className="h-4 w-4 mr-2" />
            Print Label
          </Button>
          <ConfirmButton
            variant="destructive"
            onConfirm={handleDelete}
            message="Are you sure you want to delete this item?"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </ConfirmButton>
        </div>
      </div>

      <LabelGeneratorDialog
        open={isLabelDialogOpen}
        onOpenChange={setIsLabelDialogOpen}
        target={item}
        targetType="item"
      />

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
                      {item.itemAttributes.map(
                        (
                          attr: { name: string; value: string },
                          index: number
                        ) => (
                          <div key={index} className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">
                              {attr.name}
                            </p>
                            <p className="text-sm">{attr.value}</p>
                          </div>
                        )
                      )}
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
              {!item.expand?.ImageRef ? (
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
                      imageUrl={getImageFileUrl(item.expand.ImageRef)}
                      boundingBox={item.boundingBox}
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

          {/* Item Image Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Replace Image</CardTitle>
            </CardHeader>
            <CardContent>
              <ItemImageUpload
                itemId={itemId}
                onSuccess={() => {
                  // The upload component invalidates what the route rewrote,
                  // so there is nothing to refresh here.
                  toast.success('Item image updated successfully');
                }}
                onError={(error) => toast.error(error.message)}
              />
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

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import pb from '@/lib/pocketbase-client';
import { CroppedImageViewer } from '@/components/image/cropped-image-viewer';
import { ItemMutator } from '@project/shared';
import type { Container, Item } from '@project/shared';
import { getImageFileUrl, getExpandedImageUrl } from '@/lib/image-utils';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ItemCard } from '@/components/inventory';
import { useConfirm, ConfirmButton } from '@/components/ui/confirm-dialog';
import { LabelGeneratorDialog } from '@/components/inventory/label-generator-dialog';
import { ContainerImageUpload } from '@/components/inventory/container-image-upload';
import { CleanupPromptDialog } from '@/components/inventory/cleanup-prompt-dialog';
import { createInventoryService, type CleanupActionRequest } from '@/services';
import { useContainer, useItemsByContainer } from '@/hooks/use-containers';
import { useDeleteContainer } from '@/hooks/use-container-mutations';
import {
  useAddItemToContainer,
  useRemoveItemFromContainer,
} from '@/hooks/use-item-mutations';
import { qk } from '@/lib/query';
import { AsyncCombobox } from '@/components/ui/async-combobox';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
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
  const queryClient = useQueryClient();

  const [isAddingItem, setIsAddingItem] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  // Off: only items filed nowhere are offered. On: every item outside this
  // container, so an add can also be a move.
  const [showAssigned, setShowAssigned] = useState(false);
  // Bumped after each add, to reload the picker from page 1 (see below).
  const [addNonce, setAddNonce] = useState(0);
  const [isLabelDialogOpen, setIsLabelDialogOpen] = useState(false);
  const [isCleanupDialogOpen, setIsCleanupDialogOpen] = useState(false);
  const [unmatchedItems, setUnmatchedItems] = useState<Item[]>([]);
  const { confirm } = useConfirm();

  const inventoryService = useMemo(() => createInventoryService(pb), []);
  // The picker pages the server as the user types, so it owns its own reads
  // rather than drawing on a query hook — see docs/DROPDOWNS.md.
  const itemMutator = useMemo(() => new ItemMutator(pb), []);

  const deleteContainer = useDeleteContainer();
  const addItemToContainer = useAddItemToContainer();
  const removeItemFromContainer = useRemoveItemFromContainer();

  const {
    container,
    isPending: isContainerPending,
    isError: isContainerError,
    isMissing: isContainerMissing,
  } = useContainer(containerId);
  const {
    items: containerItems,
    totalItems: containerItemCount,
    isError: isItemsError,
  } = useItemsByContainer(containerId);
  /**
   * One page of candidate items for the picker.
   *
   * `sort` is not optional: `ItemMutator` sets no default sort, so without it
   * PocketBase returns rows in an unspecified order and paging would skip and
   * repeat records as the offset moves.
   */
  const fetchItemPage = useCallback(
    (query: string, page: number) =>
      itemMutator.search(query, {
        page,
        perPage: 25,
        sort: 'itemLabel',
        // Only needed to show where an already-assigned item currently lives.
        expand: showAssigned ? 'ContainerRef' : undefined,
        filters: showAssigned
          ? { excludeContainer: containerId }
          : { hasContainer: false },
      }),
    [itemMutator, containerId, showAssigned]
  );

  const getItemContainerLabel = (item: Item): string | undefined => {
    const expanded = item.expand?.ContainerRef as Container | undefined;
    return expanded?.containerLabel;
  };

  /**
   * Re-read everything this page shows.
   *
   * Moving an item in or out changes both the container's item list and the
   * paged items lists elsewhere, so the whole `items` prefix goes — and a
   * re-analysed container image can rewrite the container record itself.
   */
  const refreshContainer = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.itemsPrefix() }),
        queryClient.invalidateQueries({
          queryKey: qk.containerById(containerId),
        }),
        queryClient.invalidateQueries({ queryKey: qk.containersPrefix() }),
      ]),
    [queryClient, containerId]
  );

  // A missing container and a failed request are the same dead end here: there
  // is no page to render, so say so once and go back to the inventory.
  const isContainerUnavailable = isContainerError || isContainerMissing;
  useEffect(() => {
    if (!isContainerUnavailable) return;
    toast.error('Failed to load container details');
    router.push('/inventory');
  }, [isContainerUnavailable, router]);

  // The container itself still renders when its items fail to load, so that
  // only warrants a toast. The picker reports its own load failures inline.
  useEffect(() => {
    if (isItemsError) {
      toast.error('Failed to load items in this container');
    }
  }, [isItemsError]);

  const handleDelete = async () => {
    try {
      // The mutation detaches this container's items before deleting it, and
      // evicts the detail key the page is reading — so leave when it resolves.
      await deleteContainer.mutateAsync(containerId);
      toast.success('Container deleted successfully');
      router.push('/inventory');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete container'
      );
    }
  };

  const getDeleteMessage = () => {
    if (containerItemCount > 0) {
      return `This container has ${containerItemCount} items. Delete anyway?`;
    }
    return 'Are you sure you want to delete this container?';
  };

  const handleAddItem = async () => {
    if (!selectedItem) {
      toast.error('Please select an item to add');
      return;
    }

    // In "show all" mode the add is really a move, so make that explicit.
    if (selectedItem.ContainerRef) {
      const currentLabel = getItemContainerLabel(selectedItem);
      const from = currentLabel ? `"${currentLabel}"` : 'another container';
      if (
        !(await confirm(
          `"${selectedItem.itemLabel}" is currently in ${from}. Move it here?`
        ))
      ) {
        return;
      }
    }

    try {
      setIsAddingItem(true);
      await addItemToContainer.mutateAsync({
        itemId: selectedItem.id,
        containerId,
      });
      toast.success('Item added to container');
      setSelectedItem(null);
      // Every add shifts the offsets of the remaining pages, so reload the
      // picker from the top rather than trying to patch the loaded pages.
      setAddNonce((nonce) => nonce + 1);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to add item to container'
      );
    } finally {
      setIsAddingItem(false);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!(await confirm('Remove this item from the container?'))) return;

    try {
      await removeItemFromContainer.mutateAsync({ itemId, containerId });
      toast.success('Item removed from container');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to remove item from container'
      );
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

  // Handle successful container image upsert
  const handleContainerUpsertSuccess = useCallback(
    (result: { unmatchedExisting: Item[] }) => {
      // The upload component invalidates what the upsert rewrote, so there is
      // nothing to refresh here — only the unmatched items to ask about.
      if (result.unmatchedExisting.length > 0) {
        setUnmatchedItems(result.unmatchedExisting);
        setIsCleanupDialogOpen(true);
      } else {
        toast.success('Container image updated successfully');
      }
    },
    []
  );

  // Handle cleanup actions from the cleanup prompt dialog
  const handleCleanupApply = useCallback(
    async (actions: CleanupActionRequest[]) => {
      await inventoryService.executeCleanupActions(actions);
      toast.success('Cleanup actions applied successfully');
      // Refresh container details after cleanup
      await refreshContainer();
    },
    [inventoryService, refreshContainer]
  );

  // Get image URL for unmatched items in cleanup dialog
  const getCleanupItemImageUrl = useCallback(
    (item: Item): string | undefined => {
      return getExpandedImageUrl(item);
    },
    []
  );

  if (isContainerPending) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!container) {
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
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
          <Button
            variant="outline"
            onClick={() =>
              router.push(`/inventory/containers/${containerId}/edit`)
            }
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

      <CleanupPromptDialog
        open={isCleanupDialogOpen}
        onOpenChange={setIsCleanupDialogOpen}
        unmatchedItems={unmatchedItems}
        onApply={handleCleanupApply}
        getImageUrl={getCleanupItemImageUrl}
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
                  Items ({containerItemCount})
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
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="show-assigned-items"
                  checked={showAssigned}
                  onCheckedChange={(checked) => {
                    setShowAssigned(checked === true);
                    setSelectedItem(null);
                  }}
                  disabled={isAddingItem}
                />
                <Label
                  htmlFor="show-assigned-items"
                  className="text-sm font-normal text-muted-foreground"
                >
                  Show items already in another container
                </Label>
              </div>
              <div className="flex min-w-0 flex-1 basis-80 gap-2">
                <div className="min-w-0 flex-1">
                  <AsyncCombobox<Item>
                    value={selectedItem?.id}
                    selectedLabel={selectedItem?.itemLabel}
                    onChange={(_value, item) => setSelectedItem(item)}
                    fetchPage={fetchItemPage}
                    queryKey={showAssigned ? 'all' : 'unassigned'}
                    resetToken={addNonce}
                    getOptionValue={(item) => item.id}
                    getOptionLabel={(item) => item.itemLabel}
                    getOptionDescription={(item) =>
                      showAssigned
                        ? getItemContainerLabel(item)
                        : item.itemManufacturer || item.itemType
                    }
                    placeholder="Select an item..."
                    searchPlaceholder="Search items..."
                    emptyMessage={
                      showAssigned
                        ? 'No matching items outside this container'
                        : 'No unassigned items match'
                    }
                    disabled={isAddingItem}
                  />
                </div>
                <Button
                  onClick={handleAddItem}
                  disabled={isAddingItem || !selectedItem}
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

          {/* Container Image Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Replace Image</CardTitle>
            </CardHeader>
            <CardContent>
              <ContainerImageUpload
                containerId={containerId}
                onSuccess={handleContainerUpsertSuccess}
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

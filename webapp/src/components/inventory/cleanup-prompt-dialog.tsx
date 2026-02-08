'use client';

import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { Item, Image } from '@project/shared';
import { ImageMutator } from '@project/shared';
import pb from '@/lib/pocketbase-client';
import type { CleanupAction, CleanupActionRequest } from '@/services/inventory';

interface CleanupPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unmatchedItems: Item[];
  onApply: (actions: CleanupActionRequest[]) => Promise<void>;
  getImageUrl?: (item: Item) => string | undefined;
}

export function CleanupPromptDialog({
  open,
  onOpenChange,
  unmatchedItems,
  onApply,
  getImageUrl: getImageUrlProp,
}: CleanupPromptDialogProps) {
  // Track selected action for each item (default: 'keep')
  const [actions, setActions] = useState<Map<string, CleanupAction>>(
    new Map(unmatchedItems.map((item) => [item.id, 'keep']))
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create image mutator for getting image URLs
  const imageMutator = useMemo(() => new ImageMutator(pb), []);

  // Get image URL for an item - use prop if provided, otherwise use default implementation
  const getImageUrl = (item: Item): string | undefined => {
    if (getImageUrlProp) {
      return getImageUrlProp(item);
    }

    if (!item.ImageRef) return undefined;

    try {
      // Create a minimal image object with the required fields
      const image: Partial<Image> = {
        id: item.ImageRef,
        collectionId: '',
        collectionName: 'Images',
        created: '',
        updated: '',
        file: '',
      };
      return imageMutator.getFileUrl(image as Image);
    } catch (error) {
      console.warn('Failed to get image URL:', error);
      return undefined;
    }
  };

  // Update action for a specific item
  const setItemAction = (itemId: string, action: CleanupAction) => {
    setActions((prev) => {
      const next = new Map(prev);
      next.set(itemId, action);
      return next;
    });
  };

  // Handle apply button click
  const handleApply = async () => {
    try {
      setIsSubmitting(true);
      setError(null);

      // Build action requests array
      const actionRequests: CleanupActionRequest[] = Array.from(
        actions.entries()
      ).map(([itemId, action]) => ({
        itemId,
        action,
      }));

      // Execute cleanup actions via inventory service
      await onApply(actionRequests);

      // Close dialog on success
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to execute cleanup actions:', err);
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to apply cleanup actions';
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle dialog close - treat all as "keep" if dismissed without applying
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !isSubmitting) {
      // Reset actions to 'keep' for all items when dismissed
      setActions(new Map(unmatchedItems.map((item) => [item.id, 'keep'])));
      setError(null);
    }
    onOpenChange(newOpen);
  };

  // Count actions for summary
  const actionCounts = useMemo(() => {
    const counts = { keep: 0, remove: 0, delete: 0 };
    actions.forEach((action) => {
      counts[action]++;
    });
    return counts;
  }, [actions]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Review Unmatched Items</DialogTitle>
          <DialogDescription>
            The following {unmatchedItems.length} item
            {unmatchedItems.length !== 1 ? 's were' : ' was'} not found in the
            new image. Choose an action for each item.
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          {unmatchedItems.map((item) => {
            const imageUrl = getImageUrl(item);
            const currentAction = actions.get(item.id) || 'keep';

            return (
              <div
                key={item.id}
                className="flex items-start gap-4 p-4 border rounded-lg bg-card"
              >
                {/* Thumbnail */}
                <div className="flex-shrink-0 w-20 h-20 bg-muted rounded-md overflow-hidden">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={item.itemLabel}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                      No Image
                    </div>
                  )}
                </div>

                {/* Item details */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm truncate">
                    {item.itemLabel}
                  </h4>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {item.categoryFunctional && (
                      <Badge variant="secondary" className="text-xs">
                        {item.categoryFunctional}
                      </Badge>
                    )}
                    {item.categorySpecific && (
                      <Badge variant="outline" className="text-xs">
                        {item.categorySpecific}
                      </Badge>
                    )}
                    {item.itemType && (
                      <Badge variant="outline" className="text-xs">
                        {item.itemType}
                      </Badge>
                    )}
                  </div>
                  {item.itemNotes && (
                    <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                      {item.itemNotes}
                    </p>
                  )}
                </div>

                {/* Action selector */}
                <div className="flex-shrink-0 w-40">
                  <Select
                    value={currentAction}
                    onValueChange={(value) =>
                      setItemAction(item.id, value as CleanupAction)
                    }
                    disabled={isSubmitting}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="keep">Keep</SelectItem>
                      <SelectItem value="remove">
                        Remove from Container
                      </SelectItem>
                      <SelectItem value="delete">Delete</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            );
          })}
        </div>

        {/* Error display */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Summary and actions */}
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex-1 text-sm text-muted-foreground">
            {actionCounts.keep > 0 && <span>Keep: {actionCounts.keep} </span>}
            {actionCounts.remove > 0 && (
              <span>Remove: {actionCounts.remove} </span>
            )}
            {actionCounts.delete > 0 && (
              <span>Delete: {actionCounts.delete}</span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleApply} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Applying...
                </>
              ) : (
                'Apply'
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

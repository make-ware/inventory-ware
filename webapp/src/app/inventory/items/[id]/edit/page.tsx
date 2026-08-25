'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import pb from '@/lib/pocketbase-client';
import { ItemMutator, formatPocketBaseError } from '@project/shared';
import type { ItemInput } from '@project/shared';
import { useAuth } from '@/hooks/use-auth';
import { useItem } from '@/hooks/use-items';
import { useCategoryLibrary } from '@/hooks/use-categories';
import { qk } from '@/lib/query';
import { getExpandedImageUrl } from '@/lib/image-utils';
import { ItemUpdateForm } from '@/components/inventory';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, ArrowLeft } from 'lucide-react';

/** Surface PocketBase's per-field messages rather than a flat fallback. */
function describeError(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'data' in error) {
    return formatPocketBaseError(
      error as { data?: Record<string, string[]>; message?: string }
    );
  }
  if (error instanceof Error) {
    return error.message || fallback;
  }
  return fallback;
}

export default function EditItemPage() {
  const router = useRouter();
  const params = useParams();
  const itemId = params.id as string;
  const queryClient = useQueryClient();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const { userId } = useAuth();
  const itemMutator = useMemo(() => new ItemMutator(pb), []);

  const { item, isPending, isError, isMissing, error } = useItem(itemId);
  const { categories, isError: isCategoriesError } = useCategoryLibrary(userId);

  // A missing item and a failed request both leave nothing to edit.
  const isUnavailable = isError || isMissing;
  useEffect(() => {
    if (!isUnavailable) return;
    toast.error(
      isMissing
        ? 'Item not found'
        : describeError(error, 'Failed to load item. Please try again.')
    );
    router.push('/inventory');
  }, [isUnavailable, isMissing, error, router]);

  // The categories only populate the combobox suggestions, so losing them
  // degrades the form rather than blocking it.
  useEffect(() => {
    if (isCategoriesError) {
      toast.error(
        'Failed to load categories. Some fields may not be available.'
      );
    }
  }, [isCategoriesError]);

  const handleSubmit = async (data: Partial<Omit<ItemInput, 'UserRef'>>) => {
    try {
      setIsSubmitting(true);
      await itemMutator.update(itemId, data);
      toast.success('Item updated successfully');
      // Drop the pre-edit copies before navigating, so the detail page this
      // returns to reads the record back rather than repainting the old one.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.itemById(itemId) }),
        queryClient.invalidateQueries({ queryKey: qk.itemsPrefix() }),
        queryClient.invalidateQueries({ queryKey: qk.categoriesPrefix() }),
      ]);
      router.push(`/inventory/items/${itemId}`);
    } catch (error) {
      console.error('Failed to update item:', error);
      toast.error(
        describeError(error, 'Failed to update item. Please try again.')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push(`/inventory/items/${itemId}`);
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
    <div className="mx-auto max-w-3xl space-y-6">
      <Button
        variant="ghost"
        onClick={() => router.push(`/inventory/items/${itemId}`)}
        className="gap-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Item
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Edit Item</CardTitle>
        </CardHeader>
        <CardContent>
          <ItemUpdateForm
            defaultValues={{
              itemLabel: item.itemLabel,
              itemName: item.itemName,
              itemNotes: item.itemNotes,
              categoryFunctional: item.categoryFunctional,
              categorySpecific: item.categorySpecific,
              itemType: item.itemType,
              itemManufacturer: item.itemManufacturer,
              itemAttributes: item.itemAttributes,
              ContainerRef: item.ContainerRef,
              ImageRef: item.ImageRef,
              boundingBox: item.boundingBox,
            }}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isSubmitting={isSubmitting}
            categories={categories}
            // The detail query expands `ImageRef`, so the image record travels
            // with the item and the crop preview needs no lookup of its own.
            imageUrl={getExpandedImageUrl(item)}
          />
        </CardContent>
      </Card>
    </div>
  );
}

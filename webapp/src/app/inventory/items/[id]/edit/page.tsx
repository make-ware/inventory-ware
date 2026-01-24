'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import pb from '@/lib/pocketbase-client';
import { ItemMutator, formatPocketBaseError } from '@project/shared';
import type { Item, ItemInput, CategoryLibrary, Image } from '@project/shared';
import { useInventory } from '@/hooks/use-inventory';
import { ItemUpdateForm } from '@/components/inventory';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, ArrowLeft } from 'lucide-react';

export default function EditItemPage() {
  const router = useRouter();
  const params = useParams();
  const itemId = params.id as string;

  const [item, setItem] = useState<Item | null>(null);
  const [categories, setCategories] = useState<CategoryLibrary>();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { cacheImage } = useInventory();
  const itemMutator = useMemo(() => new ItemMutator(pb), []);

  const loadItem = useCallback(async () => {
    try {
      setIsLoading(true);
      const itemData = await itemMutator.getById(itemId, 'primaryImage');
      if (!itemData) {
        toast.error('Item not found');
        router.push('/inventory');
        return;
      }

      // Cache the primary image if it exists so the form can display it
      const expandedItem = itemData as Item & {
        expand?: { primaryImage?: Image };
      };
      if (expandedItem.expand?.primaryImage) {
        cacheImage(expandedItem.expand.primaryImage);
      }

      setItem(itemData);
    } catch (error) {
      console.error('Failed to load item:', error);
      let errorMessage = 'Failed to load item. Please try again.';

      // Try to extract a meaningful error message
      if (error && typeof error === 'object' && 'data' in error) {
        errorMessage = formatPocketBaseError(
          error as { data?: Record<string, string[]>; message?: string }
        );
      } else if (error instanceof Error) {
        errorMessage = `Failed to load item: ${error.message}`;
      }

      toast.error(errorMessage);
      router.push('/inventory');
    } finally {
      setIsLoading(false);
    }
  }, [itemId, router, itemMutator, cacheImage]);

  useEffect(() => {
    loadItem();
    itemMutator
      .getDistinctCategories()
      .then(setCategories)
      .catch((err) => {
        console.error('Failed to load categories', err);
        toast.error(
          'Failed to load categories. Some fields may not be available.'
        );
      });
  }, [loadItem, itemMutator]);

  const handleSubmit = async (data: Partial<Omit<ItemInput, 'UserRef'>>) => {
    try {
      setIsSubmitting(true);
      await itemMutator.update(itemId, data);
      toast.success('Item updated successfully');
      router.push(`/inventory/items/${itemId}`);
    } catch (error) {
      console.error('Failed to update item:', error);
      let errorMessage = 'Failed to update item. Please try again.';

      // Try to extract a meaningful error message
      if (error && typeof error === 'object' && 'data' in error) {
        errorMessage = formatPocketBaseError(
          error as { data?: Record<string, string[]>; message?: string }
        );
      } else if (error instanceof Error) {
        errorMessage = error.message || errorMessage;
      }

      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push(`/inventory/items/${itemId}`);
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
    <div className="container py-8 max-w-3xl space-y-6">
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
              itemNotes: item.itemNotes,
              categoryFunctional: item.categoryFunctional,
              categorySpecific: item.categorySpecific,
              itemType: item.itemType,
              itemManufacturer: item.itemManufacturer,
              itemAttributes: item.itemAttributes,
              container: item.container,
              primaryImage: item.primaryImage,
            }}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isSubmitting={isSubmitting}
            categories={categories}
          />
        </CardContent>
      </Card>
    </div>
  );
}

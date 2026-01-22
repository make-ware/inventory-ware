'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import pb from '@/lib/pocketbase-client';
import { ItemMutator } from '@project/shared';
import type { Item, ItemInput, CategoryLibrary } from '@project/shared';
import { ItemForm } from '@/components/inventory';
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

  const itemMutator = useMemo(() => new ItemMutator(pb), []);

  const loadItem = useCallback(async () => {
    try {
      setIsLoading(true);
      const itemData = await itemMutator.getById(itemId);
      if (!itemData) {
        throw new Error('Item not found');
      }
      setItem(itemData);
    } catch (error) {
      console.error('Failed to load item:', error);
      toast.error('Failed to load item');
      router.push('/inventory');
    } finally {
      setIsLoading(false);
    }
  }, [itemId, router, itemMutator]);

  useEffect(() => {
    loadItem();
    itemMutator
      .getDistinctCategories()
      .then(setCategories)
      .catch((err) => console.error('Failed to load categories', err));
  }, [loadItem, itemMutator]);

  const handleSubmit = async (data: ItemInput) => {
    try {
      setIsSubmitting(true);
      await itemMutator.update(itemId, data);
      toast.success('Item updated successfully');
      router.push(`/inventory/items/${itemId}`);
    } catch (error) {
      console.error('Failed to update item:', error);
      toast.error('Failed to update item');
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
    <div className="container mx-auto py-8 max-w-3xl space-y-6">
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
          <ItemForm
            defaultValues={{
              item_label: item.item_label,
              item_notes: item.item_notes,
              category_functional: item.category_functional,
              category_specific: item.category_specific,
              item_type: item.item_type,
              item_manufacturer: item.item_manufacturer,
              item_attributes: item.item_attributes,
              container: item.container,
              primary_image: item.primary_image,
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

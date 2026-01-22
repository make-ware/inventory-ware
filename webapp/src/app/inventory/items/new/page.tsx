'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import pb from '@/lib/pocketbase-client';
import { ItemMutator } from '@project/shared';
import type { ItemInput, CategoryLibrary } from '@project/shared';
import { ItemForm } from '@/components/inventory';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft, Loader2 } from 'lucide-react';

function NewItemContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [categories, setCategories] = useState<CategoryLibrary>();
  const [defaultValues, setDefaultValues] = useState<Partial<ItemInput>>({});
  const [isLoadingDefaults, setIsLoadingDefaults] = useState(false);

  const itemMutator = useMemo(() => new ItemMutator(pb), []);
  const imageId = searchParams.get('imageId');
  const cloneFromId = searchParams.get('clone_from');

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const result = await itemMutator.getDistinctCategories();
        setCategories(result);
      } catch (error) {
        console.error('Failed to load categories:', error);
      }
    };
    loadCategories();
  }, [itemMutator]);

  useEffect(() => {
    const loadDefaults = async () => {
      let defaults: Partial<ItemInput> = {};

      if (imageId) {
        defaults.primary_image = imageId;
      }

      if (cloneFromId) {
        setIsLoadingDefaults(true);
        try {
          const item = await itemMutator.getById(cloneFromId);
          if (item) {
            defaults = {
              ...defaults,
              item_label: item.item_label + ' (Copy)',
              item_notes: item.item_notes,
              category_functional: item.category_functional,
              category_specific: item.category_specific,
              item_type: item.item_type,
              item_manufacturer: item.item_manufacturer,
              item_attributes: item.item_attributes,
              container: item.container,
              primary_image: defaults.primary_image || item.primary_image,
              primary_image_bbox: item.primary_image_bbox,
            };
          }
        } catch (error) {
          console.error('Failed to load clone source', error);
          toast.error('Failed to load clone source');
        } finally {
          setIsLoadingDefaults(false);
        }
      }

      setDefaultValues(defaults);
    };

    if (cloneFromId || imageId) {
      loadDefaults();
    }
  }, [cloneFromId, imageId, itemMutator]);

  if (isLoadingDefaults) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const handleSubmit = async (data: ItemInput) => {
    try {
      setIsSubmitting(true);
      const newItem = await itemMutator.create(data);
      toast.success('Item created successfully');
      router.push(`/inventory/items/${newItem.id}`);
    } catch (error) {
      console.error('Failed to create item:', error);
      toast.error('Failed to create item');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push('/inventory');
  };

  return (
    <div className="container mx-auto py-8 max-w-3xl space-y-6">
      <Button
        variant="ghost"
        onClick={() => router.push('/inventory')}
        className="gap-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Inventory
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>
            {cloneFromId ? 'Clone Item' : 'Create New Item'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ItemForm
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isSubmitting={isSubmitting}
            defaultValues={defaultValues}
            categories={categories}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default function NewItemPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <NewItemContent />
    </Suspense>
  );
}

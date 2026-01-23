'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import pb from '@/lib/pocketbase-client';
import { ItemMutator } from '@project/shared';
import type { ItemInput, CategoryLibrary } from '@project/shared';
import { ItemCreateForm } from '@/components/inventory';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

function NewItemContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userId } = useAuth();
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
        defaults.primaryImage = imageId;
      }

      if (cloneFromId) {
        setIsLoadingDefaults(true);
        try {
          const item = await itemMutator.getById(cloneFromId);
          if (item) {
            defaults = {
              ...defaults,
              itemLabel: item.itemLabel + ' (Copy)',
              itemNotes: item.itemNotes,
              categoryFunctional: item.categoryFunctional,
              categorySpecific: item.categorySpecific,
              itemType: item.itemType,
              itemManufacturer: item.itemManufacturer,
              itemAttributes: item.itemAttributes,
              container: item.container,
              primaryImage: defaults.primaryImage || item.primaryImage,
              primaryImageBbox: item.primaryImageBbox,
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

  const handleSubmit = async (data: Partial<Omit<ItemInput, 'UserRef'>>) => {
    try {
      if (!userId) {
        toast.error('No authenticated user');
        return;
      }
      setIsSubmitting(true);
      const newItem = await itemMutator.create({
        ...data,
        UserRef: userId,
      } as ItemInput);
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
          <ItemCreateForm
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

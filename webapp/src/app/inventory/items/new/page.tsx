'use client';

import { Suspense, useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import pb from '@/lib/pocketbase-client';
import { ItemMutator } from '@project/shared';
import type { ItemInput } from '@project/shared';
import { ItemCreateForm } from '@/components/inventory';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useCategoryLibrary } from '@/hooks/use-categories';
import { qk } from '@/lib/query';

function NewItemContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [defaultValues, setDefaultValues] = useState<Partial<ItemInput>>({});
  const [isLoadingDefaults, setIsLoadingDefaults] = useState(false);

  const itemMutator = useMemo(() => new ItemMutator(pb), []);
  const imageId = searchParams.get('imageId');
  const cloneFromId = searchParams.get('clone_from');

  // Shared with the items list and the edit form, so arriving here from either
  // of them paints the comboboxes from cache.
  const { categories } = useCategoryLibrary(userId);

  useEffect(() => {
    const loadDefaults = async () => {
      let defaults: Partial<ItemInput> = {};

      if (imageId) {
        defaults.ImageRef = imageId;
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
              ContainerRef: item.ContainerRef,
              ImageRef: defaults.ImageRef || item.ImageRef,
              boundingBox: item.boundingBox,
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
      <div className="flex items-center justify-center min-h-[50vh]">
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
      // The new row belongs in the lists, and its categories in the library the
      // comboboxes offer; both are cached, so say so before navigating.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.itemsPrefix() }),
        queryClient.invalidateQueries({ queryKey: qk.categoriesPrefix() }),
      ]);
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
    <div className="mx-auto max-w-3xl space-y-6">
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

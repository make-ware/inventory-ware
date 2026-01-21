'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import pb from '@/lib/pocketbase-client';
import { ItemMutator } from '@project/shared';
import type { ItemInput } from '@project/shared';
import { ItemForm } from '@/components/inventory';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';

function NewItemContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const itemMutator = new ItemMutator(pb);
  const imageId = searchParams.get('imageId');

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
          <CardTitle>Create New Item</CardTitle>
        </CardHeader>
        <CardContent>
          <ItemForm
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isSubmitting={isSubmitting}
            defaultValues={imageId ? { primary_image: imageId } : undefined}
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

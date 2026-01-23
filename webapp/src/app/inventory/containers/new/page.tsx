'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import pb from '@/lib/pocketbase-client';
import { ContainerMutator } from '@project/shared';
import type { ContainerInput } from '@project/shared';
import { ContainerCreateForm } from '@/components/inventory';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';

function NewContainerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { userId } = useAuth();

  const containerMutator = new ContainerMutator(pb);
  const imageId = searchParams.get('imageId');

  const handleSubmit = async (
    data: Partial<Omit<ContainerInput, 'UserRef'>>
  ) => {
    try {
      setIsSubmitting(true);
      if (!userId) {
        throw new Error('No authenticated user');
      }
      const newContainer = await containerMutator.create({
        ...data,
        UserRef: userId,
      } as ContainerInput);
      toast.success('Container created successfully');
      router.push(`/inventory/containers/${newContainer.id}`);
    } catch (error) {
      console.error('Failed to create container:', error);
      toast.error('Failed to create container');
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
          <CardTitle>Create New Container</CardTitle>
        </CardHeader>
        <CardContent>
          <ContainerCreateForm
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isSubmitting={isSubmitting}
            defaultValues={imageId ? { primaryImage: imageId } : undefined}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export default function NewContainerPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <NewContainerContent />
    </Suspense>
  );
}

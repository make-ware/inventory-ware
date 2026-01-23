'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import pb from '@/lib/pocketbase-client';
import { ContainerMutator } from '@project/shared';
import type { Container, ContainerInput } from '@project/shared';
import { ContainerUpdateForm } from '@/components/inventory';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, ArrowLeft } from 'lucide-react';

export default function EditContainerPage() {
  const router = useRouter();
  const params = useParams();
  const containerId = params.id as string;

  const [container, setContainer] = useState<Container | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const containerMutator = useMemo(() => new ContainerMutator(pb), []);

  const loadContainer = useCallback(async () => {
    try {
      setIsLoading(true);
      const containerData = await containerMutator.getById(containerId);
      if (!containerData) {
        throw new Error('Container not found');
      }
      setContainer(containerData);
    } catch (error) {
      console.error('Failed to load container:', error);
      toast.error('Failed to load container');
      router.push('/inventory');
    } finally {
      setIsLoading(false);
    }
  }, [containerId, router, containerMutator]);

  useEffect(() => {
    loadContainer();
  }, [loadContainer]);

  const handleSubmit = async (
    data: Partial<Omit<ContainerInput, 'UserRef'>>
  ) => {
    try {
      setIsSubmitting(true);
      await containerMutator.update(containerId, data);
      toast.success('Container updated successfully');
      router.push(`/inventory/containers/${containerId}`);
    } catch (error) {
      console.error('Failed to update container:', error);
      toast.error('Failed to update container');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push(`/inventory/containers/${containerId}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!container) {
    return null;
  }

  return (
    <div className="container py-8 max-w-3xl space-y-6">
      <Button
        variant="ghost"
        onClick={() => router.push(`/inventory/containers/${containerId}`)}
        className="gap-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Container
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Edit Container</CardTitle>
        </CardHeader>
        <CardContent>
          <ContainerUpdateForm
            defaultValues={{
              containerLabel: container.containerLabel,
              containerNotes: container.containerNotes,
              primaryImage: container.primaryImage,
            }}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isSubmitting={isSubmitting}
          />
        </CardContent>
      </Card>
    </div>
  );
}

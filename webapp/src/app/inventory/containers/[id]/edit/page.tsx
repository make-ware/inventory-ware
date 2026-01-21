'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import pb from '@/lib/pocketbase-client';
import { ContainerMutator } from '@project/shared';
import type { Container, ContainerInput } from '@project/shared';
import { ContainerForm } from '@/components/inventory';
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

  const containerMutator = new ContainerMutator(pb);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId, router]);

  useEffect(() => {
    loadContainer();
  }, [loadContainer]);

  const handleSubmit = async (data: ContainerInput) => {
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
    <div className="container mx-auto py-8 max-w-3xl space-y-6">
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
          <ContainerForm
            defaultValues={{
              container_label: container.container_label,
              container_notes: container.container_notes,
              primary_image: container.primary_image,
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

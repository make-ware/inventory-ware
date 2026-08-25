'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import pb from '@/lib/pocketbase-client';
import { ContainerMutator, formatPocketBaseError } from '@project/shared';
import type { ContainerInput } from '@project/shared';
import { useContainer } from '@/hooks/use-containers';
import { qk } from '@/lib/query';
import { getExpandedImageUrl } from '@/lib/image-utils';
import { ContainerUpdateForm } from '@/components/inventory';
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

export default function EditContainerPage() {
  const router = useRouter();
  const params = useParams();
  const containerId = params.id as string;
  const queryClient = useQueryClient();

  const [isSubmitting, setIsSubmitting] = useState(false);

  const containerMutator = useMemo(() => new ContainerMutator(pb), []);

  const { container, isPending, isError, isMissing, error } =
    useContainer(containerId);

  // A missing container and a failed request both leave nothing to edit.
  const isUnavailable = isError || isMissing;
  useEffect(() => {
    if (!isUnavailable) return;
    toast.error(describeError(error, 'Failed to load container'));
    router.push('/inventory');
  }, [isUnavailable, error, router]);

  const handleSubmit = async (
    data: Partial<Omit<ContainerInput, 'UserRef'>>
  ) => {
    try {
      setIsSubmitting(true);
      await containerMutator.update(containerId, data);
      toast.success('Container updated successfully');
      // Drop the pre-edit copies before navigating, so the detail page this
      // returns to reads the record back rather than repainting the old one.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: qk.containerById(containerId),
        }),
        queryClient.invalidateQueries({ queryKey: qk.containersPrefix() }),
      ]);
      router.push(`/inventory/containers/${containerId}`);
    } catch (error) {
      console.error('Failed to update container:', error);
      toast.error(
        describeError(error, 'Failed to update container. Please try again.')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    router.push(`/inventory/containers/${containerId}`);
  };

  if (isPending) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!container) {
    return null;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
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
              ImageRef: container.ImageRef,
              boundingBox: container.boundingBox,
            }}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            isSubmitting={isSubmitting}
            // The detail query expands `ImageRef`, so the image record travels
            // with the container and the crop preview needs no lookup of its own.
            imageUrl={getExpandedImageUrl(container)}
          />
        </CardContent>
      </Card>
    </div>
  );
}

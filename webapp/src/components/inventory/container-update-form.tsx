'use client';

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ContainerUpdateSchema, type ContainerUpdate } from '@project/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useInventory } from '@/hooks/use-inventory';
import { CroppedImageViewer } from '../image/cropped-image-viewer';
import { BoundingBoxEditor } from './bounding-box-editor';
import { Crop } from 'lucide-react';

interface ContainerUpdateFormProps {
  defaultValues?: Partial<ContainerUpdate>;
  onSubmit: (
    data: Partial<Omit<ContainerUpdate, 'UserRef'>>
  ) => void | Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
}

export function ContainerUpdateForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
}: ContainerUpdateFormProps) {
  const { getImageUrl } = useInventory();
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  // Create a form schema without UserRef since it's not part of the form
  const FormSchema = ContainerUpdateSchema;

  const form = useForm<z.input<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      containerLabel: '',
      containerNotes: '',
      ImageRef: undefined,
      boundingBox: undefined,
      ...defaultValues,
    },
  });

  const ImageRefId = useWatch({
    control: form.control,
    name: 'ImageRef',
  });
  const boundingBox = useWatch({
    control: form.control,
    name: 'boundingBox',
  });
  const imageUrl = getImageUrl(ImageRefId);

  const handleSubmit = async (data: z.input<typeof FormSchema>) => {
    // Only send fields that were actually changed (dirty)
    const dirtyFields = form.formState.dirtyFields;
    const dirtyData: Record<string, unknown> = {};

    for (const key of Object.keys(dirtyFields)) {
      if (dirtyFields[key as keyof typeof dirtyFields]) {
        dirtyData[key] = data[key as keyof typeof data];
      }
    }

    // Only submit if there are changes
    if (Object.keys(dirtyData).length > 0) {
      await onSubmit(dirtyData as Partial<Omit<ContainerUpdate, 'UserRef'>>);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="containerLabel"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Container Label</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g., Tool Box A, Electronics Drawer"
                  {...field}
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormDescription>
                A clear, descriptive name for the container
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="containerNotes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Additional details about the container..."
                  {...field}
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormDescription>
                Any additional information about the container&apos;s location,
                purpose, or contents
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Image Section */}
        {imageUrl && (
          <div className="space-y-4 border rounded-lg p-4">
            <h3 className="text-sm font-medium">Primary Image</h3>
            <div className="flex flex-col md:flex-row gap-4 items-start">
              <div className="w-full md:w-60 h-60 border rounded overflow-hidden bg-muted shrink-0">
                <CroppedImageViewer
                  imageUrl={imageUrl}
                  boundingBox={boundingBox}
                  mode="highlight"
                  className="w-full h-full"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2 w-fit">
                      <Crop className="w-4 h-4" />
                      Edit Bounding Box
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl">
                    <DialogHeader>
                      <DialogTitle>Edit Bounding Box</DialogTitle>
                    </DialogHeader>
                    <div className="mt-4">
                      <BoundingBoxEditor
                        imageUrl={imageUrl}
                        initialBox={boundingBox}
                        onSave={(box) => {
                          form.setValue('boundingBox', box, {
                            shouldDirty: true,
                          });
                          setIsEditorOpen(false);
                        }}
                        onCancel={() => setIsEditorOpen(false)}
                      />
                    </div>
                  </DialogContent>
                </Dialog>
                <p className="text-xs text-muted-foreground max-w-[200px]">
                  Define the area of the image that contains this container.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3 justify-end">
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Updating...' : 'Update Container'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

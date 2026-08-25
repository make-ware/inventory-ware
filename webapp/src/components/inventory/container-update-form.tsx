'use client';

import { useState } from 'react';
import { useForm, useWatch, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
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
import { CroppedImageViewer } from '../image/cropped-image-viewer';
import { BoundingBoxEditor } from './bounding-box-editor';
import { Crop } from 'lucide-react';
import { createLogger } from '@/lib/logger';

const log = createLogger('container-update-form');

// The form is fed straight from a PocketBase record, which returns `null` for
// unset json/relation columns — so the prop is the schema's *input* shape, not
// its parsed output (issue #57).
type ContainerUpdateFormValues = z.input<typeof ContainerUpdateSchema>;

// Fallback values for keys the caller does not supply, so every field stays a
// controlled input.
const BASE_DEFAULTS: ContainerUpdateFormValues = {
  containerLabel: '',
  containerNotes: '',
  ImageRef: undefined,
  boundingBox: undefined,
};

interface ContainerUpdateFormProps {
  defaultValues?: Partial<ContainerUpdateFormValues>;
  onSubmit: (
    data: Partial<Omit<ContainerUpdate, 'UserRef'>>
  ) => void | Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
  /**
   * URL of the container's primary image, for the crop preview and editor.
   *
   * Passed in rather than looked up: the caller already holds the expanded
   * `ImageRef` record it comes from, and resolving it here would mean this
   * presentational form owning a data fetch of its own.
   */
  imageUrl?: string;
}

export function ContainerUpdateForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
  imageUrl,
}: ContainerUpdateFormProps) {
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  // Create a form schema without UserRef since it's not part of the form
  const FormSchema = ContainerUpdateSchema;

  // `values` rather than `defaultValues`, so the form re-syncs if the caller
  // loads the record asynchronously. React Hook Form deep-compares before
  // resetting, so passing a fresh object literal on every render is safe;
  // `keepDirtyValues` protects edits the user has already made.
  const form = useForm<
    z.input<typeof FormSchema>,
    unknown,
    z.output<typeof FormSchema>
  >({
    resolver: zodResolver(FormSchema),
    values: { ...BASE_DEFAULTS, ...defaultValues },
    resetOptions: { keepDirtyValues: true },
  });

  // PocketBase returns `null` for unset relation/json columns; the schema
  // normalises that on parse, but the raw form values still carry it.
  const boundingBox =
    useWatch({
      control: form.control,
      name: 'boundingBox',
    }) ?? undefined;

  const handleSubmit = async (data: z.output<typeof FormSchema>) => {
    // Only send fields that were actually changed (dirty). The form also
    // carries ImageRef, which cannot be edited here, and echoing it back would
    // clobber a concurrent change made elsewhere.
    const dirtyFields = form.formState.dirtyFields;
    const dirtyData: Record<string, unknown> = {};

    for (const key of Object.keys(dirtyFields)) {
      if (dirtyFields[key as keyof typeof dirtyFields]) {
        dirtyData[key] = data[key as keyof typeof data];
      }
    }

    // Never fail silently: an empty patch gets visible feedback instead of a
    // dead-looking button (issue #57).
    if (Object.keys(dirtyData).length === 0) {
      toast.info('No changes to save');
      return;
    }

    await onSubmit(dirtyData as Partial<Omit<ContainerUpdate, 'UserRef'>>);
  };

  // Safety net: boundingBox and ImageRef have no rendered <FormMessage />, so a
  // validation failure on one of them would otherwise be completely invisible —
  // which is exactly how issue #57 presented.
  const handleInvalid = (errors: FieldErrors<z.input<typeof FormSchema>>) => {
    // Flatten to field -> message: the raw error objects carry DOM refs, which
    // are noise (and cyclic) in a log line.
    const messages = Object.entries(errors).map(([field, error]) =>
      typeof error?.message === 'string' ? error.message : `${field} is invalid`
    );
    log.error('Container update form validation failed', {
      fields: Object.keys(errors).join(','),
      messages: messages.join('; '),
    });
    toast.error(
      messages.length > 0
        ? `Could not save container: ${messages.join(', ')}`
        : 'Could not save container: please fix the highlighted fields.'
    );
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit, handleInvalid)}
        className="space-y-6"
      >
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

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
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

'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ItemUpdateSchema,
  type ItemUpdate,
  type CategoryLibrary,
  formatCategoryLabel,
} from '@project/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Combobox } from '@/components/ui/combobox';
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
import { AttributesEditor } from './attributes-editor';
import { useInventory } from '@/hooks/use-inventory';
import { CroppedImageViewer } from './cropped-image-viewer';
import { BoundingBoxEditor } from './bounding-box-editor';
import { Crop } from 'lucide-react';

interface ItemUpdateFormProps {
  defaultValues?: Partial<ItemUpdate>;
  onSubmit: (
    data: Partial<Omit<ItemUpdate, 'UserRef'>>
  ) => void | Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
  categories?: CategoryLibrary;
}

export function ItemUpdateForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
  categories,
}: ItemUpdateFormProps) {
  const { getImageUrl } = useInventory();
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  // Create a form schema without UserRef since it's not part of the form
  const FormSchema = ItemUpdateSchema.omit({ UserRef: true });

  const form = useForm<z.input<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      itemLabel: '',
      itemName: '',
      itemNotes: '',
      categoryFunctional: '',
      categorySpecific: '',
      itemType: '',
      itemManufacturer: '',
      itemAttributes: [],
      primaryImage: undefined,
      primaryImageBbox: undefined,
      ...defaultValues,
    },
  });

  const primaryImageId = form.watch('primaryImage');
  const primaryImageBbox = form.watch('primaryImageBbox');
  const imageUrl = getImageUrl(primaryImageId);

  const handleSubmit = async (data: z.input<typeof FormSchema>) => {
    await onSubmit(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="itemName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Item Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g., DeWalt DCD771"
                  {...field}
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormDescription>
                Specific product identity (Brand, Model, etc.)
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="itemLabel"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Item Label</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g., Cordless Drill"
                  {...field}
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormDescription>
                A clear, descriptive tag for this specific item
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="itemNotes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Additional details about the item..."
                  {...field}
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormDescription>
                Any additional information or context
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="categoryFunctional"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Functional Category</FormLabel>
                <FormControl>
                  <Combobox
                    options={(categories?.functional || []).map((cat) => ({
                      label: formatCategoryLabel(cat),
                      value: cat,
                    }))}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="e.g., Tools"
                    disabled={isSubmitting}
                  />
                </FormControl>
                <FormDescription>Broad category</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="categorySpecific"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Specific Category</FormLabel>
                <FormControl>
                  <Combobox
                    options={(categories?.specific || []).map((cat) => ({
                      label: formatCategoryLabel(cat),
                      value: cat,
                    }))}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="e.g., Power Tools"
                    disabled={isSubmitting}
                  />
                </FormControl>
                <FormDescription>Subcategory</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="itemType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Item Type</FormLabel>
                <FormControl>
                  <Combobox
                    options={(categories?.itemType || []).map((cat) => ({
                      label: formatCategoryLabel(cat),
                      value: cat,
                    }))}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="e.g., Drill"
                    disabled={isSubmitting}
                  />
                </FormControl>
                <FormDescription>Specific type</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="itemManufacturer"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Manufacturer</FormLabel>
              <FormControl>
                <Input
                  placeholder="e.g., DeWalt"
                  {...field}
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormDescription>Brand or manufacturer name</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="itemAttributes"
          render={({ field }) => (
            <FormItem>
              <AttributesEditor
                attributes={field.value ?? []}
                onChange={field.onChange}
                disabled={isSubmitting}
              />
              <FormDescription>
                Add custom attributes like voltage, quantity, color, etc.
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
                  boundingBox={primaryImageBbox}
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
                        initialBox={primaryImageBbox}
                        onSave={(box) => {
                          form.setValue('primaryImageBbox', box, {
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
                  Define the area of the image that contains this item.
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
            {isSubmitting ? 'Updating...' : 'Update Item'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

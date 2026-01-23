'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ItemInputSchema,
  type ItemInput,
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
import { AttributesEditor } from './attributes-editor';

interface ItemCreateFormProps {
  defaultValues?: Partial<ItemInput>;
  onSubmit: (data: Partial<Omit<ItemInput, 'UserRef'>>) => void | Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
  categories?: CategoryLibrary;
}

export function ItemCreateForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
  categories,
}: ItemCreateFormProps) {
  // Create a form schema without UserRef since it's not part of the form
  const FormSchema = ItemInputSchema.omit({ UserRef: true });

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
      ...defaultValues,
    },
  });

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
              <FormLabel>Item Label *</FormLabel>
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
                <FormLabel>Functional Category *</FormLabel>
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
                <FormLabel>Specific Category *</FormLabel>
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
                <FormLabel>Item Type *</FormLabel>
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
            {isSubmitting ? 'Creating...' : 'Create Item'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ItemInputSchema, type ItemInput } from '@project/shared';
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
import { AttributesEditor } from './attributes-editor';

interface ItemFormProps {
  defaultValues?: Partial<ItemInput>;
  onSubmit: (data: ItemInput) => void | Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
}

export function ItemForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
}: ItemFormProps) {
  const form = useForm<z.input<typeof ItemInputSchema>>({
    resolver: zodResolver(ItemInputSchema),
    defaultValues: {
      item_label: '',
      item_notes: '',
      category_functional: '',
      category_specific: '',
      item_type: '',
      item_manufacturer: '',
      item_attributes: [],
      ...defaultValues,
    },
  });

  const handleSubmit = async (data: z.input<typeof ItemInputSchema>) => {
    // Parse and validate the data to ensure it matches the output type
    const validatedData = ItemInputSchema.parse(data);
    await onSubmit(validatedData);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="item_label"
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
                A clear, descriptive name for the item
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="item_notes"
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
            name="category_functional"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Functional Category *</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g., Tools"
                    {...field}
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
            name="category_specific"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Specific Category *</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g., Power Tools"
                    {...field}
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
            name="item_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Item Type *</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g., Drill"
                    {...field}
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
          name="item_manufacturer"
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
          name="item_attributes"
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
            {isSubmitting ? 'Saving...' : 'Save Item'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

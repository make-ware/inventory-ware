'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ContainerInputSchema, type ContainerInput } from '@project/shared';
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

interface ContainerFormProps {
  defaultValues?: Partial<ContainerInput>;
  onSubmit: (data: ContainerInput) => void | Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
}

export function ContainerForm({
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting,
}: ContainerFormProps) {
  const form = useForm<z.input<typeof ContainerInputSchema>>({
    resolver: zodResolver(ContainerInputSchema),
    defaultValues: {
      container_label: '',
      container_notes: '',
      ...defaultValues,
    },
  });

  const handleSubmit = async (data: z.input<typeof ContainerInputSchema>) => {
    // Parse and validate the data to ensure it matches the output type
    const validatedData = ContainerInputSchema.parse(data);
    await onSubmit(validatedData);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="container_label"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Container Label *</FormLabel>
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
          name="container_notes"
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
            {isSubmitting ? 'Saving...' : 'Save Container'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

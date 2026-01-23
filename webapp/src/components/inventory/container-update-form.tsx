'use client';

import { useForm } from 'react-hook-form';
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
  // Create a form schema without UserRef since it's not part of the form
  const FormSchema = ContainerUpdateSchema.omit({ UserRef: true });

  const form = useForm<z.input<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      containerLabel: '',
      containerNotes: '',
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

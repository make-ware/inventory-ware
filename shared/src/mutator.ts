// PocketBase mutator functions for data manipulation
import { z } from 'zod';
import type { RecordModel } from 'pocketbase';

/**
 * Generic mutator function type
 */
export type Mutator<TInput, TOutput> = (input: TInput) => TOutput;

/**
 * Creates a mutator that validates input with a Zod schema
 */
export function createValidatedMutator<TInput, TOutput>(
  schema: z.ZodSchema<TInput>,
  mutator: Mutator<TInput, TOutput>
): Mutator<unknown, TOutput> {
  return (input: unknown) => {
    const validatedInput = schema.parse(input);
    return mutator(validatedInput);
  };
}

/**
 * Mutator to transform PocketBase record to clean object
 */
export function recordToObject<T extends RecordModel>(
  record: T
): Omit<T, keyof RecordModel> & {
  id: string;
  created: string;
  updated: string;
} {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { collectionId, collectionName, expand, ...cleanRecord } = record;
  return cleanRecord as Omit<T, keyof RecordModel> & {
    id: string;
    created: string;
    updated: string;
  };
}

/**
 * Mutator to prepare data for PocketBase create/update
 */
export function prepareForPocketBase<T extends Record<string, unknown>>(
  data: T
): Omit<T, 'id' | 'created' | 'updated'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, created, updated, ...cleanData } = data;
  return cleanData;
}

/**
 * Mutator to transform form data to API format
 */
export function formToApiData<T>(formData: T): T {
  // Add any form-specific transformations here
  return formData;
}

/**
 * Mutator to transform API data to form format
 */
export function apiToFormData<T>(apiData: T): T {
  // Add any API-specific transformations here
  return apiData;
}

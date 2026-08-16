import type { ListResult } from 'pocketbase';
import {
  type Container,
  type ContainerInput,
  ContainerInputSchema,
} from '../index';
import type { TypedPocketBase } from '../types';
import { allOf, anyOf, eq } from '../utils/filter';
import { BaseMutator, type ListQuery, TypedRecordService } from './base';

export interface ContainerSearchFilters {
  image?: string;
}

/** A paged query plus the container-specific filters. */
export type ContainerListQuery = ListQuery & {
  filters?: ContainerSearchFilters;
};

/** Fields `search()` matches a free-text query against. */
export const CONTAINER_SEARCH_FIELDS = [
  'containerLabel',
  'containerNotes',
] as const;

export class ContainerMutator extends BaseMutator<Container, ContainerInput> {
  constructor(pb: TypedPocketBase) {
    super(pb);
  }

  protected getCollection(): TypedRecordService<Container, ContainerInput> {
    return this.pb.collection('Containers') as unknown as TypedRecordService<
      Container,
      ContainerInput
    >;
  }

  protected async validateInput(
    input: ContainerInput
  ): Promise<ContainerInput> {
    // Validate the input using the schema
    return ContainerInputSchema.parse(input);
  }

  // Note: ContainerImages mapping is now handled by PocketBase hooks in pb_hooks/main.pb.js

  /**
   * Update a container
   * @param id The container ID
   * @param input Partial container input (UserRef is omitted as it cannot be changed)
   * @returns Updated Container record
   */
  async update(
    id: string,
    input: Partial<Omit<ContainerInput, 'UserRef'>>
  ): Promise<Container> {
    try {
      // UserRef should never be updated, so we ensure it's not included
      return await super.update(id, input);
    } catch (error) {
      return this.errorWrapper(error);
    }
  }

  /**
   * Build the filter expression `search()` uses.
   */
  buildSearchFilter(
    query: string,
    filters?: ContainerSearchFilters
  ): string | undefined {
    const parts: string[] = [];

    // An empty query must not produce `containerLabel~""`, which matches
    // everything - omit the text clause entirely instead.
    if (query && query.trim()) {
      parts.push(anyOf(CONTAINER_SEARCH_FIELDS, query));
    }
    if (filters?.image) {
      parts.push(eq('ImageRef', filters.image));
    }

    return allOf(parts);
  }

  /**
   * Search for containers by free-text query and filters.
   *
   * @param query Text matched against label and notes
   * @param options Filters plus the standard page/perPage/sort/expand
   * @returns A paged result, so callers can see the true total
   */
  async search(
    query: string,
    options: ContainerListQuery = {}
  ): Promise<ListResult<Container>> {
    try {
      const { filters, ...list } = options;
      return await this.getList({
        ...list,
        filter: this.buildSearchFilter(query, filters),
      });
    } catch (error) {
      return this.errorWrapper(error);
    }
  }
}

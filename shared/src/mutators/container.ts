import { RecordService } from 'pocketbase';
import {
  type Container,
  type ContainerInput,
  ContainerInputSchema,
} from '../index';
import type { TypedPocketBase } from '../types';
import { BaseMutator } from './base';

export class ContainerMutator extends BaseMutator<Container, ContainerInput> {
  constructor(pb: TypedPocketBase) {
    super(pb);
  }

  protected getCollection(): RecordService<Container> {
    return this.pb.collection('Containers');
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
   * Search for containers by query
   * @param query Search query to match against label and notes
   * @param expand Optional relation fields to expand (e.g., 'ImageRef')
   * @returns Array of matching Container records
   */
  async search(
    query: string,
    expand?: string | string[],
    sort?: string
  ): Promise<Container[]> {
    try {
      const escapedQuery = query.replace(/"/g, '\\"');
      const filter = `(containerLabel~"${escapedQuery}" || containerNotes~"${escapedQuery}")`;

      const result = await this.getList(1, 500, filter, sort, expand);
      return result.items;
    } catch (error) {
      return this.errorWrapper(error);
    }
  }
}

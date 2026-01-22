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

  /**
   * Create a new container and record the initial image mapping
   */
  async create(input: ContainerInput): Promise<Container> {
    try {
      // Set the user to the currently authenticated user
      const userId = this.pb.authStore.record?.id;
      const inputWithUser = { ...input, User: userId };
      const record = await super.create(inputWithUser);

      // Record the initial mapping if primary_image is provided
      if (record && input.primary_image) {
        await this.pb.collection('ContainerImageMappings').create({
          container: record.id,
          image: input.primary_image,
          bounding_box: input.primary_image_bbox,
        });
      }

      return record;
    } catch (error) {
      return this.errorWrapper(error);
    }
  }

  /**
   * Update a container and record the old image if changed
   */
  async update(id: string, input: Partial<ContainerInput>): Promise<Container> {
    try {
      // Get the current record to check if primary_image is changing
      const current = await this.getById(id);

      // If primary_image is being updated and it's different from current
      if (
        current &&
        input.primary_image &&
        current.primary_image &&
        input.primary_image !== current.primary_image
      ) {
        // Record the historical mapping
        await this.pb.collection('ContainerImageMappings').create({
          container: id,
          image: current.primary_image,
          bounding_box: current.primary_image_bbox,
        });
      }

      return await super.update(id, input);
    } catch (error) {
      return this.errorWrapper(error);
    }
  }

  /**
   * Search for containers by query
   * @param query Search query to match against label and notes
   * @returns Array of matching Container records
   */
  async search(query: string): Promise<Container[]> {
    try {
      const escapedQuery = query.replace(/"/g, '\\"');
      const filter = `(container_label~"${escapedQuery}" || container_notes~"${escapedQuery}")`;

      const result = await this.getList(1, 500, filter);
      return result.items;
    } catch (error) {
      return this.errorWrapper(error);
    }
  }
}

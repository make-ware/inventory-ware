import { RecordService } from 'pocketbase';
import { type User, type UserInput, UserInputSchema } from '../index';
import type { TypedPocketBase } from '../types';
import { BaseMutator } from './base';

export class UserMutator extends BaseMutator<User, UserInput> {
  constructor(pb: TypedPocketBase) {
    super(pb);
  }

  protected getCollection(): RecordService<User> {
    return this.pb.collection('Users');
  }

  protected async validateInput(input: UserInput): Promise<UserInput> {
    // Validate the input using the schema
    return UserInputSchema.parse(input);
  }

  /**
   * Override entityCreate to include passwordConfirm for PocketBase auth collections
   * PocketBase requires passwordConfirm when creating auth records
   */
  protected async entityCreate(data: UserInput): Promise<User> {
    // Include passwordConfirm if present (required by PocketBase for auth collections)
    const createData = { ...data } as Record<string, unknown>;
    return await this.getCollection().create(createData);
  }
}

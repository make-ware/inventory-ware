import { type User, type UserInput, UserInputSchema } from '../index';
import type { TypedPocketBase } from '../types';
import { BaseMutator, TypedRecordService } from './base';

export class UserMutator extends BaseMutator<User, UserInput> {
  constructor(pb: TypedPocketBase) {
    super(pb);
  }

  protected getCollection(): TypedRecordService<User, UserInput> {
    return this.pb.collection('Users') as unknown as TypedRecordService<
      User,
      UserInput
    >;
  }

  protected async validateInput(input: UserInput): Promise<UserInput> {
    // Validate the input using the schema
    const data = UserInputSchema.parse(input);

    // Explicitly check password confirmation since UserInputSchema doesn't include the refinement
    if (data.password !== data.passwordConfirm) {
      throw new Error("Passwords don't match");
    }

    return data;
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

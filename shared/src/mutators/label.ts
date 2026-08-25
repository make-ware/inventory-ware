import type { ListResult } from 'pocketbase';
import { type Label, type LabelInput, LabelInputSchema } from '../index';
import type { TypedPocketBase } from '../types';
import { eq } from '../utils/filter';
import { BaseMutator, type ListQuery, TypedRecordService } from './base';

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 15;

/**
 * Generate a PocketBase-compatible record id (15 chars of [a-z0-9]).
 *
 * The Labels collection forbids updates, so a caller that embeds the record id
 * in the stored `data` (the printed "Label ID") must generate the id first,
 * render, and create the record with the id supplied explicitly.
 */
export function generateLabelId(): string {
  const bytes = new Uint8Array(ID_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  let id = '';
  for (const byte of bytes) {
    id += ID_ALPHABET[byte % ID_ALPHABET.length];
  }
  return id;
}

/**
 * Mutator for the Labels collection.
 *
 * Labels are immutable (updateRule/deleteRule are null): never call `update`,
 * `delete`, or `upsert` here — `upsert` in particular would route an input
 * carrying an explicit `id` to `update()`, which PocketBase rejects. Create
 * with an explicit id via `create()` instead.
 */
export class LabelMutator extends BaseMutator<Label, LabelInput> {
  constructor(pb: TypedPocketBase) {
    super(pb);
  }

  protected getCollection(): TypedRecordService<Label, LabelInput> {
    return this.pb.collection('Labels') as unknown as TypedRecordService<
      Label,
      LabelInput
    >;
  }

  protected async validateInput(input: LabelInput): Promise<LabelInput> {
    return LabelInputSchema.parse(input);
  }

  /**
   * List the labels generated for one item or container, newest first.
   */
  async listForTarget(
    targetType: 'item' | 'container',
    targetId: string,
    query: ListQuery = {}
  ): Promise<ListResult<Label>> {
    const field = targetType === 'item' ? 'ItemRef' : 'ContainerRef';
    const extraFilter =
      query.filter === undefined
        ? []
        : Array.isArray(query.filter)
          ? query.filter
          : [query.filter];
    return await this.getList({
      sort: '-created',
      ...query,
      filter: [eq(field, targetId), ...extraFilter],
    });
  }
}

import { z } from 'zod';

/**
 * PocketBase returns `null` for an unset `json` column (e.g. `boundingBox`,
 * `itemAttributes`). Zod's `.optional()` only accepts `undefined`, so a record
 * read back from PocketBase fails validation when it is fed into an update or
 * create schema (see issue #57 — the edit forms silently refused to submit).
 *
 * Accept `null` on the way in and normalise it to `undefined` on the way out,
 * so the parsed output type is unchanged.
 *
 * `.optional()` is kept outermost deliberately: it guarantees the key stays
 * optional in both `z.input` and `z.output`, regardless of how Zod propagates
 * optionality through the wrapping `ZodPipe`.
 */
export function pbOptional<T extends z.ZodType>(schema: T) {
  return schema
    .nullable()
    .transform((v) => v ?? undefined)
    .optional();
}

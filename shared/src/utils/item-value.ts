/**
 * The two monetary fields on an Item, and the one place the fallback between
 * them is spelled out.
 *
 * `itemValue` is authoritative: only a human ever writes it, from the create
 * and update forms or the CLI's `--item-value`. `estimatedValue` is a
 * suggestion: AI image analysis writes it whenever `AI_ESTIMATE_VALUE` is on,
 * and may overwrite it on every re-analysis, so it is fuzzy by construction.
 * A user can still type into it directly to record a rough number without
 * promoting it to authoritative.
 */

/**
 * PocketBase has no "unset" for a number column. An item created without a
 * value reads back as `0` — not `null`, not a missing key (verified against a
 * running server). So `0` is what "no value recorded" looks like coming out,
 * and writing `0` is how a value is cleared.
 *
 * The consequence for callers: never test these fields against `undefined`.
 * That is only ever true of a record built locally, never of one PocketBase
 * returned, so an `!== undefined` check reads as "always has a value" and
 * renders `$0` for every item that has none.
 */
export function hasItemValue(
  value: number | null | undefined
): value is number {
  return value !== null && value !== undefined && value !== 0;
}

/** The subset of an Item this module needs — so callers can pass a whole record. */
export interface ItemValueFields {
  itemValue?: number | null;
  estimatedValue?: number | null;
}

/**
 * The value to display for an item: the authoritative number the user entered,
 * falling back to the AI's estimate, or `null` when neither is recorded.
 *
 * Every caller goes through this rather than re-spelling the `??` chain, so
 * the detail page and any future totals cannot drift apart on what an item is
 * "worth" — and so the `0`-means-unset rule above is applied in exactly one
 * place.
 */
export function getEffectiveItemValue(item: ItemValueFields): number | null {
  if (hasItemValue(item.itemValue)) return item.itemValue;
  if (hasItemValue(item.estimatedValue)) return item.estimatedValue;
  return null;
}

/**
 * Whether the "accept this estimate" affordance applies: there is an estimate
 * to promote and no authoritative value it would overwrite.
 */
export function canAcceptEstimate(item: ItemValueFields): boolean {
  return !hasItemValue(item.itemValue) && hasItemValue(item.estimatedValue);
}

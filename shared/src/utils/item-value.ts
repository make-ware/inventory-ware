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

/**
 * ISO 4217 code validation, shared with the zod schemas in
 * `shared/src/schema/item.ts` — the repo's validation style is a regex with a
 * message (see `shared/src/schema/label.ts`), so no allowlist enum here.
 */
export const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

/** The currency every value falls back to when the item carries none. */
export const DEFAULT_CURRENCY = 'USD';

/**
 * The ~10 codes the item forms offer in the currency picker. Anything matching
 * `CURRENCY_CODE_PATTERN` is still accepted on write (CLI, API) — it just is
 * not in the picker.
 */
export const COMMON_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CAD',
  'AUD',
  'CHF',
  'CNY',
  'SEK',
  'NZD',
] as const;

/** The subset of an Item this module needs — so callers can pass a whole record. */
export interface ItemValueFields {
  itemValue?: number | null;
  estimatedValue?: number | null;
  valueCurrency?: string | null;
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

/**
 * The currency to display an item's values in. One currency is shared by both
 * value fields — it is a display concern only, never part of the fallback
 * between them. Anything that is not a three-letter uppercase code (absent,
 * `null`, `""` from a pre-migration row, lowercase) resolves to USD.
 */
export function resolveItemCurrency(item: {
  valueCurrency?: string | null;
}): string {
  const code = item.valueCurrency;
  if (typeof code === 'string' && CURRENCY_CODE_PATTERN.test(code)) return code;
  return DEFAULT_CURRENCY;
}

/**
 * The one place numbers become money strings: `Intl.NumberFormat` with
 * currency, so the detail page, cards and any future totals cannot drift
 * apart on formatting. `null`/`undefined` renders as an em dash (no value
 * recorded), matching the old detail-page behaviour. An unknown-but-valid
 * code falls back to USD rather than throwing — `Intl` rejects codes it does
 * not know (e.g. `ZZZ`), and display must never crash on stored data.
 */
export function formatItemValue(
  value: number | null | undefined,
  currency: string = DEFAULT_CURRENCY
): string {
  if (value === null || value === undefined) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: DEFAULT_CURRENCY,
    }).format(value);
  }
}

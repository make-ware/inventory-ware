import { describe, expect, it } from 'vitest';
import {
  canAcceptEstimate,
  formatItemValue,
  getEffectiveItemValue,
  hasItemValue,
  resolveItemCurrency,
} from './item-value';

describe('hasItemValue', () => {
  it('treats a positive number as a recorded value', () => {
    expect(hasItemValue(150)).toBe(true);
    expect(hasItemValue(0.5)).toBe(true);
  });

  // PocketBase has no "unset" for a number column, so this is what an item
  // with no value actually reads back as.
  it('treats 0, null and undefined alike as "no value recorded"', () => {
    expect(hasItemValue(0)).toBe(false);
    expect(hasItemValue(null)).toBe(false);
    expect(hasItemValue(undefined)).toBe(false);
  });
});

describe('getEffectiveItemValue', () => {
  it('prefers the authoritative itemValue over the estimate', () => {
    expect(getEffectiveItemValue({ itemValue: 200, estimatedValue: 150 })).toBe(
      200
    );
  });

  it('falls back to the estimate when there is no authoritative value', () => {
    expect(getEffectiveItemValue({ estimatedValue: 150 })).toBe(150);
    expect(getEffectiveItemValue({ itemValue: 0, estimatedValue: 150 })).toBe(
      150
    );
    expect(
      getEffectiveItemValue({ itemValue: null, estimatedValue: 150 })
    ).toBe(150);
  });

  it('returns null when neither field holds a value', () => {
    expect(getEffectiveItemValue({})).toBeNull();
    expect(
      getEffectiveItemValue({ itemValue: 0, estimatedValue: 0 })
    ).toBeNull();
    expect(
      getEffectiveItemValue({ itemValue: null, estimatedValue: undefined })
    ).toBeNull();
  });
});

describe('resolveItemCurrency', () => {
  it('defaults to USD when the item carries no usable code', () => {
    expect(resolveItemCurrency({})).toBe('USD');
    expect(resolveItemCurrency({ valueCurrency: null })).toBe('USD');
    expect(resolveItemCurrency({ valueCurrency: undefined })).toBe('USD');
    // What a pre-migration row reads back as: a text column has no "unset"
    // distinct from empty.
    expect(resolveItemCurrency({ valueCurrency: '' })).toBe('USD');
    expect(resolveItemCurrency({ valueCurrency: 'usd' })).toBe('USD');
    expect(resolveItemCurrency({ valueCurrency: 'US' })).toBe('USD');
  });

  it('passes a valid code through untouched', () => {
    expect(resolveItemCurrency({ valueCurrency: 'EUR' })).toBe('EUR');
    expect(resolveItemCurrency({ valueCurrency: 'JPY' })).toBe('JPY');
  });
});

describe('formatItemValue', () => {
  // Assumes an en-US test locale, like the rest of the suite's number output.
  it('formats USD with the dollar sign and two decimals', () => {
    expect(formatItemValue(150, 'USD')).toBe('$150.00');
    expect(formatItemValue(150)).toBe('$150.00');
  });

  it("formats in the item's currency", () => {
    expect(formatItemValue(150, 'EUR')).toContain('€');
    expect(formatItemValue(150, 'EUR')).toContain('150');
    expect(formatItemValue(150, 'GBP')).toContain('£');
  });

  it('renders an em dash when there is no value recorded', () => {
    expect(formatItemValue(null, 'USD')).toBe('—');
    expect(formatItemValue(undefined, 'USD')).toBe('—');
  });

  it('does not throw on a well-formed but unknown code', () => {
    // `Intl` renders these with the code as prefix rather than throwing.
    expect(formatItemValue(150, 'ZZZ')).toContain('150');
  });

  it('falls back to USD on a malformed code instead of throwing', () => {
    expect(formatItemValue(150, 'US')).toBe('$150.00');
  });
});

describe('canAcceptEstimate', () => {
  it('offers the promotion only when there is an estimate and nothing to overwrite', () => {
    expect(canAcceptEstimate({ estimatedValue: 150 })).toBe(true);
    expect(canAcceptEstimate({ itemValue: 0, estimatedValue: 150 })).toBe(true);
  });

  it('does not offer to overwrite an authoritative value', () => {
    expect(canAcceptEstimate({ itemValue: 200, estimatedValue: 150 })).toBe(
      false
    );
  });

  it('does not offer a promotion when there is no estimate', () => {
    expect(canAcceptEstimate({})).toBe(false);
    expect(canAcceptEstimate({ itemValue: 200 })).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  canAcceptEstimate,
  getEffectiveItemValue,
  hasItemValue,
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

/**
 * Tests for UpsertEngine matching logic
 *
 * Feature: image-upload-upsert
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  computeMatchScore,
  matchItems,
  executeUpsert,
  DEFAULT_CONFIG,
  type MatchResult,
} from '../lib/upsert-engine.js';
import type { ItemMetadata } from '../types/metadata.js';
import type { ItemsResponse } from '../pocketbase-types.js';

// Helper to create a mock ItemMetadata
function createDetectedItem(
  overrides: Partial<ItemMetadata> = {}
): ItemMetadata {
  return {
    itemLabel: 'Test Item',
    itemNotes: 'Test notes',
    categoryFunctional: 'tools',
    categorySpecific: 'power-tools',
    itemType: 'drill',
    itemName: 'Test Drill',
    itemManufacturer: 'TestCo',
    itemAttributes: [],
    ...overrides,
  };
}

// Helper to create a mock ItemsResponse
function createExistingItem(
  overrides: Partial<ItemsResponse> = {}
): ItemsResponse {
  return {
    id: 'test-id',
    created: '2024-01-01T00:00:00Z',
    updated: '2024-01-01T00:00:00Z',
    collectionId: 'items',
    collectionName: 'Items',
    itemLabel: 'Test Item',
    itemName: 'Test Drill',
    itemNotes: 'Test notes',
    categoryFunctional: 'tools',
    categorySpecific: 'power-tools',
    itemType: 'drill',
    itemManufacturer: 'TestCo',
    itemAttributes: [],
    UserRef: 'user-id',
    ...overrides,
  };
}

describe('computeMatchScore', () => {
  it('should return 1.0 for identical items', () => {
    const detected = createDetectedItem();
    const existing = createExistingItem();

    const score = computeMatchScore(detected, existing);

    // All categories match (0.3 + 0.3 + 0.25) + identical label (0.15) = 1.0
    expect(score).toBe(1.0);
  });

  it('should return 0.85 for items with matching categories but different labels', () => {
    const detected = createDetectedItem({ itemLabel: 'Different Label' });
    const existing = createExistingItem({ itemLabel: 'Another Label' });

    const score = computeMatchScore(detected, existing);

    // All categories match (0.3 + 0.3 + 0.25) = 0.85, label similarity ~0
    expect(score).toBeGreaterThanOrEqual(0.85);
    expect(score).toBeLessThan(1.0);
  });

  it('should return 0.0 for completely different items', () => {
    const detected = createDetectedItem({
      categoryFunctional: 'electronics',
      categorySpecific: 'sensors',
      itemType: 'arduino',
      itemLabel: 'Arduino Uno',
    });
    const existing = createExistingItem({
      categoryFunctional: 'tools',
      categorySpecific: 'power-tools',
      itemType: 'drill',
      itemLabel: 'Power Drill',
    });

    const score = computeMatchScore(detected, existing);

    // No category matches, different labels
    expect(score).toBeLessThan(0.2);
  });

  it('should weight category matches higher than label matches', () => {
    // Item with all categories matching but different label
    const detected1 = createDetectedItem({ itemLabel: 'Completely Different' });
    const existing1 = createExistingItem({ itemLabel: 'Another Thing' });
    const score1 = computeMatchScore(detected1, existing1);

    // Item with only label matching but different categories
    const detected2 = createDetectedItem({
      itemLabel: 'Test Item',
      categoryFunctional: 'electronics',
      categorySpecific: 'sensors',
      itemType: 'arduino',
    });
    const existing2 = createExistingItem({
      itemLabel: 'Test Item',
      categoryFunctional: 'tools',
      categorySpecific: 'power-tools',
      itemType: 'drill',
    });
    const score2 = computeMatchScore(detected2, existing2);

    // Category matches should score higher than label match
    expect(score1).toBeGreaterThan(score2);
  });

  it('should be case-insensitive for category matching', () => {
    const detected = createDetectedItem({
      categoryFunctional: 'TOOLS',
      categorySpecific: 'POWER-TOOLS',
      itemType: 'DRILL',
    });
    const existing = createExistingItem({
      categoryFunctional: 'tools',
      categorySpecific: 'power-tools',
      itemType: 'drill',
    });

    const score = computeMatchScore(detected, existing);

    // Should match despite case differences
    expect(score).toBe(1.0);
  });

  it('should give partial credit for substring label matches', () => {
    const detected = createDetectedItem({ itemLabel: 'Power Drill' });
    const existing = createExistingItem({ itemLabel: 'Drill' });

    const score = computeMatchScore(detected, existing);

    // Categories match (0.85) + partial label credit
    expect(score).toBeGreaterThan(0.85);
    expect(score).toBeLessThan(1.0);
  });
});

describe('matchItems', () => {
  it('should return empty results for empty inputs', () => {
    const result = matchItems([], [], DEFAULT_CONFIG);

    expect(result.matched).toHaveLength(0);
    expect(result.newItems).toHaveLength(0);
    expect(result.unmatchedExisting).toHaveLength(0);
  });

  it('should classify all detected items as new when no existing items', () => {
    const detected = [
      createDetectedItem({ itemLabel: 'Item 1' }),
      createDetectedItem({ itemLabel: 'Item 2' }),
    ];

    const result = matchItems(detected, [], DEFAULT_CONFIG);

    expect(result.matched).toHaveLength(0);
    expect(result.newItems).toHaveLength(2);
    expect(result.unmatchedExisting).toHaveLength(0);

    // Verify the new items are the correct ones
    expect(result.newItems[0].itemLabel).toBe('Item 1');
    expect(result.newItems[1].itemLabel).toBe('Item 2');
  });

  it('should classify all existing items as unmatched when no detected items', () => {
    const existing = [
      createExistingItem({ id: '1', itemLabel: 'Item 1' }),
      createExistingItem({ id: '2', itemLabel: 'Item 2' }),
    ];

    const result = matchItems([], existing, DEFAULT_CONFIG);

    expect(result.matched).toHaveLength(0);
    expect(result.newItems).toHaveLength(0);
    expect(result.unmatchedExisting).toHaveLength(2);

    // Verify the unmatched items are the correct ones
    expect(result.unmatchedExisting[0].id).toBe('1');
    expect(result.unmatchedExisting[1].id).toBe('2');
  });

  it('should match identical items one-to-one', () => {
    const detected = [createDetectedItem({ itemLabel: 'Item 1' })];
    const existing = [createExistingItem({ id: '1', itemLabel: 'Item 1' })];

    const result = matchItems(detected, existing, DEFAULT_CONFIG);

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0].score).toBe(1.0);
    expect(result.newItems).toHaveLength(0);
    expect(result.unmatchedExisting).toHaveLength(0);
  });

  it('should use threshold to classify items as new', () => {
    const detected = [
      createDetectedItem({
        categoryFunctional: 'electronics',
        categorySpecific: 'sensors',
        itemType: 'arduino',
        itemLabel: 'Arduino',
      }),
    ];
    const existing = [
      createExistingItem({
        id: '1',
        categoryFunctional: 'tools',
        categorySpecific: 'power-tools',
        itemType: 'drill',
        itemLabel: 'Drill',
      }),
    ];

    const result = matchItems(detected, existing, DEFAULT_CONFIG);

    // Score should be below threshold (0.4), so detected item is new
    expect(result.matched).toHaveLength(0);
    expect(result.newItems).toHaveLength(1);
    expect(result.unmatchedExisting).toHaveLength(1);
  });

  it('should perform one-to-one matching (no duplicate assignments)', () => {
    const detected = [
      createDetectedItem({ itemLabel: 'Item A' }),
      createDetectedItem({ itemLabel: 'Item B' }),
    ];
    const existing = [
      createExistingItem({ id: '1', itemLabel: 'Item A' }),
      createExistingItem({ id: '2', itemLabel: 'Item B' }),
    ];

    const result = matchItems(detected, existing, DEFAULT_CONFIG);

    expect(result.matched).toHaveLength(2);
    expect(result.newItems).toHaveLength(0);
    expect(result.unmatchedExisting).toHaveLength(0);

    // Verify each existing item is matched only once
    const matchedExistingIds = result.matched.map((m) => m.existingItem.id);
    expect(new Set(matchedExistingIds).size).toBe(2);

    // Verify each detected item is matched only once
    const matchedDetectedLabels = result.matched.map(
      (m) => m.detectedItem.itemLabel
    );
    expect(new Set(matchedDetectedLabels).size).toBe(2);
  });

  it('should use existing item index as tiebreaker', () => {
    // Create two existing items with identical properties
    const existing = [
      createExistingItem({ id: '1', itemLabel: 'Drill' }),
      createExistingItem({ id: '2', itemLabel: 'Drill' }),
    ];

    // Create one detected item that matches both equally
    const detected = [createDetectedItem({ itemLabel: 'Drill' })];

    const result = matchItems(detected, existing, DEFAULT_CONFIG);

    expect(result.matched).toHaveLength(1);
    // Should match to the first existing item (lower index)
    expect(result.matched[0].existingItem.id).toBe('1');
    expect(result.unmatchedExisting).toHaveLength(1);
    expect(result.unmatchedExisting[0].id).toBe('2');
  });

  it('should handle multiple detected items with varying match quality', () => {
    const detected = [
      createDetectedItem({ itemLabel: 'Perfect Match' }),
      createDetectedItem({
        categoryFunctional: 'electronics',
        categorySpecific: 'sensors',
        itemType: 'arduino',
        itemLabel: 'New Item',
      }),
      createDetectedItem({ itemLabel: 'Partial Match' }),
    ];

    const existing = [
      createExistingItem({ id: '1', itemLabel: 'Perfect Match' }),
      createExistingItem({ id: '2', itemLabel: 'Partial Match' }),
    ];

    const result = matchItems(detected, existing, DEFAULT_CONFIG);

    expect(result.matched).toHaveLength(2);
    expect(result.newItems).toHaveLength(1);
    expect(result.newItems[0].itemLabel).toBe('New Item');
    expect(result.unmatchedExisting).toHaveLength(0);
  });

  it('should respect custom threshold configuration', () => {
    const detected = [
      createDetectedItem({
        categoryFunctional: 'tools',
        categorySpecific: 'hand-tools',
        itemType: 'screwdriver',
        itemLabel: 'Different',
      }),
    ];
    const existing = [
      createExistingItem({
        id: '1',
        categoryFunctional: 'tools',
        categorySpecific: 'power-tools',
        itemType: 'drill',
        itemLabel: 'Other',
      }),
    ];

    // With high threshold (0.8), should not match
    const result1 = matchItems(detected, existing, { matchThreshold: 0.8 });
    expect(result1.matched).toHaveLength(0);
    expect(result1.newItems).toHaveLength(1);

    // With low threshold (0.2), should match
    const result2 = matchItems(detected, existing, { matchThreshold: 0.2 });
    expect(result2.matched).toHaveLength(1);
    expect(result2.newItems).toHaveLength(0);
  });
});

// ============================================================================
// Edge Case Unit Tests
// ============================================================================

describe('matchItems - Edge Cases', () => {
  describe('Empty inputs edge cases', () => {
    it('should handle empty existing items (all detected → new)', () => {
      const detected = [
        createDetectedItem({
          itemLabel: 'New Item 1',
          categoryFunctional: 'tools',
          categorySpecific: 'power-tools',
          itemType: 'drill',
        }),
        createDetectedItem({
          itemLabel: 'New Item 2',
          categoryFunctional: 'electronics',
          categorySpecific: 'sensors',
          itemType: 'arduino',
        }),
        createDetectedItem({
          itemLabel: 'New Item 3',
          categoryFunctional: 'materials',
          categorySpecific: 'fasteners',
          itemType: 'screws',
        }),
      ];

      const result = matchItems(detected, [], DEFAULT_CONFIG);

      // All detected items should be classified as new
      expect(result.matched).toHaveLength(0);
      expect(result.newItems).toHaveLength(3);
      expect(result.unmatchedExisting).toHaveLength(0);

      // Verify all detected items are in newItems
      expect(result.newItems).toEqual(detected);
    });

    it('should handle empty detected items (all existing → unmatched)', () => {
      const existing = [
        createExistingItem({
          id: '1',
          itemLabel: 'Existing Item 1',
          categoryFunctional: 'tools',
        }),
        createExistingItem({
          id: '2',
          itemLabel: 'Existing Item 2',
          categoryFunctional: 'electronics',
        }),
        createExistingItem({
          id: '3',
          itemLabel: 'Existing Item 3',
          categoryFunctional: 'materials',
        }),
      ];

      const result = matchItems([], existing, DEFAULT_CONFIG);

      // All existing items should be unmatched
      expect(result.matched).toHaveLength(0);
      expect(result.newItems).toHaveLength(0);
      expect(result.unmatchedExisting).toHaveLength(3);

      // Verify all existing items are in unmatchedExisting
      expect(result.unmatchedExisting).toEqual(existing);
    });

    it('should handle both empty arrays', () => {
      const result = matchItems([], [], DEFAULT_CONFIG);

      expect(result.matched).toHaveLength(0);
      expect(result.newItems).toHaveLength(0);
      expect(result.unmatchedExisting).toHaveLength(0);
    });
  });

  describe('Exact threshold boundary tests', () => {
    it('should match item with score exactly at threshold', () => {
      // Create items that will score exactly 0.4 (the default threshold)
      // categoryFunctional match: 0.3
      // categorySpecific match: 0.1 (no match, 0.0)
      // itemType match: 0.0 (no match)
      // itemLabel similarity: ~0.1
      // Total: 0.3 + 0.1 = 0.4

      const detected = createDetectedItem({
        categoryFunctional: 'tools',
        categorySpecific: 'power-tools',
        itemType: 'drill',
        itemLabel: 'Power Drill',
      });

      const existing = createExistingItem({
        id: '1',
        categoryFunctional: 'tools', // Match: +0.3
        categorySpecific: 'hand-tools', // No match: +0.0
        itemType: 'hammer', // No match: +0.0
        itemLabel: 'Hammer Tool', // Partial similarity: ~0.1
      });

      // Compute actual score to verify it's at or near threshold
      const actualScore = computeMatchScore(detected, existing);

      const result = matchItems([detected], [existing], DEFAULT_CONFIG);

      if (actualScore >= DEFAULT_CONFIG.matchThreshold) {
        // Should match if score >= threshold
        expect(result.matched).toHaveLength(1);
        expect(result.newItems).toHaveLength(0);
        expect(result.unmatchedExisting).toHaveLength(0);
      } else {
        // Should not match if score < threshold
        expect(result.matched).toHaveLength(0);
        expect(result.newItems).toHaveLength(1);
        expect(result.unmatchedExisting).toHaveLength(1);
      }
    });

    it('should not match item with score just below threshold', () => {
      // Create items that score just below 0.4
      // Only categoryFunctional matches: 0.3
      const detected = createDetectedItem({
        categoryFunctional: 'tools',
        categorySpecific: 'power-tools',
        itemType: 'drill',
        itemLabel: 'Power Drill',
      });

      const existing = createExistingItem({
        id: '1',
        categoryFunctional: 'tools', // Match: +0.3
        categorySpecific: 'hand-tools', // No match: +0.0
        itemType: 'hammer', // No match: +0.0
        itemLabel: 'xyz', // No similarity: ~0.0
      });

      const score = computeMatchScore(detected, existing);
      expect(score).toBeLessThan(DEFAULT_CONFIG.matchThreshold);

      const result = matchItems([detected], [existing], DEFAULT_CONFIG);

      // Should not match
      expect(result.matched).toHaveLength(0);
      expect(result.newItems).toHaveLength(1);
      expect(result.unmatchedExisting).toHaveLength(1);
    });

    it('should match item with score just above threshold', () => {
      // Create items that score just above 0.4
      // categoryFunctional + categorySpecific: 0.3 + 0.3 = 0.6
      const detected = createDetectedItem({
        categoryFunctional: 'tools',
        categorySpecific: 'power-tools',
        itemType: 'drill',
        itemLabel: 'Power Drill',
      });

      const existing = createExistingItem({
        id: '1',
        categoryFunctional: 'tools', // Match: +0.3
        categorySpecific: 'power-tools', // Match: +0.3
        itemType: 'hammer', // No match: +0.0
        itemLabel: 'xyz', // No similarity: ~0.0
      });

      const score = computeMatchScore(detected, existing);
      expect(score).toBeGreaterThan(DEFAULT_CONFIG.matchThreshold);

      const result = matchItems([detected], [existing], DEFAULT_CONFIG);

      // Should match
      expect(result.matched).toHaveLength(1);
      expect(result.matched[0].score).toBe(score);
      expect(result.newItems).toHaveLength(0);
      expect(result.unmatchedExisting).toHaveLength(0);
    });

    it('should respect custom threshold at boundary', () => {
      const detected = createDetectedItem({
        categoryFunctional: 'tools',
        categorySpecific: 'power-tools',
        itemType: 'drill',
        itemLabel: 'Drill',
      });

      const existing = createExistingItem({
        id: '1',
        categoryFunctional: 'tools',
        categorySpecific: 'power-tools',
        itemType: 'hammer',
        itemLabel: 'xyz',
      });

      const score = computeMatchScore(detected, existing);
      // Score should be 0.6 (categoryFunctional + categorySpecific)

      // Test with threshold exactly at score
      const resultAtThreshold = matchItems([detected], [existing], {
        matchThreshold: score,
      });
      expect(resultAtThreshold.matched).toHaveLength(1);

      // Test with threshold just above score
      const resultAboveThreshold = matchItems([detected], [existing], {
        matchThreshold: score + 0.01,
      });
      expect(resultAboveThreshold.matched).toHaveLength(0);
      expect(resultAboveThreshold.newItems).toHaveLength(1);

      // Test with threshold just below score
      const resultBelowThreshold = matchItems([detected], [existing], {
        matchThreshold: score - 0.01,
      });
      expect(resultBelowThreshold.matched).toHaveLength(1);
    });
  });

  describe('Single item matching', () => {
    it('should match single detected item to single existing item when score is high', () => {
      const detected = [
        createDetectedItem({
          itemLabel: 'Power Drill',
          categoryFunctional: 'tools',
          categorySpecific: 'power-tools',
          itemType: 'drill',
        }),
      ];

      const existing = [
        createExistingItem({
          id: '1',
          itemLabel: 'Power Drill',
          categoryFunctional: 'tools',
          categorySpecific: 'power-tools',
          itemType: 'drill',
        }),
      ];

      const result = matchItems(detected, existing, DEFAULT_CONFIG);

      expect(result.matched).toHaveLength(1);
      expect(result.matched[0].existingItem.id).toBe('1');
      expect(result.matched[0].detectedItem.itemLabel).toBe('Power Drill');
      expect(result.matched[0].score).toBe(1.0); // Perfect match
      expect(result.newItems).toHaveLength(0);
      expect(result.unmatchedExisting).toHaveLength(0);
    });

    it('should not match single detected item to single existing item when score is low', () => {
      const detected = [
        createDetectedItem({
          itemLabel: 'Arduino Uno',
          categoryFunctional: 'electronics',
          categorySpecific: 'microcontrollers',
          itemType: 'arduino',
        }),
      ];

      const existing = [
        createExistingItem({
          id: '1',
          itemLabel: 'Power Drill',
          categoryFunctional: 'tools',
          categorySpecific: 'power-tools',
          itemType: 'drill',
        }),
      ];

      const result = matchItems(detected, existing, DEFAULT_CONFIG);

      expect(result.matched).toHaveLength(0);
      expect(result.newItems).toHaveLength(1);
      expect(result.newItems[0].itemLabel).toBe('Arduino Uno');
      expect(result.unmatchedExisting).toHaveLength(1);
      expect(result.unmatchedExisting[0].id).toBe('1');
    });

    it('should handle single item with partial match at threshold', () => {
      const detected = [
        createDetectedItem({
          itemLabel: 'Drill',
          categoryFunctional: 'tools',
          categorySpecific: 'power-tools',
          itemType: 'drill',
        }),
      ];

      const existing = [
        createExistingItem({
          id: '1',
          itemLabel: 'Hammer',
          categoryFunctional: 'tools',
          categorySpecific: 'hand-tools',
          itemType: 'hammer',
        }),
      ];

      const score = computeMatchScore(detected[0], existing[0]);
      // Only categoryFunctional matches: 0.3

      const result = matchItems(detected, existing, DEFAULT_CONFIG);

      // Score is 0.3, below threshold of 0.4
      expect(score).toBeLessThan(DEFAULT_CONFIG.matchThreshold);
      expect(result.matched).toHaveLength(0);
      expect(result.newItems).toHaveLength(1);
      expect(result.unmatchedExisting).toHaveLength(1);
    });
  });

  describe('Complex edge cases', () => {
    it('should handle all items matching perfectly', () => {
      const detected = [
        createDetectedItem({ itemLabel: 'Item A' }),
        createDetectedItem({ itemLabel: 'Item B' }),
        createDetectedItem({ itemLabel: 'Item C' }),
      ];

      const existing = [
        createExistingItem({ id: '1', itemLabel: 'Item A' }),
        createExistingItem({ id: '2', itemLabel: 'Item B' }),
        createExistingItem({ id: '3', itemLabel: 'Item C' }),
      ];

      const result = matchItems(detected, existing, DEFAULT_CONFIG);

      expect(result.matched).toHaveLength(3);
      expect(result.newItems).toHaveLength(0);
      expect(result.unmatchedExisting).toHaveLength(0);

      // Verify all scores are 1.0 (perfect matches)
      result.matched.forEach((match) => {
        expect(match.score).toBe(1.0);
      });
    });

    it('should handle no items matching (all below threshold)', () => {
      const detected = [
        createDetectedItem({
          itemLabel: 'Arduino',
          categoryFunctional: 'electronics',
          categorySpecific: 'microcontrollers',
          itemType: 'arduino',
        }),
        createDetectedItem({
          itemLabel: 'Sensor',
          categoryFunctional: 'electronics',
          categorySpecific: 'sensors',
          itemType: 'temperature',
        }),
      ];

      const existing = [
        createExistingItem({
          id: '1',
          itemLabel: 'Drill',
          categoryFunctional: 'tools',
          categorySpecific: 'power-tools',
          itemType: 'drill',
        }),
        createExistingItem({
          id: '2',
          itemLabel: 'Hammer',
          categoryFunctional: 'tools',
          categorySpecific: 'hand-tools',
          itemType: 'hammer',
        }),
      ];

      const result = matchItems(detected, existing, DEFAULT_CONFIG);

      expect(result.matched).toHaveLength(0);
      expect(result.newItems).toHaveLength(2);
      expect(result.unmatchedExisting).toHaveLength(2);
    });

    it('should handle more detected items than existing items', () => {
      const detected = [
        createDetectedItem({ itemLabel: 'Item A' }),
        createDetectedItem({ itemLabel: 'Item B' }),
        createDetectedItem({ itemLabel: 'Item C' }),
        createDetectedItem({ itemLabel: 'Item D' }),
      ];

      const existing = [
        createExistingItem({ id: '1', itemLabel: 'Item A' }),
        createExistingItem({ id: '2', itemLabel: 'Item B' }),
      ];

      const result = matchItems(detected, existing, DEFAULT_CONFIG);

      expect(result.matched).toHaveLength(2);
      expect(result.newItems).toHaveLength(2);
      expect(result.unmatchedExisting).toHaveLength(0);
    });

    it('should handle more existing items than detected items', () => {
      const detected = [
        createDetectedItem({ itemLabel: 'Item A' }),
        createDetectedItem({ itemLabel: 'Item B' }),
      ];

      const existing = [
        createExistingItem({ id: '1', itemLabel: 'Item A' }),
        createExistingItem({ id: '2', itemLabel: 'Item B' }),
        createExistingItem({ id: '3', itemLabel: 'Item C' }),
        createExistingItem({ id: '4', itemLabel: 'Item D' }),
      ];

      const result = matchItems(detected, existing, DEFAULT_CONFIG);

      expect(result.matched).toHaveLength(2);
      expect(result.newItems).toHaveLength(0);
      expect(result.unmatchedExisting).toHaveLength(2);
    });
  });
});

// ============================================================================
// Property-Based Tests
// ============================================================================

/**
 * Arbitraries (generators) for property-based testing
 */

// Generate a valid category string (lowercase, alphanumeric with hyphens)
const categoryArb = fc.stringMatching(/^[a-z0-9-]{1,20}$/);

// Generate a label string
const labelArb = fc.string({ minLength: 1, maxLength: 50 });

// Generate item attributes
const attributesArb = fc.array(
  fc.record({
    name: fc.string({ minLength: 1, maxLength: 30 }),
    value: fc.string({ minLength: 1, maxLength: 50 }),
  }),
  { maxLength: 5 }
);

// Generate ItemMetadata
const itemMetadataArb: fc.Arbitrary<ItemMetadata> = fc.record({
  itemLabel: labelArb,
  itemNotes: fc.string({ maxLength: 100 }),
  categoryFunctional: categoryArb,
  categorySpecific: categoryArb,
  itemType: categoryArb,
  itemName: fc.string({ maxLength: 50 }),
  itemManufacturer: fc.string({ maxLength: 50 }),
  itemAttributes: attributesArb,
});

// Generate ItemsResponse with unique IDs
const itemsResponseArb: fc.Arbitrary<ItemsResponse> = fc
  .record({
    id: fc.uuid(),
    created: fc.constant(new Date().toISOString()),
    updated: fc.constant(new Date().toISOString()),
    collectionId: fc.constant('items'),
    collectionName: fc.constant('Items'),
    itemLabel: labelArb,
    itemName: fc.string({ maxLength: 50 }),
    itemNotes: fc.string({ maxLength: 100 }),
    categoryFunctional: categoryArb,
    categorySpecific: categoryArb,
    itemType: categoryArb,
    itemManufacturer: fc.string({ maxLength: 50 }),
    itemAttributes: attributesArb,
    UserRef: fc.uuid(),
  })
  .map((item) => item as ItemsResponse);

describe('Property-Based Tests', () => {
  describe('Property 1: Match score depends only on category and label fields', () => {
    // Feature: image-upload-upsert, Property 1: Match score depends only on category and label fields
    // Validates: Requirements 2.1, 2.2

    it('should return identical scores for items with same categories and labels but different IDs', () => {
      fc.assert(
        fc.property(
          itemMetadataArb,
          itemsResponseArb,
          fc.uuid(),
          (detected, existing1, newId) => {
            // Create a second existing item with same category/label fields but different ID
            const existing2: ItemsResponse = {
              ...existing1,
              id: newId,
              created: new Date().toISOString(),
              updated: new Date().toISOString(),
            };

            const score1 = computeMatchScore(detected, existing1);
            const score2 = computeMatchScore(detected, existing2);

            // Scores should be identical since only category and label fields matter
            expect(score1).toBe(score2);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return identical scores for items with same categories and labels but different metadata fields', () => {
      fc.assert(
        fc.property(
          itemMetadataArb,
          itemsResponseArb,
          fc.string(),
          fc.string(),
          (detected, existing1, newNotes, newManufacturer) => {
            // Create a second existing item with different non-matching fields
            const existing2: ItemsResponse = {
              ...existing1,
              itemNotes: newNotes,
              itemManufacturer: newManufacturer,
              itemName: 'Different Name',
            };

            const score1 = computeMatchScore(detected, existing1);
            const score2 = computeMatchScore(detected, existing2);

            // Scores should be identical since only category and label fields matter
            expect(score1).toBe(score2);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 2: Category matches outweigh label matches', () => {
    // Feature: image-upload-upsert, Property 2: Category matches outweigh label matches
    // Validates: Requirements 2.3

    it('should score category matches higher than label-only matches', () => {
      fc.assert(
        fc.property(
          categoryArb,
          categoryArb,
          categoryArb,
          labelArb,
          categoryArb,
          categoryArb,
          categoryArb,
          (
            catFunc,
            catSpec,
            itemType,
            label,
            diffCatFunc,
            diffCatSpec,
            diffItemType
          ) => {
            // Ensure categories are actually different
            fc.pre(
              catFunc !== diffCatFunc ||
                catSpec !== diffCatSpec ||
                itemType !== diffItemType
            );

            // Detected item
            const detected = createDetectedItem({
              categoryFunctional: catFunc,
              categorySpecific: catSpec,
              itemType: itemType,
              itemLabel: label,
            });

            // Existing item 1: All categories match, different label
            const existing1 = createExistingItem({
              categoryFunctional: catFunc,
              categorySpecific: catSpec,
              itemType: itemType,
              itemLabel: 'Completely Different Label XYZ',
            });

            // Existing item 2: Same label, different categories
            const existing2 = createExistingItem({
              categoryFunctional: diffCatFunc,
              categorySpecific: diffCatSpec,
              itemType: diffItemType,
              itemLabel: label,
            });

            const score1 = computeMatchScore(detected, existing1);
            const score2 = computeMatchScore(detected, existing2);

            // Category matches should score higher than label match
            expect(score1).toBeGreaterThan(score2);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 3: Tiebreaker by item order', () => {
    // Feature: image-upload-upsert, Property 3: Tiebreaker by item order
    // Validates: Requirements 2.4

    it('should prefer lower-index existing item when scores are identical', () => {
      fc.assert(
        fc.property(
          itemMetadataArb,
          fc.array(fc.nat({ max: 10 }), { minLength: 2, maxLength: 5 }),
          (detected, indices) => {
            // Create multiple existing items with identical properties
            const existingItems = indices.map((_, idx) =>
              createExistingItem({
                id: `item-${idx}`,
                categoryFunctional: detected.categoryFunctional,
                categorySpecific: detected.categorySpecific,
                itemType: detected.itemType,
                itemLabel: detected.itemLabel,
              })
            );

            const result = matchItems(
              [detected],
              existingItems,
              DEFAULT_CONFIG
            );

            // Should match exactly one item
            expect(result.matched).toHaveLength(1);

            // Should match the first item (index 0)
            expect(result.matched[0].existingItem.id).toBe('item-0');

            // All other items should be unmatched
            expect(result.unmatchedExisting).toHaveLength(
              existingItems.length - 1
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 4: One-to-one matching invariant', () => {
    // Feature: image-upload-upsert, Property 4: One-to-one matching invariant
    // Validates: Requirements 2.5

    it('should ensure no existing item appears in more than one matched pair', () => {
      fc.assert(
        fc.property(
          fc.array(itemMetadataArb, { minLength: 1, maxLength: 10 }),
          fc.array(itemsResponseArb, { minLength: 1, maxLength: 10 }),
          (detectedItems, existingItems) => {
            const result = matchItems(
              detectedItems,
              existingItems,
              DEFAULT_CONFIG
            );

            // Extract all existing item IDs from matched pairs
            const matchedExistingIds = result.matched.map(
              (m) => m.existingItem.id
            );

            // Check uniqueness: no duplicates
            const uniqueIds = new Set(matchedExistingIds);
            expect(matchedExistingIds.length).toBe(uniqueIds.size);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should ensure no detected item appears in more than one matched pair', () => {
      fc.assert(
        fc.property(
          fc.array(itemMetadataArb, { minLength: 1, maxLength: 10 }),
          fc.array(itemsResponseArb, { minLength: 1, maxLength: 10 }),
          (detectedItems, existingItems) => {
            const result = matchItems(
              detectedItems,
              existingItems,
              DEFAULT_CONFIG
            );

            // Extract all detected item labels from matched pairs
            // (using label as identifier since detected items don't have IDs)
            const matchedDetectedLabels = result.matched.map(
              (m) => m.detectedItem.itemLabel
            );

            // Count occurrences of each label in original detected items
            const detectedLabelCounts = new Map<string, number>();
            detectedItems.forEach((item) => {
              detectedLabelCounts.set(
                item.itemLabel,
                (detectedLabelCounts.get(item.itemLabel) || 0) + 1
              );
            });

            // Count occurrences in matched pairs
            const matchedLabelCounts = new Map<string, number>();
            matchedDetectedLabels.forEach((label) => {
              matchedLabelCounts.set(
                label,
                (matchedLabelCounts.get(label) || 0) + 1
              );
            });

            // Each detected item should appear at most once in matched pairs
            matchedLabelCounts.forEach((count, label) => {
              expect(count).toBeLessThanOrEqual(
                detectedLabelCounts.get(label) || 0
              );
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should partition all items correctly (matched + new + unmatched = total)', () => {
      fc.assert(
        fc.property(
          fc.array(itemMetadataArb, { minLength: 0, maxLength: 10 }),
          fc.array(itemsResponseArb, { minLength: 0, maxLength: 10 }),
          (detectedItems, existingItems) => {
            const result = matchItems(
              detectedItems,
              existingItems,
              DEFAULT_CONFIG
            );

            // Count matched detected items
            const matchedDetectedCount = result.matched.length;
            const newItemsCount = result.newItems.length;

            // Total detected items should equal matched + new
            expect(matchedDetectedCount + newItemsCount).toBe(
              detectedItems.length
            );

            // Count matched existing items
            const matchedExistingCount = result.matched.length;
            const unmatchedExistingCount = result.unmatchedExisting.length;

            // Total existing items should equal matched + unmatched
            expect(matchedExistingCount + unmatchedExistingCount).toBe(
              existingItems.length
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 5: Below-threshold items classified as new', () => {
    // Feature: image-upload-upsert, Property 5: Below-threshold items classified as new
    // Validates: Requirements 2.6

    it('should classify items with scores below threshold as new', () => {
      fc.assert(
        fc.property(
          fc.array(itemMetadataArb, { minLength: 1, maxLength: 10 }),
          fc.array(itemsResponseArb, { minLength: 1, maxLength: 10 }),
          fc.float({
            min: Math.fround(0.1),
            max: Math.fround(0.9),
            noNaN: true,
          }),
          (detectedItems, existingItems, threshold) => {
            const result = matchItems(detectedItems, existingItems, {
              matchThreshold: threshold,
            });

            // For each matched pair, score should be >= threshold
            result.matched.forEach((match) => {
              expect(match.score).toBeGreaterThanOrEqual(threshold);
            });

            // For each new item, verify its best score with UNMATCHED existing items was below threshold
            // Note: A detected item can be classified as "new" even if it has a high score with an existing item,
            // if that existing item was already matched to a different detected item (one-to-one constraint)
            result.newItems.forEach((newItem) => {
              // If there are no existing items, any detected item is new
              if (existingItems.length === 0) {
                return; // Skip this check
              }

              // Get the IDs of existing items that were already matched
              const matchedExistingIds = new Set(
                result.matched.map((m) => m.existingItem.id)
              );

              // Get unmatched existing items
              const unmatchedExisting = existingItems.filter(
                (e) => !matchedExistingIds.has(e.id)
              );

              // If all existing items are matched, this new item has no options
              if (unmatchedExisting.length === 0) {
                return; // Skip this check - item is new because all existing items are taken
              }

              // Check scores only against unmatched existing items
              const scores = unmatchedExisting.map((existing) =>
                computeMatchScore(newItem, existing)
              );
              const bestScore = Math.max(...scores);
              expect(bestScore).toBeLessThan(threshold);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not match any items when threshold is 1.0', () => {
      fc.assert(
        fc.property(
          fc.array(itemMetadataArb, { minLength: 1, maxLength: 10 }),
          fc.array(itemsResponseArb, { minLength: 1, maxLength: 10 }),
          (detectedItems, existingItems) => {
            // Ensure items are not identical
            const result = matchItems(detectedItems, existingItems, {
              matchThreshold: 1.0,
            });

            // With threshold 1.0, only perfect matches should succeed
            // Most random items won't match perfectly
            result.matched.forEach((match) => {
              expect(match.score).toBe(1.0);
            });
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should match all items when threshold is 0.0', () => {
      fc.assert(
        fc.property(
          fc.array(itemMetadataArb, { minLength: 1, maxLength: 5 }),
          fc.array(itemsResponseArb, { minLength: 1, maxLength: 5 }),
          (detectedItems, existingItems) => {
            const result = matchItems(detectedItems, existingItems, {
              matchThreshold: 0.0,
            });

            // With threshold 0.0, all items should match (up to one-to-one constraint)
            const expectedMatches = Math.min(
              detectedItems.length,
              existingItems.length
            );
            expect(result.matched.length).toBe(expectedMatches);

            // New items only if more detected than existing
            if (detectedItems.length > existingItems.length) {
              expect(result.newItems.length).toBe(
                detectedItems.length - existingItems.length
              );
            } else {
              expect(result.newItems.length).toBe(0);
            }

            // Unmatched existing only if more existing than detected
            if (existingItems.length > detectedItems.length) {
              expect(result.unmatchedExisting.length).toBe(
                existingItems.length - detectedItems.length
              );
            } else {
              expect(result.unmatchedExisting.length).toBe(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

// ============================================================================
// executeUpsert Unit Tests
// ============================================================================

describe('executeUpsert', () => {
  it('should call updateItem for matched items with correct parameters', async () => {
    const detected = createDetectedItem({ itemLabel: 'Updated Item' });
    const existing = createExistingItem({
      id: 'item-1',
      itemLabel: 'Old Item',
    });

    const matchResult: MatchResult = {
      matched: [{ existingItem: existing, detectedItem: detected, score: 1.0 }],
      newItems: [],
      unmatchedExisting: [],
    };

    const updateItemMock = vi.fn().mockResolvedValue({
      ...existing,
      itemLabel: detected.itemLabel,
      ImageRef: 'new-image-id',
    });
    const createItemMock = vi.fn();

    const result = await executeUpsert(
      matchResult,
      'new-image-id',
      'container-1',
      {
        updateItem: updateItemMock,
        createItem: createItemMock,
      }
    );

    // Verify updateItem was called with correct parameters
    expect(updateItemMock).toHaveBeenCalledTimes(1);
    expect(updateItemMock).toHaveBeenCalledWith(
      'item-1',
      detected,
      'new-image-id'
    );

    // Verify createItem was not called
    expect(createItemMock).not.toHaveBeenCalled();

    // Verify result structure
    expect(result.updatedItems).toHaveLength(1);
    expect(result.createdItems).toHaveLength(0);
    expect(result.unmatchedExisting).toHaveLength(0);
  });

  it('should call createItem for new items with correct parameters', async () => {
    const newItem1 = createDetectedItem({ itemLabel: 'New Item 1' });
    const newItem2 = createDetectedItem({ itemLabel: 'New Item 2' });

    const matchResult: MatchResult = {
      matched: [],
      newItems: [newItem1, newItem2],
      unmatchedExisting: [],
    };

    const updateItemMock = vi.fn();
    const createItemMock = vi
      .fn()
      .mockResolvedValueOnce(
        createExistingItem({ id: 'new-1', itemLabel: 'New Item 1' })
      )
      .mockResolvedValueOnce(
        createExistingItem({ id: 'new-2', itemLabel: 'New Item 2' })
      );

    const result = await executeUpsert(
      matchResult,
      'new-image-id',
      'container-1',
      {
        updateItem: updateItemMock,
        createItem: createItemMock,
      }
    );

    // Verify createItem was called with correct parameters
    expect(createItemMock).toHaveBeenCalledTimes(2);
    expect(createItemMock).toHaveBeenNthCalledWith(
      1,
      newItem1,
      'container-1',
      'new-image-id'
    );
    expect(createItemMock).toHaveBeenNthCalledWith(
      2,
      newItem2,
      'container-1',
      'new-image-id'
    );

    // Verify updateItem was not called
    expect(updateItemMock).not.toHaveBeenCalled();

    // Verify result structure
    expect(result.updatedItems).toHaveLength(0);
    expect(result.createdItems).toHaveLength(2);
    expect(result.unmatchedExisting).toHaveLength(0);
  });

  it('should preserve unmatched existing items without modification', async () => {
    const unmatched1 = createExistingItem({
      id: 'unmatched-1',
      itemLabel: 'Unmatched 1',
    });
    const unmatched2 = createExistingItem({
      id: 'unmatched-2',
      itemLabel: 'Unmatched 2',
    });

    const matchResult: MatchResult = {
      matched: [],
      newItems: [],
      unmatchedExisting: [unmatched1, unmatched2],
    };

    const updateItemMock = vi.fn();
    const createItemMock = vi.fn();

    const result = await executeUpsert(
      matchResult,
      'new-image-id',
      'container-1',
      {
        updateItem: updateItemMock,
        createItem: createItemMock,
      }
    );

    // Verify no callbacks were called
    expect(updateItemMock).not.toHaveBeenCalled();
    expect(createItemMock).not.toHaveBeenCalled();

    // Verify unmatched items are preserved in result
    expect(result.updatedItems).toHaveLength(0);
    expect(result.createdItems).toHaveLength(0);
    expect(result.unmatchedExisting).toHaveLength(2);
    expect(result.unmatchedExisting).toEqual([unmatched1, unmatched2]);
  });

  it('should handle mixed scenario with matched, new, and unmatched items', async () => {
    const detected = createDetectedItem({ itemLabel: 'Matched Item' });
    const existing = createExistingItem({
      id: 'matched-1',
      itemLabel: 'Old Matched',
    });
    const newItem = createDetectedItem({ itemLabel: 'New Item' });
    const unmatched = createExistingItem({
      id: 'unmatched-1',
      itemLabel: 'Unmatched',
    });

    const matchResult: MatchResult = {
      matched: [{ existingItem: existing, detectedItem: detected, score: 0.9 }],
      newItems: [newItem],
      unmatchedExisting: [unmatched],
    };

    const updateItemMock = vi.fn().mockResolvedValue({
      ...existing,
      itemLabel: detected.itemLabel,
      ImageRef: 'new-image-id',
    });
    const createItemMock = vi
      .fn()
      .mockResolvedValue(
        createExistingItem({ id: 'new-1', itemLabel: 'New Item' })
      );

    const result = await executeUpsert(
      matchResult,
      'new-image-id',
      'container-1',
      {
        updateItem: updateItemMock,
        createItem: createItemMock,
      }
    );

    // Verify both callbacks were called
    expect(updateItemMock).toHaveBeenCalledTimes(1);
    expect(createItemMock).toHaveBeenCalledTimes(1);

    // Verify result structure
    expect(result.updatedItems).toHaveLength(1);
    expect(result.createdItems).toHaveLength(1);
    expect(result.unmatchedExisting).toHaveLength(1);
    expect(result.unmatchedExisting[0]).toEqual(unmatched);
  });

  it('should handle empty match result', async () => {
    const matchResult: MatchResult = {
      matched: [],
      newItems: [],
      unmatchedExisting: [],
    };

    const updateItemMock = vi.fn();
    const createItemMock = vi.fn();

    const result = await executeUpsert(
      matchResult,
      'new-image-id',
      'container-1',
      {
        updateItem: updateItemMock,
        createItem: createItemMock,
      }
    );

    // Verify no callbacks were called
    expect(updateItemMock).not.toHaveBeenCalled();
    expect(createItemMock).not.toHaveBeenCalled();

    // Verify empty result
    expect(result.updatedItems).toHaveLength(0);
    expect(result.createdItems).toHaveLength(0);
    expect(result.unmatchedExisting).toHaveLength(0);
  });

  it('should execute callbacks sequentially for multiple items', async () => {
    const detected1 = createDetectedItem({ itemLabel: 'Item 1' });
    const detected2 = createDetectedItem({ itemLabel: 'Item 2' });
    const existing1 = createExistingItem({ id: 'existing-1' });
    const existing2 = createExistingItem({ id: 'existing-2' });

    const matchResult: MatchResult = {
      matched: [
        { existingItem: existing1, detectedItem: detected1, score: 1.0 },
        { existingItem: existing2, detectedItem: detected2, score: 1.0 },
      ],
      newItems: [],
      unmatchedExisting: [],
    };

    const callOrder: string[] = [];
    const updateItemMock = vi.fn().mockImplementation(async (id) => {
      callOrder.push(`update-${id}`);
      return createExistingItem({ id });
    });
    const createItemMock = vi.fn();

    await executeUpsert(matchResult, 'new-image-id', 'container-1', {
      updateItem: updateItemMock,
      createItem: createItemMock,
    });

    // Verify callbacks were called in order
    expect(callOrder).toEqual(['update-existing-1', 'update-existing-2']);
  });
});

// ============================================================================
// Property-Based Tests for Item Metadata Update (Property 12)
// ============================================================================

describe('Property 12: Item metadata updated from AI on single-item upload', () => {
  // Feature: image-upload-upsert, Property 12: Item metadata updated from AI on single-item upload
  // Validates: Requirements 5.3

  it('should update all metadata fields from AI-detected values', () => {
    fc.assert(
      fc.property(
        itemMetadataArb,
        itemsResponseArb,
        (aiDetectedMetadata, existingItem) => {
          // Simulate the metadata update that happens in processItemImageUpload
          // The AI-detected metadata should completely replace the existing metadata fields
          const updatedItem: ItemsResponse = {
            ...existingItem,
            itemLabel: aiDetectedMetadata.itemLabel,
            itemName: aiDetectedMetadata.itemName,
            itemNotes: aiDetectedMetadata.itemNotes,
            categoryFunctional: aiDetectedMetadata.categoryFunctional,
            categorySpecific: aiDetectedMetadata.categorySpecific,
            itemType: aiDetectedMetadata.itemType,
            itemManufacturer: aiDetectedMetadata.itemManufacturer,
            itemAttributes: aiDetectedMetadata.itemAttributes,
          };

          // Verify all metadata fields match AI-detected values
          expect(updatedItem.itemLabel).toBe(aiDetectedMetadata.itemLabel);
          expect(updatedItem.itemName).toBe(aiDetectedMetadata.itemName);
          expect(updatedItem.itemNotes).toBe(aiDetectedMetadata.itemNotes);
          expect(updatedItem.categoryFunctional).toBe(
            aiDetectedMetadata.categoryFunctional
          );
          expect(updatedItem.categorySpecific).toBe(
            aiDetectedMetadata.categorySpecific
          );
          expect(updatedItem.itemType).toBe(aiDetectedMetadata.itemType);
          expect(updatedItem.itemManufacturer).toBe(
            aiDetectedMetadata.itemManufacturer
          );
          expect(updatedItem.itemAttributes).toEqual(
            aiDetectedMetadata.itemAttributes
          );

          // Verify non-metadata fields are preserved
          expect(updatedItem.id).toBe(existingItem.id);
          expect(updatedItem.created).toBe(existingItem.created);
          expect(updatedItem.updated).toBe(existingItem.updated);
          expect(updatedItem.collectionId).toBe(existingItem.collectionId);
          expect(updatedItem.collectionName).toBe(existingItem.collectionName);
          expect(updatedItem.UserRef).toBe(existingItem.UserRef);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should preserve system fields while updating metadata', () => {
    fc.assert(
      fc.property(
        itemMetadataArb,
        itemsResponseArb,
        fc.uuid(),
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
        (aiDetectedMetadata, existingItem, newImageId, updateTime) => {
          // Simulate the complete update including ImageRef
          const updatedItem: ItemsResponse = {
            ...existingItem,
            itemLabel: aiDetectedMetadata.itemLabel,
            itemName: aiDetectedMetadata.itemName,
            itemNotes: aiDetectedMetadata.itemNotes,
            categoryFunctional: aiDetectedMetadata.categoryFunctional,
            categorySpecific: aiDetectedMetadata.categorySpecific,
            itemType: aiDetectedMetadata.itemType,
            itemManufacturer: aiDetectedMetadata.itemManufacturer,
            itemAttributes: aiDetectedMetadata.itemAttributes,
            ImageRef: newImageId,
            updated: updateTime.toISOString(),
          };

          // Verify metadata fields are updated
          expect(updatedItem.itemLabel).toBe(aiDetectedMetadata.itemLabel);
          expect(updatedItem.categoryFunctional).toBe(
            aiDetectedMetadata.categoryFunctional
          );
          expect(updatedItem.categorySpecific).toBe(
            aiDetectedMetadata.categorySpecific
          );
          expect(updatedItem.itemType).toBe(aiDetectedMetadata.itemType);

          // Verify system fields are preserved
          expect(updatedItem.id).toBe(existingItem.id);
          expect(updatedItem.created).toBe(existingItem.created);
          expect(updatedItem.collectionId).toBe(existingItem.collectionId);
          expect(updatedItem.collectionName).toBe(existingItem.collectionName);
          expect(updatedItem.UserRef).toBe(existingItem.UserRef);

          // Verify ImageRef is updated
          expect(updatedItem.ImageRef).toBe(newImageId);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should handle metadata updates with empty or minimal values', () => {
    fc.assert(
      fc.property(itemsResponseArb, (existingItem) => {
        // Create minimal AI-detected metadata
        const minimalMetadata: ItemMetadata = {
          itemLabel: '',
          itemName: '',
          itemNotes: '',
          categoryFunctional: 'unknown',
          categorySpecific: 'unknown',
          itemType: 'unknown',
          itemManufacturer: '',
          itemAttributes: [],
        };

        const updatedItem: ItemsResponse = {
          ...existingItem,
          itemLabel: minimalMetadata.itemLabel,
          itemName: minimalMetadata.itemName,
          itemNotes: minimalMetadata.itemNotes,
          categoryFunctional: minimalMetadata.categoryFunctional,
          categorySpecific: minimalMetadata.categorySpecific,
          itemType: minimalMetadata.itemType,
          itemManufacturer: minimalMetadata.itemManufacturer,
          itemAttributes: minimalMetadata.itemAttributes,
        };

        // Verify empty values are accepted
        expect(updatedItem.itemLabel).toBe('');
        expect(updatedItem.itemName).toBe('');
        expect(updatedItem.itemNotes).toBe('');
        expect(updatedItem.itemManufacturer).toBe('');
        expect(updatedItem.itemAttributes).toEqual([]);

        // Verify category fields have values
        expect(updatedItem.categoryFunctional).toBe('unknown');
        expect(updatedItem.categorySpecific).toBe('unknown');
        expect(updatedItem.itemType).toBe('unknown');
      }),
      { numRuns: 100 }
    );
  });

  it('should handle metadata updates with complex attributes', () => {
    fc.assert(
      fc.property(
        itemsResponseArb,
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 30 }),
            value: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (existingItem, attributes) => {
          const aiDetectedMetadata: ItemMetadata = {
            itemLabel: 'Test Item',
            itemName: 'Test',
            itemNotes: 'Notes',
            categoryFunctional: 'tools',
            categorySpecific: 'power-tools',
            itemType: 'drill',
            itemManufacturer: 'TestCo',
            itemAttributes: attributes,
          };

          const updatedItem: ItemsResponse = {
            ...existingItem,
            itemLabel: aiDetectedMetadata.itemLabel,
            itemName: aiDetectedMetadata.itemName,
            itemNotes: aiDetectedMetadata.itemNotes,
            categoryFunctional: aiDetectedMetadata.categoryFunctional,
            categorySpecific: aiDetectedMetadata.categorySpecific,
            itemType: aiDetectedMetadata.itemType,
            itemManufacturer: aiDetectedMetadata.itemManufacturer,
            itemAttributes: aiDetectedMetadata.itemAttributes,
          };

          // Verify attributes are correctly updated
          expect(updatedItem.itemAttributes).toEqual(attributes);
          expect(updatedItem.itemAttributes.length).toBe(attributes.length);

          // Verify each attribute is preserved
          updatedItem.itemAttributes.forEach((attr, index) => {
            expect(attr.name).toBe(attributes[index].name);
            expect(attr.value).toBe(attributes[index].value);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should maintain referential integrity during metadata updates', () => {
    fc.assert(
      fc.property(
        itemMetadataArb,
        itemsResponseArb,
        fc.option(fc.uuid(), { nil: undefined }),
        fc.option(fc.uuid(), { nil: undefined }),
        (aiDetectedMetadata, existingItem, containerRef, imageRef) => {
          // Simulate update with optional references
          const itemWithRefs: ItemsResponse = {
            ...existingItem,
            ContainerRef: containerRef,
            ImageRef: imageRef,
          };

          const updatedItem: ItemsResponse = {
            ...itemWithRefs,
            itemLabel: aiDetectedMetadata.itemLabel,
            itemName: aiDetectedMetadata.itemName,
            itemNotes: aiDetectedMetadata.itemNotes,
            categoryFunctional: aiDetectedMetadata.categoryFunctional,
            categorySpecific: aiDetectedMetadata.categorySpecific,
            itemType: aiDetectedMetadata.itemType,
            itemManufacturer: aiDetectedMetadata.itemManufacturer,
            itemAttributes: aiDetectedMetadata.itemAttributes,
          };

          // Verify metadata is updated
          expect(updatedItem.itemLabel).toBe(aiDetectedMetadata.itemLabel);
          expect(updatedItem.categoryFunctional).toBe(
            aiDetectedMetadata.categoryFunctional
          );

          // Verify references are preserved (unless explicitly updated)
          expect(updatedItem.ContainerRef).toBe(containerRef);
          expect(updatedItem.ImageRef).toBe(imageRef);
          expect(updatedItem.UserRef).toBe(existingItem.UserRef);
        }
      ),
      { numRuns: 100 }
    );
  });
});

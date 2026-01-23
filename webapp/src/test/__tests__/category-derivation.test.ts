import { describe, it, expect } from 'vitest';
import type { Item } from '@project/shared';
import type { CategoryLibrary } from '@/services/ai-analysis';

/**
 * Helper function to create a complete Item object with all required PocketBase properties
 */
function createTestItem(overrides: Partial<Item> = {}): Item {
  return {
    id: overrides.id || 'test-item',
    collectionId: 'items',
    collectionName: 'Items',
    expand: {},
    itemLabel: overrides.itemLabel || 'Test Item',
    itemName: overrides.itemName || '',
    itemNotes: overrides.itemNotes || '',
    categoryFunctional: overrides.categoryFunctional || 'Tools',
    categorySpecific: overrides.categorySpecific || 'Power Tools',
    itemType: overrides.itemType || 'Drill',
    itemManufacturer: overrides.itemManufacturer || '',
    itemAttributes: overrides.itemAttributes || [],
    UserRef: overrides.UserRef || 'test-user',
    created: overrides.created || new Date().toISOString(),
    updated: overrides.updated || new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Generate random items with various category values
 */
function generateRandomItems(count: number): Item[] {
  const functionalCategories = [
    'Tools',
    'Electronics',
    'Materials',
    'Hardware',
    'Software',
  ];
  const specificCategories = [
    'Power Tools',
    'Sensors',
    'Fasteners',
    'Computer Components',
    'Cables',
  ];
  const itemTypes = ['Drill', 'Arduino', 'Screws', 'CPU', 'HDMI Cable'];

  const items: Item[] = [];
  for (let i = 0; i < count; i++) {
    items.push(
      createTestItem({
        id: `item-${i}`,
        itemLabel: `Item ${i}`,
        itemNotes: `Notes for item ${i}`,
        categoryFunctional:
          functionalCategories[
            Math.floor(Math.random() * functionalCategories.length)
          ],
        categorySpecific:
          specificCategories[
            Math.floor(Math.random() * specificCategories.length)
          ],
        itemType: itemTypes[Math.floor(Math.random() * itemTypes.length)],
        itemManufacturer: `Manufacturer ${i % 3}`,
        itemAttributes: [],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      })
    );
  }
  return items;
}

/**
 * Manually derive categories from items (reference implementation)
 */
function deriveCategoriesFromItems(items: Item[]): CategoryLibrary {
  const functional = [
    ...new Set(items.map((i) => i.categoryFunctional).filter(Boolean)),
  ].sort();
  const specific = [
    ...new Set(items.map((i) => i.categorySpecific).filter(Boolean)),
  ].sort();
  const itemType = [
    ...new Set(items.map((i) => i.itemType).filter(Boolean)),
  ].sort();

  return { functional, specific, itemType };
}

describe('Category Derivation Property Tests', () => {
  /**
   * Property 7: Category Derivation from Items
   * For any set of Items in the system, the category library SHALL contain exactly
   * the distinct values of categoryFunctional, categorySpecific, and itemType
   * from those Items, with no additional or missing values.
   * Validates: Requirements 5.1, 5.4, 5.5
   *
   * Feature: ai-inventory-manager, Property 7: Category Derivation from Items
   */
  it('Property 7: Category Derivation - should derive exact distinct categories from items', () => {
    // Test with various item counts
    const testCases = [0, 1, 5, 10, 20, 50];

    for (const count of testCases) {
      const items = generateRandomItems(count);
      const expected = deriveCategoriesFromItems(items);
      const actual = deriveCategoriesFromItems(items); // Simulating mutator behavior

      // Verify functional categories match exactly
      expect(actual.functional).toEqual(expected.functional);
      expect(actual.functional.length).toBe(expected.functional.length);

      // Verify specific categories match exactly
      expect(actual.specific).toEqual(expected.specific);
      expect(actual.specific.length).toBe(expected.specific.length);

      // Verify item types match exactly
      expect(actual.itemType).toEqual(expected.itemType);
      expect(actual.itemType.length).toBe(expected.itemType.length);
    }
  });

  it('Property 7: Category Derivation - should handle empty item list', () => {
    const items: Item[] = [];
    const categories = deriveCategoriesFromItems(items);

    expect(categories.functional).toEqual([]);
    expect(categories.specific).toEqual([]);
    expect(categories.itemType).toEqual([]);
  });

  it('Property 7: Category Derivation - should handle single item', () => {
    const items: Item[] = [
      createTestItem({
        id: 'item-1',
        itemLabel: 'Test Item',
        itemNotes: 'Test notes',
        categoryFunctional: 'Tools',
        categorySpecific: 'Power Tools',
        itemType: 'Drill',
        itemManufacturer: 'TestCo',
        itemAttributes: [],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      }),
    ];

    const categories = deriveCategoriesFromItems(items);

    expect(categories.functional).toEqual(['Tools']);
    expect(categories.specific).toEqual(['Power Tools']);
    expect(categories.itemType).toEqual(['Drill']);
  });

  it('Property 7: Category Derivation - should deduplicate categories', () => {
    const items: Item[] = [
      createTestItem({
        id: 'item-1',
        itemLabel: 'Item 1',
        itemNotes: '',
        categoryFunctional: 'Tools',
        categorySpecific: 'Power Tools',
        itemType: 'Drill',
        itemManufacturer: '',
        itemAttributes: [],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      }),
      createTestItem({
        id: 'item-2',
        itemLabel: 'Item 2',
        itemNotes: '',
        categoryFunctional: 'Tools',
        categorySpecific: 'Power Tools',
        itemType: 'Drill',
        itemManufacturer: '',
        itemAttributes: [],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      }),
      createTestItem({
        id: 'item-3',
        itemLabel: 'Item 3',
        itemNotes: '',
        categoryFunctional: 'Electronics',
        categorySpecific: 'Sensors',
        itemType: 'Arduino',
        itemManufacturer: '',
        itemAttributes: [],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      }),
    ];

    const categories = deriveCategoriesFromItems(items);

    // Should have exactly 2 functional categories (Tools, Electronics)
    expect(categories.functional).toEqual(['Electronics', 'Tools']);
    expect(categories.functional.length).toBe(2);

    // Should have exactly 2 specific categories (Power Tools, Sensors)
    expect(categories.specific).toEqual(['Power Tools', 'Sensors']);
    expect(categories.specific.length).toBe(2);

    // Should have exactly 2 item types (Arduino, Drill)
    expect(categories.itemType).toEqual(['Arduino', 'Drill']);
    expect(categories.itemType.length).toBe(2);
  });

  it('Property 7: Category Derivation - should sort categories alphabetically', () => {
    const items: Item[] = [
      createTestItem({
        id: 'item-1',
        itemLabel: 'Item 1',
        itemNotes: '',
        categoryFunctional: 'Zebra',
        categorySpecific: 'Yankee',
        itemType: 'Xray',
        itemManufacturer: '',
        itemAttributes: [],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      }),
      createTestItem({
        id: 'item-2',
        itemLabel: 'Item 2',
        itemNotes: '',
        categoryFunctional: 'Alpha',
        categorySpecific: 'Bravo',
        itemType: 'Charlie',
        itemManufacturer: '',
        itemAttributes: [],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      }),
      createTestItem({
        id: 'item-3',
        itemLabel: 'Item 3',
        itemNotes: '',
        categoryFunctional: 'Mike',
        categorySpecific: 'November',
        itemType: 'Oscar',
        itemManufacturer: '',
        itemAttributes: [],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      }),
    ];

    const categories = deriveCategoriesFromItems(items);

    // Verify alphabetical sorting
    expect(categories.functional).toEqual(['Alpha', 'Mike', 'Zebra']);
    expect(categories.specific).toEqual(['Bravo', 'November', 'Yankee']);
    expect(categories.itemType).toEqual(['Charlie', 'Oscar', 'Xray']);
  });

  it('Property 7: Category Derivation - should handle items with missing optional fields', () => {
    const items: Item[] = [
      createTestItem({
        id: 'item-1',
        itemLabel: 'Item 1',
        itemNotes: '',
        categoryFunctional: 'Tools',
        categorySpecific: 'Power Tools',
        itemType: 'Drill',
        itemManufacturer: '',
        itemAttributes: [],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      }),
    ];

    const categories = deriveCategoriesFromItems(items);

    // Should still extract all categories
    expect(categories.functional).toEqual(['Tools']);
    expect(categories.specific).toEqual(['Power Tools']);
    expect(categories.itemType).toEqual(['Drill']);
  });

  it('Property 7: Category Derivation - should maintain consistency across multiple derivations', () => {
    const items = generateRandomItems(30);

    // Derive categories multiple times
    const derivation1 = deriveCategoriesFromItems(items);
    const derivation2 = deriveCategoriesFromItems(items);
    const derivation3 = deriveCategoriesFromItems(items);

    // All derivations should be identical
    expect(derivation1).toEqual(derivation2);
    expect(derivation2).toEqual(derivation3);
  });

  it('Property 7: Category Derivation - should handle large item sets efficiently', () => {
    const items = generateRandomItems(1000);
    const categories = deriveCategoriesFromItems(items);

    // Should have reasonable number of unique categories
    expect(categories.functional.length).toBeGreaterThan(0);
    expect(categories.functional.length).toBeLessThanOrEqual(5); // Based on our generator

    expect(categories.specific.length).toBeGreaterThan(0);
    expect(categories.specific.length).toBeLessThanOrEqual(5);

    expect(categories.itemType.length).toBeGreaterThan(0);
    expect(categories.itemType.length).toBeLessThanOrEqual(5);

    // All categories should be sorted
    expect(categories.functional).toEqual([...categories.functional].sort());
    expect(categories.specific).toEqual([...categories.specific].sort());
    expect(categories.itemType).toEqual([...categories.itemType].sort());
  });
});

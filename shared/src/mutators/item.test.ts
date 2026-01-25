import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ItemMutator } from './item.js';
import type { TypedPocketBase } from '../types/index.js';

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockGetList = vi.fn();
const mockCollection = vi.fn(() => ({
  create: mockCreate,
  update: mockUpdate,
  getList: mockGetList,
}));

const mockPb = {
  collection: mockCollection,
} as unknown as TypedPocketBase;

describe('ItemMutator', () => {
  let mutator: ItemMutator;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mutator = new ItemMutator(mockPb);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('create', () => {
    it('should create an item with correct fields', async () => {
      mockCreate.mockResolvedValue({ id: 'new-item', version: 1 });

      const input = {
        itemLabel: 'Test Item',
        itemName: '',
        itemNotes: '',
        categoryFunctional: 'Tools',
        categorySpecific: 'Hand Tools',
        itemType: 'Hammer',
        itemManufacturer: '',
        itemAttributes: [],
        UserRef: 'user123',
      };

      await mutator.create(input);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          itemLabel: 'Test Item',
          categoryFunctional: 'Tools',
          UserRef: 'user123',
        })
      );
    });

    it('should throw validation error for missing required fields', async () => {
      const input = {
        // Missing itemLabel
        categoryFunctional: 'Tools',
        categorySpecific: 'Hand Tools',
        itemType: 'Hammer',
        UserRef: 'user123',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      await expect(mutator.create(input)).rejects.toThrow();
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update an item', async () => {
      mockUpdate.mockResolvedValue({ id: 'item-123', version: 2 });

      await mutator.update('item-123', {
        itemLabel: 'Updated Hammer',
      });

      expect(mockUpdate).toHaveBeenCalledWith(
        'item-123',
        expect.objectContaining({
          itemLabel: 'Updated Hammer',
        })
      );
    });
  });
});

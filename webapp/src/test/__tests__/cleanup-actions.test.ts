import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createInventoryService } from '@/services/inventory';
import type { TypedPocketBase, Item } from '@project/shared';

describe('Cleanup Actions', () => {
  let mockPb: TypedPocketBase;
  let mockItemMutator: any;

  beforeEach(() => {
    // Create mock item mutator
    mockItemMutator = {
      update: vi.fn(),
      delete: vi.fn(),
      getList: vi.fn(),
      getById: vi.fn(),
      getByContainer: vi.fn(),
      getDistinctCategories: vi.fn(),
    };

    // Create mock PocketBase client
    mockPb = {
      collection: vi.fn(() => mockItemMutator),
      authStore: {
        token: 'mock-token',
        model: { id: 'user-123' },
      },
    } as any;
  });

  describe('removeItemFromContainer', () => {
    it('should set ContainerRef to empty string while preserving other fields', async () => {
      const mockItem: Item = {
        id: 'item-123',
        itemLabel: 'Test Item',
        itemName: 'Test',
        itemNotes: 'Notes',
        categoryFunctional: 'Tools',
        categorySpecific: 'Hand Tools',
        itemType: 'Screwdriver',
        itemManufacturer: 'Brand',
        itemAttributes: [],
        ContainerRef: 'container-123',
        ImageRef: 'image-123',
        UserRef: 'user-123',
        created: '2024-01-01',
        updated: '2024-01-01',
        collectionId: 'items',
        collectionName: 'Items',
      };

      mockItemMutator.update.mockResolvedValue({
        ...mockItem,
        ContainerRef: '',
      });

      const service = createInventoryService(mockPb);
      const result = await service.removeItemFromContainer('item-123');

      expect(mockItemMutator.update).toHaveBeenCalledWith('item-123', {
        ContainerRef: '',
      });
      expect(result.ContainerRef).toBe('');
      expect(result.itemLabel).toBe('Test Item');
    });
  });

  describe('deleteItem', () => {
    it('should delete the item record', async () => {
      mockItemMutator.delete.mockResolvedValue(true);

      const service = createInventoryService(mockPb);
      const result = await service.deleteItem('item-123');

      expect(mockItemMutator.delete).toHaveBeenCalledWith('item-123');
      expect(result).toBe(true);
    });
  });

  describe('executeCleanupActions', () => {
    it('should execute keep action without modifying the item', async () => {
      const service = createInventoryService(mockPb);
      const result = await service.executeCleanupActions([
        { itemId: 'item-1', action: 'keep' },
      ]);

      expect(result.kept).toBe(1);
      expect(result.removed).toBe(0);
      expect(result.deleted).toBe(0);
      expect(mockItemMutator.update).not.toHaveBeenCalled();
      expect(mockItemMutator.delete).not.toHaveBeenCalled();
    });

    it('should execute remove action by setting ContainerRef to empty', async () => {
      const mockItem: Item = {
        id: 'item-1',
        itemLabel: 'Test',
        itemName: 'Test',
        itemNotes: '',
        categoryFunctional: 'Tools',
        categorySpecific: 'Hand Tools',
        itemType: 'Screwdriver',
        itemManufacturer: '',
        itemAttributes: [],
        ContainerRef: '',
        ImageRef: 'image-1',
        UserRef: 'user-1',
        created: '2024-01-01',
        updated: '2024-01-01',
        collectionId: 'items',
        collectionName: 'Items',
      };

      mockItemMutator.update.mockResolvedValue(mockItem);

      const service = createInventoryService(mockPb);
      const result = await service.executeCleanupActions([
        { itemId: 'item-1', action: 'remove' },
      ]);

      expect(result.kept).toBe(0);
      expect(result.removed).toBe(1);
      expect(result.deleted).toBe(0);
      expect(mockItemMutator.update).toHaveBeenCalledWith('item-1', {
        ContainerRef: '',
      });
    });

    it('should execute delete action by deleting the item', async () => {
      mockItemMutator.delete.mockResolvedValue(true);

      const service = createInventoryService(mockPb);
      const result = await service.executeCleanupActions([
        { itemId: 'item-1', action: 'delete' },
      ]);

      expect(result.kept).toBe(0);
      expect(result.removed).toBe(0);
      expect(result.deleted).toBe(1);
      expect(mockItemMutator.delete).toHaveBeenCalledWith('item-1');
    });

    it('should execute multiple actions in batch', async () => {
      const mockItem: Item = {
        id: 'item-2',
        itemLabel: 'Test',
        itemName: 'Test',
        itemNotes: '',
        categoryFunctional: 'Tools',
        categorySpecific: 'Hand Tools',
        itemType: 'Screwdriver',
        itemManufacturer: '',
        itemAttributes: [],
        ContainerRef: '',
        ImageRef: 'image-2',
        UserRef: 'user-1',
        created: '2024-01-01',
        updated: '2024-01-01',
        collectionId: 'items',
        collectionName: 'Items',
      };

      mockItemMutator.update.mockResolvedValue(mockItem);
      mockItemMutator.delete.mockResolvedValue(true);

      const service = createInventoryService(mockPb);
      const result = await service.executeCleanupActions([
        { itemId: 'item-1', action: 'keep' },
        { itemId: 'item-2', action: 'remove' },
        { itemId: 'item-3', action: 'delete' },
        { itemId: 'item-4', action: 'keep' },
      ]);

      expect(result.kept).toBe(2);
      expect(result.removed).toBe(1);
      expect(result.deleted).toBe(1);
      expect(mockItemMutator.update).toHaveBeenCalledTimes(1);
      expect(mockItemMutator.delete).toHaveBeenCalledTimes(1);
    });

    it('should continue processing other actions if one fails', async () => {
      mockItemMutator.update.mockRejectedValue(new Error('Update failed'));
      mockItemMutator.delete.mockResolvedValue(true);

      const service = createInventoryService(mockPb);
      const result = await service.executeCleanupActions([
        { itemId: 'item-1', action: 'remove' }, // This will fail
        { itemId: 'item-2', action: 'delete' }, // This should still execute
        { itemId: 'item-3', action: 'keep' }, // This should still execute
      ]);

      expect(result.kept).toBe(1);
      expect(result.removed).toBe(0); // Failed
      expect(result.deleted).toBe(1);
      expect(mockItemMutator.update).toHaveBeenCalledTimes(1);
      expect(mockItemMutator.delete).toHaveBeenCalledTimes(1);
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ImageMetadataMutator } from './image-metadata.js';
import type { TypedPocketBase } from '../types/index.js';

// Mock PocketBase
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

describe('ImageMetadataMutator', () => {
  let mutator: ImageMetadataMutator;

  beforeEach(() => {
    vi.clearAllMocks();
    mutator = new ImageMetadataMutator(mockPb);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('saveMetadata', () => {
    it('should use correct field names when creating metadata', async () => {
      // Mock findByHash to return null so it attempts creation
      mockGetList.mockResolvedValue({ items: [] });
      mockCreate.mockResolvedValue({ id: 'new-id', version: 1 });

      await mutator.saveMetadata(
        'hash-123',
        {
          type: 'item',
          data: {
            imageLabel: 'test label',
            imageNotes: 'test notes',
            item: {
              itemLabel: 'test item',
              itemNotes: 'test item notes',
              categoryFunctional: 'tools',
              categorySpecific: 'power-tools',
              itemType: 'drill',
              itemName: 'Power Drill',
              itemManufacturer: 'Brand',
              itemAttributes: [],
            },
          },
        },
        'item'
      );

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          fileHash: 'hash-123',
          imageType: 'item',
        })
      );
    });

    it('should use correct field names when updating metadata', async () => {
      // Mock findByHash to return an existing record
      mockGetList.mockResolvedValue({
        items: [{ id: 'existing-id', version: 1 }],
      });
      mockUpdate.mockResolvedValue({ id: 'existing-id', version: 2 });

      await mutator.saveMetadata(
        'hash-123',
        {
          type: 'item',
          data: {
            imageLabel: 'test label',
            imageNotes: 'test notes',
            item: {
              itemLabel: 'test item',
              itemNotes: 'test item notes',
              categoryFunctional: 'tools',
              categorySpecific: 'power-tools',
              itemType: 'drill',
              itemName: 'Power Drill',
              itemManufacturer: 'Brand',
              itemAttributes: [],
            },
          },
        },
        'item'
      );

      expect(mockUpdate).toHaveBeenCalledWith(
        'existing-id',
        expect.objectContaining({
          imageType: 'item',
          version: 2,
        })
      );
    });
  });
});

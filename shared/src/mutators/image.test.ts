import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ImageMutator } from './image.js';
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

describe('ImageMutator', () => {
  let mutator: ImageMutator;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mutator = new ImageMutator(mockPb);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('uploadImage', () => {
    it('should create an image record from file', async () => {
      mockCreate.mockResolvedValue({ id: 'img-123' });

      const file = new File([''], 'test.png', { type: 'image/png' });
      await mutator.uploadImage(file, 'user-123', 'item');

      expect(mockCreate).toHaveBeenCalledWith(expect.any(FormData));
    });

    it('should require a user ID', async () => {
      const file = new File([''], 'test.png', { type: 'image/png' });
      await expect(mutator.uploadImage(file, '', 'item')).rejects.toThrow(
        'User ID is required'
      );
    });
  });

  describe('updateAnalysisStatus', () => {
    it('should update status', async () => {
      mockUpdate.mockResolvedValue({
        id: 'img-123',
        analysisStatus: 'processing',
      });

      await mutator.updateAnalysisStatus('img-123', 'processing');

      expect(mockUpdate).toHaveBeenCalledWith(
        'img-123',
        expect.objectContaining({
          analysisStatus: 'processing',
        })
      );
    });
  });
});

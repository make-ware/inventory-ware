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

    it('should surface the per-field reason from a PocketBase rejection', async () => {
      const rejection = Object.assign(new Error('Failed to create record.'), {
        status: 400,
        response: {
          code: 400,
          message: 'Failed to create record.',
          data: {
            file: {
              code: 'validation_file_size_limit',
              message:
                'Failed to upload file - the maximum allowed size is 5242880 bytes.',
            },
          },
        },
      });
      mockCreate.mockRejectedValue(rejection);

      const file = new File([''], 'test.png', { type: 'image/png' });
      await expect(mutator.uploadImage(file, 'user-123')).rejects.toThrow(
        'file: Failed to upload file - the maximum allowed size is 5242880 bytes.'
      );
    });

    it('should leave errors without field details untouched', async () => {
      mockCreate.mockRejectedValue(new Error('Network error'));

      const file = new File([''], 'test.png', { type: 'image/png' });
      await expect(mutator.uploadImage(file, 'user-123')).rejects.toThrow(
        /^Network error$/
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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ContainerMutator } from './container.js';
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

describe('ContainerMutator', () => {
  let mutator: ContainerMutator;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mutator = new ContainerMutator(mockPb);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('create', () => {
    it('should create a container with correct fields', async () => {
      mockCreate.mockResolvedValue({ id: 'new-container', version: 1 });

      const input = {
        containerLabel: 'Test Container',
        containerNotes: 'Notes',
        UserRef: 'user123',
      };

      await mutator.create(input);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          containerLabel: 'Test Container',
          UserRef: 'user123',
        })
      );
    });

    it('should throw validation error for missing fields', async () => {
      const input = {
        // Missing containerLabel
        containerNotes: 'Notes',
        UserRef: 'user123',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;

      await expect(mutator.create(input)).rejects.toThrow();
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update a container', async () => {
      mockUpdate.mockResolvedValue({ id: 'container-123', version: 2 });

      await mutator.update('container-123', {
        containerLabel: 'Updated Label',
      });

      expect(mockUpdate).toHaveBeenCalledWith(
        'container-123',
        expect.objectContaining({
          containerLabel: 'Updated Label',
        })
      );
    });
  });
});

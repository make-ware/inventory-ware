import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UserMutator } from './user.js';
import type { TypedPocketBase } from '../types/index.js';

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockCollection = vi.fn(() => ({
  create: mockCreate,
  update: mockUpdate,
}));

const mockPb = {
  collection: mockCollection,
} as unknown as TypedPocketBase;

describe('UserMutator', () => {
  let mutator: UserMutator;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    mutator = new UserMutator(mockPb);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('create', () => {
    it('should create a user with flattened structure including passwordConfirm', async () => {
      mockCreate.mockResolvedValue({ id: 'new-user' });

      const input = {
        email: 'test@example.com',
        password: 'password123',
        passwordConfirm: 'password123',
        name: 'Test User',
      };

      await mutator.create(input);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'test@example.com',
          passwordConfirm: 'password123',
        })
      );
    });

    it('should throw validation error if passwords do not match', async () => {
      const input = {
        email: 'test@example.com',
        password: 'password123',
        passwordConfirm: 'password456',
        name: 'Test User',
      };

      await expect(mutator.create(input)).rejects.toThrow();
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });
});

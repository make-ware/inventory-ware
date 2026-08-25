import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LabelMutator, generateLabelId } from './label.js';
import type { TypedPocketBase } from '../types/index.js';

const mockCreate = vi.fn();
const mockGetList = vi.fn();
const mockCollection = vi.fn(() => ({
  create: mockCreate,
  getList: mockGetList,
}));

const mockPb = {
  collection: mockCollection,
} as unknown as TypedPocketBase;

describe('generateLabelId', () => {
  it('returns 15 chars of [a-z0-9]', () => {
    expect(generateLabelId()).toMatch(/^[a-z0-9]{15}$/);
  });

  it('does not repeat across calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateLabelId()));
    expect(ids.size).toBe(100);
  });
});

describe('LabelMutator', () => {
  let mutator: LabelMutator;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mutator = new LabelMutator(mockPb);
    mockCreate.mockImplementation(async (input) => ({
      id: 'x'.repeat(15),
      ...input,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('create', () => {
    it('passes an explicit id through to the collection (Zod must not strip it)', async () => {
      const id = generateLabelId();
      await mutator.create({ id, format: 'shipping-4x6', data: '<svg/>' });

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate.mock.calls[0][0]).toMatchObject({
        id,
        format: 'shipping-4x6',
        data: '<svg/>',
      });
    });

    it('passes no id key when none is supplied', async () => {
      await mutator.create({ format: 'qr-only' });

      expect(mockCreate.mock.calls[0][0]).not.toHaveProperty('id');
    });

    it('rejects a non-string data payload', async () => {
      await expect(
        mutator.create({
          format: 'shipping-4x6',
          // The old bug shape: an object written into a text column.
          data: { generated: '2026-01-01' } as unknown as string,
        })
      ).rejects.toThrow();
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('rejects a malformed id', async () => {
      await expect(
        mutator.create({ id: 'UPPERCASE-bad!', format: 'qr-only' })
      ).rejects.toThrow();
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('listForTarget', () => {
    const emptyPage = {
      page: 1,
      perPage: 100,
      totalItems: 0,
      totalPages: 0,
      items: [],
    };

    beforeEach(() => {
      mockGetList.mockResolvedValue(emptyPage);
    });

    it('filters by ItemRef for items, newest first', async () => {
      await mutator.listForTarget('item', 'abc');

      expect(mockGetList).toHaveBeenCalledWith(1, 100, {
        filter: 'ItemRef="abc"',
        sort: '-created',
      });
    });

    it('filters by ContainerRef for containers', async () => {
      await mutator.listForTarget('container', 'def');

      expect(mockGetList.mock.calls[0][2].filter).toBe('ContainerRef="def"');
    });
  });
});

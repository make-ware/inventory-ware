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

  describe('search', () => {
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

    it('returns a paged result so callers can see the true total', async () => {
      mockGetList.mockResolvedValue({ ...emptyPage, totalItems: 137 });

      const result = await mutator.search('drill');

      expect(result.totalItems).toBe(137);
      expect(result.items).toEqual([]);
    });

    it('omits the text clause for an empty query', async () => {
      await mutator.search('');

      // `itemLabel~""` would match everything, so the clause must be dropped.
      expect(mockGetList).toHaveBeenCalledWith(1, 100, {});
    });

    it('matches the query against every searchable field', async () => {
      await mutator.search('drill');

      expect(mockGetList).toHaveBeenCalledWith(1, 100, {
        filter:
          '(itemLabel~"drill" || itemName~"drill" || itemNotes~"drill" || itemManufacturer~"drill")',
      });
    });

    it('escapes a query that would break out of the filter string', async () => {
      await mutator.search('a\\');

      expect(mockGetList.mock.calls[0][2].filter).toBe(
        '(itemLabel~"a\\\\" || itemName~"a\\\\" || itemNotes~"a\\\\" || itemManufacturer~"a\\\\")'
      );
    });

    it('ANDs the filters together, parenthesising each part', async () => {
      await mutator.search('', {
        filters: { itemType: 'hammer', container: 'c1' },
      });

      expect(mockGetList.mock.calls[0][2].filter).toBe(
        '(itemType="hammer") && (ContainerRef="c1")'
      );
    });

    it('combines the text clause with the filters without double-wrapping', async () => {
      await mutator.search('drill', { filters: { itemType: 'hammer' } });

      expect(mockGetList.mock.calls[0][2].filter).toBe(
        '(itemLabel~"drill" || itemName~"drill" || itemNotes~"drill" || itemManufacturer~"drill") && (itemType="hammer")'
      );
    });

    it('filters to unassigned items when hasContainer is false', async () => {
      await mutator.search('', { filters: { hasContainer: false } });

      // PocketBase stores a cleared single relation as the empty string.
      expect(mockGetList.mock.calls[0][2].filter).toBe('ContainerRef=""');
    });

    it('filters to assigned items when hasContainer is true', async () => {
      await mutator.search('', { filters: { hasContainer: true } });

      expect(mockGetList.mock.calls[0][2].filter).toBe('ContainerRef!=""');
    });

    it('does not drop hasContainer: false as if it were absent', async () => {
      // Regression guard: the clause is gated on `!== undefined`, so a
      // truthiness check here would silently return every item.
      await mutator.search('drill', { filters: { hasContainer: false } });

      expect(mockGetList.mock.calls[0][2].filter).toContain('ContainerRef=""');
    });

    it('excludes a single container with excludeContainer', async () => {
      await mutator.search('', { filters: { excludeContainer: 'c1' } });

      expect(mockGetList.mock.calls[0][2].filter).toBe('ContainerRef!="c1"');
    });

    it('combines the LIKE clause with the unassigned filter', async () => {
      await mutator.search('drill', { filters: { hasContainer: false } });

      expect(mockGetList.mock.calls[0][2].filter).toBe(
        '(itemLabel~"drill" || itemName~"drill" || itemNotes~"drill" || itemManufacturer~"drill") && (ContainerRef="")'
      );
    });

    it('ANDs a contradictory container/hasContainer pair rather than reconciling it', async () => {
      // Chosen behaviour, not an accident: the caller asked for both, and both
      // clauses are emitted, so the query matches nothing.
      await mutator.search('', {
        filters: { container: 'c1', hasContainer: false },
      });

      expect(mockGetList.mock.calls[0][2].filter).toBe(
        '(ContainerRef="c1") && (ContainerRef="")'
      );
    });

    it('threads page, perPage, sort and expand through', async () => {
      await mutator.search('', {
        page: 3,
        perPage: 25,
        sort: '-created',
        expand: 'ImageRef',
      });

      expect(mockGetList).toHaveBeenCalledWith(3, 25, {
        sort: '-created',
        expand: 'ImageRef',
      });
    });
  });

  describe('getByContainer', () => {
    beforeEach(() => {
      mockGetList.mockResolvedValue({
        page: 1,
        perPage: 100,
        totalItems: 0,
        totalPages: 0,
        items: [],
      });
    });

    it('filters on the container and accepts the standard query options', async () => {
      await mutator.getByContainer('container9', { page: 2, perPage: 5 });

      expect(mockGetList).toHaveBeenCalledWith(2, 5, {
        filter: 'ContainerRef="container9"',
      });
    });

    it('still emits only the container clause now that hasContainer exists', async () => {
      await mutator.getByContainer('container9');

      expect(mockGetList).toHaveBeenCalledWith(1, 100, {
        filter: 'ContainerRef="container9"',
      });
    });
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

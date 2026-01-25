import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { InventoryProvider } from './inventory-context';
import { ItemMutator, ContainerMutator, ImageMutator } from '@project/shared';

afterAll(() => {
  vi.restoreAllMocks();
});

// Mock dependencies
vi.mock('@/lib/pocketbase-client', () => ({
  default: {
    authStore: { token: 'mock-token' },
    collection: vi.fn(),
  },
}));

// Mock @project/shared
vi.mock('@project/shared', async () => {
  const actual = await vi.importActual('@project/shared');
  return {
    ...actual,
    ItemMutator: vi.fn(),
    ContainerMutator: vi.fn(),
    ImageMutator: vi.fn(),
  };
});

// Mock services
vi.mock('@/services', () => ({
  createInventoryService: vi.fn(() => ({
    getCategoryLibrary: vi
      .fn()
      .mockResolvedValue({ functional: [], specific: [], itemType: [] }),
  })),
}));

describe('InventoryProvider', () => {
  it('fetches items on mount', async () => {
    const mockGetListItems = vi
      .fn()
      .mockResolvedValue({ items: [], totalItems: 0 });
    const mockGetListContainers = vi
      .fn()
      .mockResolvedValue({ items: [], totalItems: 0 });
    const mockGetListImages = vi
      .fn()
      .mockResolvedValue({ items: [], totalItems: 0 });

    // Setup mock implementation
    (ItemMutator as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      function () {
        return {
          getList: mockGetListItems,
          getDistinctCategories: vi
            .fn()
            .mockResolvedValue({ functional: [], specific: [], itemType: [] }),
          search: vi.fn().mockResolvedValue([]),
        };
      }
    );

    (
      ContainerMutator as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(function () {
      return {
        getList: mockGetListContainers,
      };
    });

    (ImageMutator as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      function () {
        return {
          getList: mockGetListImages,
        };
      }
    );

    render(
      <InventoryProvider>
        <div>Test</div>
      </InventoryProvider>
    );

    await waitFor(() => {
      // Expect getList to be called for images (we kept this)
      expect(mockGetListImages).toHaveBeenCalled();
    });

    // Expect getList to NOT be called for items and containers (Optimization)
    expect(mockGetListItems).not.toHaveBeenCalled();
    expect(mockGetListContainers).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, afterAll } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { InventoryProvider } from './inventory-context';
import { ItemMutator, ContainerMutator, ImageMutator } from '@project/shared';
import { createQueryClient } from '@/lib/query';

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

describe('InventoryProvider', () => {
  it('reads nothing on mount', async () => {
    const mockGetListItems = vi
      .fn()
      .mockResolvedValue({ items: [], totalItems: 0 });
    const mockGetListContainers = vi
      .fn()
      .mockResolvedValue({ items: [], totalItems: 0 });
    const mockGetListImages = vi
      .fn()
      .mockResolvedValue({ items: [], totalItems: 0 });
    const mockGetDistinctCategories = vi
      .fn()
      .mockResolvedValue({ functional: [], specific: [], itemType: [] });

    // Setup mock implementation
    (ItemMutator as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      function () {
        return {
          getList: mockGetListItems,
          getDistinctCategories: mockGetDistinctCategories,
          search: vi.fn().mockResolvedValue({
            page: 1,
            perPage: 100,
            totalItems: 0,
            totalPages: 0,
            items: [],
          }),
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
      <QueryClientProvider client={createQueryClient()}>
        <InventoryProvider>
          <div>Test</div>
        </InventoryProvider>
      </QueryClientProvider>
    );

    // `render` flushes mount effects, so anything the provider was going to
    // fetch has already been asked for by the time this runs.
    await Promise.resolve();

    // Every read now belongs to a TanStack query owned by the page that needs
    // it (see @/hooks/use-images and use-categories); the provider is the write
    // path only, so mounting it must not fetch anything.
    expect(mockGetListItems).not.toHaveBeenCalled();
    expect(mockGetListContainers).not.toHaveBeenCalled();
    expect(mockGetListImages).not.toHaveBeenCalled();
    expect(mockGetDistinctCategories).not.toHaveBeenCalled();
  });
});

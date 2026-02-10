import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CleanupPromptDialog } from '../cleanup-prompt-dialog';
import type { Item } from '@project/shared';

// Mock PocketBase client
vi.mock('@/lib/pocketbase-client', () => ({
  default: {
    authStore: {
      token: 'mock-token',
    },
  },
}));

describe('CleanupPromptDialog', () => {
  const mockUnmatchedItems: Item[] = [
    {
      id: 'item1',
      collectionId: 'items',
      collectionName: 'Items',
      created: '2024-01-01',
      updated: '2024-01-01',
      itemLabel: 'Test Item 1',
      itemName: 'Test Item 1',
      itemNotes: 'Test notes',
      categoryFunctional: 'Tools',
      categorySpecific: 'Power Tools',
      itemType: 'Drill',
      itemManufacturer: 'TestCo',
      itemAttributes: [],
      ImageRef: 'image1',
      ContainerRef: 'container1',
      UserRef: 'user1',
    },
    {
      id: 'item2',
      collectionId: 'items',
      collectionName: 'Items',
      created: '2024-01-01',
      updated: '2024-01-01',
      itemLabel: 'Test Item 2',
      itemName: 'Test Item 2',
      itemNotes: '',
      categoryFunctional: 'Electronics',
      categorySpecific: 'Sensors',
      itemType: 'Temperature Sensor',
      itemManufacturer: 'SensorCo',
      itemAttributes: [],
      ImageRef: '',
      ContainerRef: 'container1',
      UserRef: 'user1',
    },
  ];

  const mockGetImageUrl = (item: Item) => {
    if (item.ImageRef) {
      return `https://example.com/images/${item.ImageRef}`;
    }
    return undefined;
  };

  it('renders unmatched items with thumbnails and details', () => {
    const mockOnApply = vi.fn();
    const mockOnOpenChange = vi.fn();

    render(
      <CleanupPromptDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        unmatchedItems={mockUnmatchedItems}
        onApply={mockOnApply}
        getImageUrl={mockGetImageUrl}
      />
    );

    // Check that items are displayed
    expect(screen.getByText('Test Item 1')).toBeInTheDocument();
    expect(screen.getByText('Test Item 2')).toBeInTheDocument();

    // Check that categories are displayed
    expect(screen.getByText('Tools')).toBeInTheDocument();
    expect(screen.getByText('Power Tools')).toBeInTheDocument();
    expect(screen.getByText('Electronics')).toBeInTheDocument();
  });

  it('defaults all items to "keep" action', () => {
    const mockOnApply = vi.fn();
    const mockOnOpenChange = vi.fn();

    render(
      <CleanupPromptDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        unmatchedItems={mockUnmatchedItems}
        onApply={mockOnApply}
        getImageUrl={mockGetImageUrl}
      />
    );

    // Check summary shows all items as "keep"
    expect(screen.getByText(/Keep: 2/)).toBeInTheDocument();
  });

  it('calls onApply with selected actions when Apply button is clicked', async () => {
    const mockOnApply = vi.fn().mockResolvedValue(undefined);
    const mockOnOpenChange = vi.fn();

    render(
      <CleanupPromptDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        unmatchedItems={mockUnmatchedItems}
        onApply={mockOnApply}
        getImageUrl={mockGetImageUrl}
      />
    );

    // Click Apply button
    const applyButton = screen.getByRole('button', { name: /Apply/i });
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(mockOnApply).toHaveBeenCalledWith([
        { itemId: 'item1', action: 'keep' },
        { itemId: 'item2', action: 'keep' },
      ]);
    });

    // Dialog should close on success
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it('displays error message when onApply fails', async () => {
    const mockOnApply = vi.fn().mockRejectedValue(new Error('Test error'));
    const mockOnOpenChange = vi.fn();

    render(
      <CleanupPromptDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        unmatchedItems={mockUnmatchedItems}
        onApply={mockOnApply}
        getImageUrl={mockGetImageUrl}
      />
    );

    // Click Apply button
    const applyButton = screen.getByRole('button', { name: /Apply/i });
    fireEvent.click(applyButton);

    // Wait for error to appear
    await waitFor(() => {
      expect(screen.getByText('Test error')).toBeInTheDocument();
    });

    // Dialog should NOT close on error
    expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('treats all items as "keep" when dismissed without applying', () => {
    const mockOnApply = vi.fn();
    const mockOnOpenChange = vi.fn();

    render(
      <CleanupPromptDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        unmatchedItems={mockUnmatchedItems}
        onApply={mockOnApply}
        getImageUrl={mockGetImageUrl}
      />
    );

    // Click Cancel button
    const cancelButton = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelButton);

    // onOpenChange should be called with false
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);

    // onApply should NOT be called
    expect(mockOnApply).not.toHaveBeenCalled();
  });
});

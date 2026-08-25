import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LabelGeneratorDialog } from '../label-generator-dialog';
import type { Item } from '@project/shared';

// Mock PocketBase client
vi.mock('@/lib/pocketbase-client', () => ({
  default: {
    authStore: {
      token: 'mock-token',
    },
  },
}));

const mockItem: Item = {
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
};

function renderDialog() {
  return render(
    <LabelGeneratorDialog
      open={true}
      onOpenChange={vi.fn()}
      target={mockItem}
      targetType="item"
    />
  );
}

describe('LabelGeneratorDialog', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs to /api-next/labels/generate with the auth token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ svg: '<svg></svg>' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /^generate$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];

    // Regression: this used to POST to /api/labels/generate, which 404s in
    // production because nginx routes /api/* to PocketBase, not Next.js.
    expect(url).toBe('/api-next/labels/generate');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer mock-token');
    expect(JSON.parse(init.body)).toEqual({
      targetId: 'item1',
      targetType: 'item',
      format: 'shipping-4x6',
    });

    // The returned SVG is consumed: the button flips to "Regenerate".
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /regenerate/i })
      ).toBeInTheDocument()
    );
  });

  it('surfaces an error toast when the request fails', async () => {
    const { toast } = await import('sonner');
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderDialog();
    fireEvent.click(screen.getByRole('button', { name: /^generate$/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Failed to generate label')
    );
  });
});

import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ItemMutator, ContainerMutator } from '@project/shared';
import type { Item } from '@project/shared';

import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog';

vi.mock('@/lib/pocketbase-client', () => ({
  default: { authStore: { token: 'mock-token' }, collection: vi.fn() },
}));

// The router object must be stable across renders, as the real one is: the
// page's load effect depends on it, so a fresh object per render would loop.
const { mockRouter } = vi.hoisted(() => ({
  mockRouter: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useParams: () => ({ id: 'c1' }),
  usePathname: () => '/inventory/containers/c1',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@project/shared', async () => {
  const actual = await vi.importActual('@project/shared');
  return { ...actual, ItemMutator: vi.fn(), ContainerMutator: vi.fn() };
});

vi.mock('@/services', () => ({
  createInventoryService: vi.fn(() => ({
    executeCleanupActions: vi.fn(),
  })),
}));

// Stub the heavy children; this test is about the picker and the mutations.
vi.mock('@/components/inventory', () => ({
  ItemCard: ({ item, onDelete }: { item: Item; onDelete: () => void }) => (
    <div>
      <span>{item.itemLabel}</span>
      <button onClick={onDelete}>Remove {item.itemLabel}</button>
    </div>
  ),
}));
vi.mock('@/components/inventory/label-generator-dialog', () => ({
  LabelGeneratorDialog: () => null,
}));
vi.mock('@/components/inventory/container-image-upload', () => ({
  ContainerImageUpload: () => null,
}));
vi.mock('@/components/inventory/cleanup-prompt-dialog', () => ({
  CleanupPromptDialog: () => null,
}));
vi.mock('@/components/image/cropped-image-viewer', () => ({
  CroppedImageViewer: () => null,
}));

import ContainerDetailPage from '@/app/inventory/containers/[id]/page';

class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class MockPointerEvent extends Event {
  button: number;
  ctrlKey: boolean;
  pointerType: string;

  constructor(type: string, props: PointerEventInit = {}) {
    super(type, props);
    this.button = props.button || 0;
    this.ctrlKey = props.ctrlKey || false;
    this.pointerType = props.pointerType || 'mouse';
  }
}

class MockIntersectionObserver {
  constructor() {}
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

const container = {
  id: 'c1',
  containerLabel: 'Shelf A',
  containerNotes: '',
  created: '2026-01-01 00:00:00Z',
  updated: '2026-01-01 00:00:00Z',
};

function makeItem(overrides: Partial<Item> & { id: string }): Item {
  return {
    itemLabel: overrides.id,
    itemName: '',
    itemNotes: '',
    itemManufacturer: '',
    itemType: '',
    ContainerRef: '',
    ...overrides,
  } as Item;
}

const mockSearch = vi.fn();
const mockGetByContainer = vi.fn();
const mockUpdate = vi.fn();

function renderPage() {
  return render(
    <ConfirmDialogProvider>
      <ContainerDetailPage />
    </ConfirmDialogProvider>
  );
}

/** Open the item picker and wait for its first page to render. */
async function openPicker(
  user: ReturnType<typeof userEvent.setup>,
  firstOptionLabel: string
) {
  await user.click(await screen.findByRole('combobox'));
  return screen.findByText(firstOptionLabel);
}

describe('Container detail - add item picker', () => {
  beforeAll(() => {
    global.ResizeObserver = ResizeObserver;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.PointerEvent = MockPointerEvent as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.IntersectionObserver = MockIntersectionObserver as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.IntersectionObserver = MockIntersectionObserver as any;
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetByContainer.mockResolvedValue({
      items: [makeItem({ id: 'inside1', itemLabel: 'Inside item' })],
      page: 1,
      perPage: 100,
      totalItems: 1,
      totalPages: 1,
    });
    mockSearch.mockResolvedValue({
      items: [makeItem({ id: 'free1', itemLabel: 'Free drill' })],
      page: 1,
      perPage: 25,
      totalItems: 1,
      totalPages: 1,
    });
    mockUpdate.mockResolvedValue({ id: 'free1' });

    // `function`, not an arrow: the page calls these with `new`.
    vi.mocked(ItemMutator).mockImplementation(function () {
      return {
        search: mockSearch,
        getByContainer: mockGetByContainer,
        update: mockUpdate,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
    });
    vi.mocked(ContainerMutator).mockImplementation(function () {
      return {
        getById: vi.fn().mockResolvedValue(container),
        delete: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
    });
  });

  it('does not load candidate items until the picker is opened', async () => {
    renderPage();

    await waitFor(() => expect(mockGetByContainer).toHaveBeenCalled());
    // The old page eagerly pulled every item on mount.
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it('offers only unassigned items by default, sorted and paged', async () => {
    const user = userEvent.setup();
    renderPage();

    await openPicker(user, 'Free drill');

    expect(mockSearch).toHaveBeenCalledWith('', {
      page: 1,
      perPage: 25,
      sort: 'itemLabel',
      expand: undefined,
      filters: { hasContainer: false },
    });
  });

  it('sends the typed query to the server as a LIKE search', async () => {
    const user = userEvent.setup({ delay: null });
    renderPage();

    await openPicker(user, 'Free drill');
    await user.type(screen.getByPlaceholderText('Search items...'), 'drill');

    await waitFor(() =>
      expect(mockSearch).toHaveBeenCalledWith(
        'drill',
        expect.objectContaining({ filters: { hasContainer: false } })
      )
    );
  });

  it('switches to every item outside this container when the toggle is ticked', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByLabelText('Show items already in another container')
    );
    await openPicker(user, 'Free drill');

    expect(mockSearch).toHaveBeenLastCalledWith('', {
      page: 1,
      perPage: 25,
      sort: 'itemLabel',
      expand: 'ContainerRef',
      filters: { excludeContainer: 'c1' },
    });
  });

  it('assigns the selected item to this container', async () => {
    const user = userEvent.setup();
    renderPage();

    await openPicker(user, 'Free drill');
    await user.click(screen.getByText('Free drill'));
    await user.click(screen.getByRole('button', { name: /add/i }));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('free1', { ContainerRef: 'c1' })
    );
  });

  it('asks before moving an item out of another container', async () => {
    mockSearch.mockResolvedValue({
      items: [
        makeItem({
          id: 'taken1',
          itemLabel: 'Borrowed saw',
          ContainerRef: 'c2',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          expand: { ContainerRef: { containerLabel: 'Shelf B' } } as any,
        }),
      ],
      page: 1,
      perPage: 25,
      totalItems: 1,
      totalPages: 1,
    });

    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByLabelText('Show items already in another container')
    );
    await openPicker(user, 'Borrowed saw');
    await user.click(screen.getByText('Borrowed saw'));
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(
      await screen.findByText(/currently in "Shelf B". Move it here\?/)
    ).toBeInTheDocument();
    expect(mockUpdate).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('taken1', { ContainerRef: 'c1' })
    );
  });

  it('clears the relation with an empty string when removing an item', async () => {
    // Regression: `undefined` is dropped by JSON.stringify, so the PATCH was a
    // no-op that still reported success and the item reappeared on reload.
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText('Remove Inside item'));
    await user.click(await screen.findByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('inside1', { ContainerRef: '' })
    );
    expect(mockUpdate).not.toHaveBeenCalledWith(
      'inside1',
      expect.objectContaining({ ContainerRef: undefined })
    );
  });
});

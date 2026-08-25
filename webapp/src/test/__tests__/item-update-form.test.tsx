import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'sonner';

import { ItemUpdateForm } from '@/components/inventory/item-update-form';

// Mock ResizeObserver for Combobox/cmdk
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Mock PointerEvent for Combobox
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

describe('ItemUpdateForm', () => {
  beforeAll(() => {
    global.ResizeObserver = ResizeObserver;
    global.PointerEvent = MockPointerEvent as any;
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  });

  const mockCategories = {
    functional: ['Tools', 'Materials'],
    specific: ['Power Tools', 'Hand Tools'],
    itemType: ['Drill', 'Saw', 'Hammer'],
  };

  const defaultValues = {
    itemName: 'Existing Item',
    itemLabel: 'My Item',
    itemNotes: 'Some notes',
    categoryFunctional: 'Tools',
    categorySpecific: 'Power Tools',
    itemType: 'Drill',
    itemManufacturer: 'BrandX',
    itemAttributes: [{ name: 'Voltage', value: '18V' }],
  };

  const defaultProps = {
    defaultValues,
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    categories: mockCategories,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders form with default values', () => {
    render(<ItemUpdateForm {...defaultProps} />);

    expect(screen.getByLabelText(/item name/i)).toHaveValue('Existing Item');
    expect(screen.getByLabelText(/item label/i)).toHaveValue('My Item');
    expect(screen.getByLabelText(/notes/i)).toHaveValue('Some notes');
    expect(screen.getByLabelText(/manufacturer/i)).toHaveValue('BrandX');

    // Check Comboboxes (text content of the button)
    expect(screen.getByLabelText(/functional category/i)).toHaveTextContent(
      'Tools'
    );
    expect(screen.getByLabelText(/specific category/i)).toHaveTextContent(
      'Power Tools'
    );
    expect(screen.getByLabelText(/item type/i)).toHaveTextContent('Drill');

    // Check Attributes
    expect(
      screen.getByPlaceholderText(/name \(e.g., input voltage\)/i)
    ).toHaveValue('Voltage');
    expect(
      screen.getByPlaceholderText(/value \(e.g., 12.0 volts\)/i)
    ).toHaveValue('18V');

    expect(
      screen.getByRole('button', { name: /update item/i })
    ).toBeInTheDocument();
  });

  it('updates values and calls onSubmit with only the changed fields', async () => {
    render(<ItemUpdateForm {...defaultProps} />);

    fireEvent.change(screen.getByLabelText(/item name/i), {
      target: { value: 'Updated Item' },
    });
    fireEvent.change(screen.getByLabelText(/item label/i), {
      target: { value: 'Updated Label' },
    });

    fireEvent.click(screen.getByRole('button', { name: /update item/i }));

    await waitFor(() => {
      expect(defaultProps.onSubmit).toHaveBeenCalledTimes(1);
    });
    // Only the dirty fields are sent — untouched values must not be echoed
    // back, so a concurrent change elsewhere is not clobbered.
    expect(defaultProps.onSubmit).toHaveBeenCalledWith({
      itemName: 'Updated Item',
      itemLabel: 'Updated Label',
    });
  });

  it('displays validation errors when clearing required fields', async () => {
    render(<ItemUpdateForm {...defaultProps} />);

    fireEvent.change(screen.getByLabelText(/item label/i), {
      target: { value: '' },
    });

    fireEvent.click(screen.getByRole('button', { name: /update item/i }));

    await waitFor(() => {
      expect(screen.getByText(/item label is required/i)).toBeInTheDocument();
    });
    // Outside the waitFor: inside, this would pass trivially on the first tick.
    expect(defaultProps.onSubmit).not.toHaveBeenCalled();
    // The catch-all onInvalid handler surfaces the failure too.
    expect(toast.error).toHaveBeenCalled();
  });

  // Regression for issue #57: the AI pipeline never writes boundingBox, so
  // PocketBase hands back `null` for that (and itemAttributes). That null used
  // to fail zodResolver on a field with no rendered <FormMessage />, leaving
  // the Update button apparently dead.
  it('submits an AI-created item whose json columns are null', async () => {
    const onSubmit = vi.fn();
    render(
      <ItemUpdateForm
        {...defaultProps}
        onSubmit={onSubmit}
        defaultValues={{
          ...defaultValues,
          itemAttributes: null,
          boundingBox: null,
          ContainerRef: '',
          ImageRef: '',
        }}
      />
    );

    fireEvent.change(screen.getByLabelText(/item label/i), {
      target: { value: 'Corrected Label' },
    });
    fireEvent.click(screen.getByRole('button', { name: /update item/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit).toHaveBeenCalledWith({ itemLabel: 'Corrected Label' });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('gives visible feedback instead of silently doing nothing when unchanged', async () => {
    render(<ItemUpdateForm {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /update item/i }));

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith('No changes to save');
    });
    expect(defaultProps.onSubmit).not.toHaveBeenCalled();
  });

  it('syncs when defaultValues arrive asynchronously', async () => {
    const onSubmit = vi.fn();
    const { rerender } = render(
      <ItemUpdateForm
        {...defaultProps}
        onSubmit={onSubmit}
        defaultValues={undefined}
      />
    );

    expect(screen.getByLabelText(/item label/i)).toHaveValue('');

    // The edit page fetches the record after mount.
    rerender(
      <ItemUpdateForm
        {...defaultProps}
        onSubmit={onSubmit}
        defaultValues={defaultValues}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/item label/i)).toHaveValue('My Item');
    });
    expect(screen.getByLabelText(/item name/i)).toHaveValue('Existing Item');

    // Edits made after the sync are still tracked as dirty.
    fireEvent.change(screen.getByLabelText(/item label/i), {
      target: { value: 'Edited After Load' },
    });
    fireEvent.click(screen.getByRole('button', { name: /update item/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit).toHaveBeenCalledWith({ itemLabel: 'Edited After Load' });
  });
});

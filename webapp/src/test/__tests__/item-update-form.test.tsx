import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it.skip('updates values and calls onSubmit', async () => {
    const user = userEvent.setup();
    render(<ItemUpdateForm {...defaultProps} />);

    // Update Name
    const nameInput = screen.getByLabelText(/item name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Item');

    // Update Label
    const labelInput = screen.getByLabelText(/item label/i);
    await user.clear(labelInput);
    await user.type(labelInput, 'Updated Label');

    // Submit
    await user.click(screen.getByRole('button', { name: /update item/i }));

    await waitFor(() => {
      expect(defaultProps.onSubmit).toHaveBeenCalledTimes(1);
      expect(defaultProps.onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          itemName: 'Updated Item',
          itemLabel: 'Updated Label',
          // Other values should remain or match what's in the form
          categoryFunctional: 'Tools',
          categorySpecific: 'Power Tools',
          itemType: 'Drill',
        })
      );
    });
  });

  it.skip('displays validation errors when clearing required fields', async () => {
    const user = userEvent.setup();
    render(<ItemUpdateForm {...defaultProps} />);

    // Clear required field (Item Label)
    const labelInput = screen.getByLabelText(/item label/i);
    await user.clear(labelInput);

    // Submit
    await user.click(screen.getByRole('button', { name: /update item/i }));

    await waitFor(() => {
      expect(screen.getByText(/item label is required/i)).toBeInTheDocument();
      expect(defaultProps.onSubmit).not.toHaveBeenCalled();
    });
  });
});

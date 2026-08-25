import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'sonner';

// Mock useInventory hook before importing the component
vi.mock('@/hooks/use-inventory', () => ({
  useInventory: vi.fn(() => ({
    getImageUrl: (imageId?: string) =>
      imageId ? `/images/${imageId}` : undefined,
  })),
}));

import { ContainerUpdateForm } from '@/components/inventory/container-update-form';

describe('ContainerUpdateForm', () => {
  const defaultValues = {
    containerLabel: 'Tool Box A',
    containerNotes: 'Garage shelf',
  };

  const defaultProps = {
    defaultValues,
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders form with default values', () => {
    render(<ContainerUpdateForm {...defaultProps} />);

    expect(screen.getByLabelText(/container label/i)).toHaveValue('Tool Box A');
    expect(screen.getByLabelText(/notes/i)).toHaveValue('Garage shelf');
    expect(
      screen.getByRole('button', { name: /update container/i })
    ).toBeInTheDocument();
  });

  it('updates values and calls onSubmit with only the changed fields', async () => {
    render(<ContainerUpdateForm {...defaultProps} />);

    fireEvent.change(screen.getByLabelText(/container label/i), {
      target: { value: 'Tool Box B' },
    });

    fireEvent.click(screen.getByRole('button', { name: /update container/i }));

    await waitFor(() => {
      expect(defaultProps.onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(defaultProps.onSubmit).toHaveBeenCalledWith({
      containerLabel: 'Tool Box B',
    });
  });

  it('displays validation errors when clearing required fields', async () => {
    render(<ContainerUpdateForm {...defaultProps} />);

    fireEvent.change(screen.getByLabelText(/container label/i), {
      target: { value: '' },
    });

    fireEvent.click(screen.getByRole('button', { name: /update container/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/container label is required/i)
      ).toBeInTheDocument();
    });
    // Outside the waitFor: inside, this would pass trivially on the first tick.
    expect(defaultProps.onSubmit).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  // Regression for issue #57: the AI pipeline never writes boundingBox, so
  // PocketBase hands back `null` for that unset json column. That null used to
  // fail zodResolver on a field with no rendered <FormMessage />, leaving the
  // Update button apparently dead.
  it('submits an AI-created container whose boundingBox is null', async () => {
    const onSubmit = vi.fn();
    render(
      <ContainerUpdateForm
        {...defaultProps}
        onSubmit={onSubmit}
        defaultValues={{
          ...defaultValues,
          boundingBox: null,
          ImageRef: '',
        }}
      />
    );

    fireEvent.change(screen.getByLabelText(/container label/i), {
      target: { value: 'Corrected Label' },
    });
    fireEvent.click(screen.getByRole('button', { name: /update container/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit).toHaveBeenCalledWith({
      containerLabel: 'Corrected Label',
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('gives visible feedback instead of silently doing nothing when unchanged', async () => {
    render(<ContainerUpdateForm {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /update container/i }));

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith('No changes to save');
    });
    expect(defaultProps.onSubmit).not.toHaveBeenCalled();
  });

  it('syncs when defaultValues arrive asynchronously', async () => {
    const onSubmit = vi.fn();
    const { rerender } = render(
      <ContainerUpdateForm
        {...defaultProps}
        onSubmit={onSubmit}
        defaultValues={undefined}
      />
    );

    expect(screen.getByLabelText(/container label/i)).toHaveValue('');

    // The edit page fetches the record after mount.
    rerender(
      <ContainerUpdateForm
        {...defaultProps}
        onSubmit={onSubmit}
        defaultValues={defaultValues}
      />
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/container label/i)).toHaveValue(
        'Tool Box A'
      );
    });

    // Edits made after the sync are still tracked as dirty.
    fireEvent.change(screen.getByLabelText(/container label/i), {
      target: { value: 'Edited After Load' },
    });
    fireEvent.click(screen.getByRole('button', { name: /update container/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });
    expect(onSubmit).toHaveBeenCalledWith({
      containerLabel: 'Edited After Load',
    });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ItemHistory } from '@/components/inventory/item-history';

// Mock PocketBase client
const { mockGetList, mockGetUrl } = vi.hoisted(() => ({
  mockGetList: vi.fn(),
  mockGetUrl: vi.fn(),
}));

vi.mock('@/lib/pocketbase-client', () => ({
  default: {
    collection: () => ({
      getList: mockGetList,
    }),
    files: {
      getUrl: mockGetUrl,
    },
  },
}));

describe('ItemHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    mockGetList.mockReturnValue(new Promise(() => {})); // Never resolves
    render(<ItemHistory itemId="123" />);
    expect(screen.getByText(/recent updates/i)).toBeInTheDocument();
  });

  it('renders history records for text fields', async () => {
    mockGetList.mockResolvedValue({
      items: [
        {
          id: 'rec1',
          created: '2023-01-01T10:00:00.000Z',
          fieldName: 'itemName',
          newValue: 'New Name',
          ItemRef: '123',
          expand: {
            UserRef: {
              username: 'user1',
            },
          },
        },
      ],
    });

    render(<ItemHistory itemId="123" />);

    await waitFor(() => {
      expect(screen.getByText('New Name')).toBeInTheDocument();
    });

    expect(screen.getByText('Name')).toBeInTheDocument(); // Formatted field name
    expect(screen.getByText('user1')).toBeInTheDocument();
  });

  it('renders image updates with link', async () => {
    mockGetList.mockResolvedValue({
      items: [
        {
          id: 'rec_img',
          created: '2023-01-02T10:00:00.000Z',
          fieldName: 'ImageRef',
          newValue: 'img_filename.jpg',
          ItemRef: '123',
        },
      ],
    });
    mockGetUrl.mockReturnValue('http://pb/img.jpg');

    render(<ItemHistory itemId="123" />);

    await waitFor(() => {
      expect(screen.getByText('Image')).toBeInTheDocument();
    });

    const link = screen.getByRole('link', { name: /view image/i });
    expect(link).toHaveAttribute('href', 'http://pb/img.jpg');
    expect(mockGetUrl).toHaveBeenCalledWith(
      { collectionId: 'Items', id: '123' },
      'img_filename.jpg'
    );
  });

  it('renders container updates with link', async () => {
    mockGetList.mockResolvedValue({
      items: [
        {
          id: 'rec_cont',
          created: '2023-01-03T10:00:00.000Z',
          fieldName: 'container',
          newValue: 'cont_123',
          ItemRef: '123',
        },
      ],
    });

    render(<ItemHistory itemId="123" />);

    await waitFor(() => {
      expect(screen.getByText('Container')).toBeInTheDocument();
    });

    const link = screen.getByRole('link', { name: /view container/i });
    expect(link).toHaveAttribute('href', '/inventory/containers/cont_123');
  });

  it('renders container removal', async () => {
    mockGetList.mockResolvedValue({
      items: [
        {
          id: 'rec_cont_rem',
          created: '2023-01-04T10:00:00.000Z',
          fieldName: 'container',
          newValue: '',
          ItemRef: '123',
        },
      ],
    });

    render(<ItemHistory itemId="123" />);

    await waitFor(() => {
      expect(screen.getByText('Container')).toBeInTheDocument();
    });

    expect(screen.getByText(/removed from container/i)).toBeInTheDocument();
  });

  it('renders nothing if no records', async () => {
    mockGetList.mockResolvedValue({ items: [] });
    const { container } = render(<ItemHistory itemId="123" />);

    await waitFor(() => {
      expect(mockGetList).toHaveBeenCalled();
    });

    expect(container.firstChild).toBeNull();
  });
});

import React from 'react';
import { render, act, waitFor, screen } from '@testing-library/react';
import {
  UploadProvider,
  useUpload,
  UploadItem,
} from '../contexts/upload-context';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toast } from 'sonner';

// Mock ImageMutator
const mockUploadImage = vi.fn();

vi.mock('@project/shared', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    ImageMutator: class {
      constructor() {}
      uploadImage = mockUploadImage;
    },
  };
});

// Mock PocketBase client
vi.mock('@/lib/pocketbase-client', () => ({
  default: {
    authStore: {
      record: { id: 'test-user-id' },
      token: 'test-token',
    },
  },
}));

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const TestComponent = () => {
  const { addFiles, queue, clearCompleted } = useUpload();
  return (
    <div>
      <button
        onClick={() => {
          const file = new File(['content'], 'fail.jpg', {
            type: 'image/jpeg',
          });
          addFiles([file]);
        }}
        data-testid="upload-btn"
      >
        Upload
      </button>
      <button onClick={clearCompleted} data-testid="clear-btn">
        Clear
      </button>
      <ul>
        {queue.map((item) => (
          <li key={item.id} data-testid="queue-item">
            {item.fileName} - {item.status}
          </li>
        ))}
      </ul>
    </div>
  );
};

describe('UploadContext Failed Removal', () => {
  beforeEach(() => {
    mockUploadImage.mockReset();
  });

  it('allows clearing failed uploads', async () => {
    // Mock upload failure
    mockUploadImage.mockRejectedValue(new Error('Upload failed'));

    render(
      <UploadProvider>
        <TestComponent />
      </UploadProvider>
    );

    // Trigger upload
    await act(async () => {
      screen.getByTestId('upload-btn').click();
    });

    // Wait for failure
    await waitFor(() => {
      const items = screen.getAllByTestId('queue-item');
      expect(items[0]).toHaveTextContent('fail.jpg - failed');
    });

    // Clear completed
    await act(async () => {
      screen.getByTestId('clear-btn').click();
    });

    // Expect queue to be empty
    await waitFor(() => {
      const items = screen.queryAllByTestId('queue-item');
      expect(items.length).toBe(0);
    });
  });

  it('allows removing individual uploads', async () => {
    // Mock upload failure
    mockUploadImage.mockRejectedValue(new Error('Upload failed'));

    const TestComponentWithRemove = () => {
      const { addFiles, queue, removeUpload } = useUpload();
      return (
        <div>
          <button
            onClick={() => {
              const file = new File(['content'], 'fail.jpg', {
                type: 'image/jpeg',
              });
              addFiles([file]);
            }}
            data-testid="upload-btn"
          >
            Upload
          </button>
          <ul>
            {queue.map((item) => (
              <li key={item.id} data-testid="queue-item">
                {item.fileName} - {item.status}
                <button
                  onClick={() => removeUpload(item.id)}
                  data-testid={`remove-btn-${item.fileName}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      );
    };

    render(
      <UploadProvider>
        <TestComponentWithRemove />
      </UploadProvider>
    );

    // Trigger upload
    await act(async () => {
      screen.getByTestId('upload-btn').click();
    });

    // Wait for failure
    await waitFor(() => {
      const items = screen.getAllByTestId('queue-item');
      expect(items[0]).toHaveTextContent('fail.jpg - failed');
    });

    // Remove individual item
    await act(async () => {
      screen.getByTestId('remove-btn-fail.jpg').click();
    });

    // Expect queue to be empty
    await waitFor(() => {
      const items = screen.queryAllByTestId('queue-item');
      expect(items.length).toBe(0);
    });
  });
});

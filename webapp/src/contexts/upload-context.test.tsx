import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { UploadProvider, useUpload } from './upload-context';
import pb from '@/lib/pocketbase-client';

// Mock pb
vi.mock('@/lib/pocketbase-client', () => ({
  default: {
    authStore: {
      token: 'mock-token',
      record: { id: 'user-1' },
      isValid: true,
      onChange: vi.fn(() => vi.fn()), // Return unsubscribe fn
    },
    collection: vi.fn(),
  },
}));

// Mock ImageMutator
vi.mock('@project/shared', async () => {
  return {
    ImageMutator: vi.fn(),
  };
});

// Setup mock implementation
import { ImageMutator } from '@project/shared';
(ImageMutator as unknown as ReturnType<typeof vi.fn>).mockImplementation(function() {
  return {
    uploadImage: vi.fn().mockResolvedValue({ id: 'img-1' }),
  };
});

// Mock fetch
global.fetch = vi.fn();

describe('UploadContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('provides initial state', () => {
    const { result } = renderHook(() => useUpload(), { wrapper: UploadProvider });
    expect(result.current.queue).toEqual([]);
  });

  it('can clear the queue', async () => {
    const { result } = renderHook(() => useUpload(), { wrapper: UploadProvider });

    const file = new File(['content'], 'test.png', { type: 'image/png' });

    await act(async () => {
      // Mock uploadImage to not resolve immediately or fail, but addFiles updates queue synchronously first
      await result.current.addFiles([file]);
    });

    expect(result.current.queue.length).toBe(1);

    expect(result.current.clearQueue).toBeDefined();

    act(() => {
      result.current.clearQueue();
    });

    expect(result.current.queue.length).toBe(0);
  });

  it('can remove an item', async () => {
    const { result } = renderHook(() => useUpload(), { wrapper: UploadProvider });
    const file = new File(['content'], 'test.png', { type: 'image/png' });

    await act(async () => {
      await result.current.addFiles([file]);
    });

    expect(result.current.queue.length).toBe(1);
    const itemId = result.current.queue[0].id;

    expect(result.current.removeItem).toBeDefined();

    act(() => {
        result.current.removeItem(itemId);
    });

    expect(result.current.queue.length).toBe(0);
  });

  it('clears queue on logout', async () => {
      const { result } = renderHook(() => useUpload(), { wrapper: UploadProvider });
      const file = new File(['content'], 'test.png', { type: 'image/png' });

      await act(async () => {
        await result.current.addFiles([file]);
      });

      expect(result.current.queue.length).toBe(1);

      // Simulate logout
      // We need to trigger the callback registered with onChange
      // First, get the callback
      const onChangeMock = pb.authStore.onChange as unknown as ReturnType<typeof vi.fn>;
      // Expect onChange to have been called once
      expect(onChangeMock).toHaveBeenCalled();

      const callback = onChangeMock.mock.calls[0][0];

      act(() => {
          callback('', null); // Token empty, model null
      });

      expect(result.current.queue.length).toBe(0);
  });
});

import React from 'react';
import { render, act, waitFor } from '@testing-library/react';
import { UploadProvider, useUpload } from '../contexts/upload-context';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock execution log
const executionLog: { id: string; event: 'start' | 'end'; time: number }[] = [];

// Mock ImageMutator
const mockUploadImage = vi.fn().mockImplementation(async (file: File) => {
  const id = file.name;
  executionLog.push({ id, event: 'start', time: Date.now() });
  await new Promise((resolve) => setTimeout(resolve, 50)); // 50ms delay
  executionLog.push({ id, event: 'end', time: Date.now() });
  return { id: 'mock-image-id-' + id };
});

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

// Mock fetch for analysis
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({}),
} as Response);

const TestComponent = () => {
  const { addFiles } = useUpload();
  return (
    <button
      onClick={() => {
        const file1 = new File(['content'], 'file1.jpg', { type: 'image/jpeg' });
        const file2 = new File(['content'], 'file2.jpg', { type: 'image/jpeg' });
        addFiles([file1, file2]);
      }}
    >
      Upload
    </button>
  );
};

describe('UploadContext Performance', () => {
  beforeEach(() => {
    executionLog.length = 0;
    mockUploadImage.mockClear();
    vi.useRealTimers();
  });

  it('processes files in parallel (optimized behavior)', async () => {
    const { getByText } = render(
      <UploadProvider>
        <TestComponent />
      </UploadProvider>
    );

    await act(async () => {
      getByText('Upload').click();
    });

    // Wait for both uploads to complete
    await waitFor(() => {
      expect(mockUploadImage).toHaveBeenCalledTimes(2);
    }, { timeout: 1000 });

    // Also wait a bit for the async operations to fully flush their logs
    await new Promise(r => setTimeout(r, 150));

    // Analyze the log
    const file1Start = executionLog.find((l) => l.id === 'file1.jpg' && l.event === 'start');
    const file1End = executionLog.find((l) => l.id === 'file1.jpg' && l.event === 'end');
    const file2Start = executionLog.find((l) => l.id === 'file2.jpg' && l.event === 'start');
    const file2End = executionLog.find((l) => l.id === 'file2.jpg' && l.event === 'end');

    expect(file1Start).toBeDefined();
    expect(file1End).toBeDefined();
    expect(file2Start).toBeDefined();
    expect(file2End).toBeDefined();

    // Check parallel execution: File 2 must start BEFORE File 1 ends
    console.log('Execution Log:', executionLog);

    if (file1Start && file1End && file2Start && file2End) {
        expect(file2Start.time).toBeLessThan(file1End.time);
    }
  });
});

'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { ImageMutator } from '@project/shared';
import pb from '@/lib/pocketbase-client';
import { toast } from 'sonner';

export type UploadStatus =
  | 'idle'
  | 'uploading'
  | 'analyzing'
  | 'completed'
  | 'failed';

export interface UploadItem {
  id: string; // Internal unique ID or Image ID once uploaded
  fileName: string;
  status: UploadStatus;
  progress: number;
  error?: string;
  imageId?: string;
  isManualMode?: boolean;
}

interface UploadContextType {
  queue: UploadItem[];
  addFiles: (files: File[], isManualMode?: boolean) => Promise<void>;
  clearCompleted: () => void;
  isProcessing: boolean;
}

const UploadContext = createContext<UploadContextType | undefined>(undefined);

const STORAGE_KEY = 'inventory_upload_queue';

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const imageMutator = useRef(new ImageMutator(pb)).current;

  // Persist queue to localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as UploadItem[];
        // Only keep incomplete or recently completed items
        const filtered = parsed.filter(
          (item) => item.status !== 'completed' && item.status !== 'failed'
        );
        setQueue(filtered);
      } catch (e) {
        console.error('Failed to parse saved upload queue', e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  }, [queue]);

  const addFiles = useCallback(
    async (files: File[], isManualMode = false) => {
      const newItems: UploadItem[] = files.map((file) => ({
        id: Math.random().toString(36).substring(7),
        fileName: file.name,
        status: 'idle',
        progress: 0,
        isManualMode,
      }));

      setQueue((prev) => [...prev, ...newItems]);

      const processFile = async (file: File, item: UploadItem) => {
        try {
          // 1. Upload stage
          setQueue((prev) =>
            prev.map((it) =>
              it.id === item.id
                ? { ...it, status: 'uploading', progress: 10 }
                : it
            )
          );

          // Get the authenticated user ID
          const userId = pb.authStore.record?.id;
          if (!userId) {
            throw new Error('User authentication required');
          }

          const image = await imageMutator.uploadImage(file, userId);

          setQueue((prev) =>
            prev.map((it) =>
              it.id === item.id
                ? {
                    ...it,
                    status: isManualMode ? 'completed' : 'analyzing',
                    progress: 50,
                    imageId: image.id,
                  }
                : it
            )
          );

          if (isManualMode) {
            toast.success(`Uploaded ${file.name}`);
            return;
          }

          // 2. Analysis stage
          const authToken = pb.authStore.token;
          const response = await fetch('/api-next/analyze-image', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            },
            body: JSON.stringify({ imageId: image.id }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Analysis failed');
          }

          setQueue((prev) =>
            prev.map((it) =>
              it.id === item.id
                ? { ...it, status: 'completed', progress: 100 }
                : it
            )
          );

          // Trigger a refresh of the inventory data if we are on the inventory page
          // This can be done via a custom event or by the page watching the queue
          window.dispatchEvent(new CustomEvent('inventory-updated'));
        } catch (error) {
          console.error(`Failed to process ${file.name}:`, error);
          setQueue((prev) =>
            prev.map((it) =>
              it.id === item.id
                ? {
                    ...it,
                    status: 'failed',
                    error:
                      error instanceof Error ? error.message : 'Unknown error',
                  }
                : it
            )
          );
          toast.error(`Failed to process ${file.name}`);
        }
      };

      // Process files with concurrency limit
      const CONCURRENCY_LIMIT = 3;
      const activePromises: Promise<void>[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const item = newItems[i];

        if (activePromises.length >= CONCURRENCY_LIMIT) {
          await Promise.race(activePromises);
        }

        const promise = processFile(file, item).then(() => {
          activePromises.splice(activePromises.indexOf(promise), 1);
        });
        activePromises.push(promise);
      }

      await Promise.all(activePromises);
    },
    [imageMutator]
  );

  const clearCompleted = useCallback(() => {
    setQueue((prev) =>
      prev.filter(
        (item) => item.status !== 'completed' && item.status !== 'failed'
      )
    );
  }, []);

  const isProcessing = queue.some(
    (item) => item.status === 'uploading' || item.status === 'analyzing'
  );

  return (
    <UploadContext.Provider
      value={{ queue, addFiles, clearCompleted, isProcessing }}
    >
      {children}
    </UploadContext.Provider>
  );
}

export function useUpload() {
  const context = useContext(UploadContext);
  if (context === undefined) {
    throw new Error('useUpload must be used within an UploadProvider');
  }
  return context;
}

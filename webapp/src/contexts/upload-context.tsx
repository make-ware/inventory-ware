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
  retryItem: (id: string) => Promise<void>;
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

  // Subscribe to real-time updates for image analysis status
  useEffect(() => {
    // Subscribe to all changes in Images collection
    // In a production app with many users, we should filter or be more selective,
    // but here we are primarily interested in our own uploaded images.
    pb.collection('Images').subscribe('*', (e) => {
      if (e.action === 'update') {
        setQueue((prev) => {
          const found = prev.find((item) => item.imageId === e.record.id);
          if (found) {
            // Update status based on record
            const status = e.record.analysisStatus; // 'pending' | 'processing' | 'completed' | 'failed'
            let uploadStatus: UploadStatus = found.status;
            let progress = found.progress;

            if (status === 'processing') {
              uploadStatus = 'analyzing';
              progress = 50;
            } else if (status === 'completed') {
              uploadStatus = 'completed';
              progress = 100;
              // Dispatch event only once when completing
              if (found.status !== 'completed') {
                window.dispatchEvent(new CustomEvent('inventory-updated'));
                toast.success(`Processed ${found.fileName}`);
              }
            } else if (status === 'failed') {
              uploadStatus = 'failed';
              // Don't show toast for failure here to avoid spam if many fail,
              // relying on UI to show error state.
            }

            if (uploadStatus !== found.status) {
              return prev.map((item) =>
                item.id === found.id
                  ? {
                      ...item,
                      status: uploadStatus,
                      progress,
                      error:
                        status === 'failed' ? 'Analysis failed' : undefined,
                    }
                  : item
              );
            }
          }
          return prev;
        });
      }
    });

    return () => {
      pb.collection('Images').unsubscribe('*');
    };
  }, []);

  const triggerAnalysis = useCallback(async (imageId: string, itemId: string) => {
    const authToken = pb.authStore.token;
    try {
      const response = await fetch('/api-next/analyze-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ imageId: imageId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Analysis failed');
      }

      // Mark as completed on successful response as a fallback to Realtime
      setQueue((prev) => {
        const item = prev.find((it) => it.id === itemId);
        if (item && item.status !== 'completed') {
          // Only dispatch update if we are changing state
          if (item.status !== 'completed') {
            window.dispatchEvent(new CustomEvent('inventory-updated'));
            toast.success(`Processed ${item.fileName}`);
          }
          return prev.map((it) =>
            it.id === itemId
              ? { ...it, status: 'completed', progress: 100 }
              : it
          );
        }
        return prev;
      });
    } catch (error) {
      console.error(`Failed to trigger analysis for image ${imageId}:`, error);
      setQueue((prev) =>
        prev.map((it) =>
          it.id === itemId
            ? {
                ...it,
                status: 'failed',
                error: error instanceof Error ? error.message : 'Unknown error',
              }
            : it
        )
      );
      toast.error(`Failed to analyze image`);
    }
  }, []);

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

      // Process each file
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const item = newItems[i];

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
                    status: isManualMode ? 'completed' : 'analyzing', // Set to analyzing to indicate background work
                    progress: isManualMode ? 100 : 20, // 20% uploaded, waiting for analysis
                    imageId: image.id,
                  }
                : it
            )
          );

          if (isManualMode) {
            toast.success(`Uploaded ${file.name}`);
            continue;
          }

          // Trigger analysis asynchronously (fire and forget)
          // We don't await this, so the loop continues to the next file upload immediately
          triggerAnalysis(image.id, item.id);

        } catch (error) {
          console.error(`Failed to upload ${file.name}:`, error);
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
          toast.error(`Failed to upload ${file.name}`);
        }
      }
    },
    [imageMutator, triggerAnalysis]
  );

  const retryItem = useCallback(
    async (id: string) => {
      // Optimistically update status to analyzing
      setQueue((prev) => {
        return prev.map((it) =>
          it.id === id
            ? { ...it, status: 'analyzing', error: undefined, progress: 20 }
            : it
        );
      });

      const item = queue.find((it) => it.id === id);
      if (!item || !item.imageId) return;

      // Call the analysis API directly
      triggerAnalysis(item.imageId, item.id);
    },
    [queue, triggerAnalysis]
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
      value={{ queue, addFiles, retryItem, clearCompleted, isProcessing }}
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

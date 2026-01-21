'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface FileUploadProgress {
  file: File;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  error?: string;
}

interface ImageUploadProps {
  onUpload: (file: File) => Promise<void>;
  isProcessing?: boolean;
  acceptedTypes?: string[];
}

export function ImageUpload({
  onUpload,
  isProcessing,
  acceptedTypes = ['image/jpeg', 'image/png', 'image/webp'],
}: ImageUploadProps) {
  const [uploadQueue, setUploadQueue] = useState<FileUploadProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const processFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      // Initialize queue with all files as pending
      const initialQueue: FileUploadProgress[] = files.map((file) => ({
        file,
        status: 'pending',
      }));
      setUploadQueue(initialQueue);
      setIsUploading(true);

      // Process files sequentially
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Update status to uploading
        setUploadQueue((prev) =>
          prev.map((item, idx) =>
            idx === i ? { ...item, status: 'uploading' } : item
          )
        );

        try {
          // Update status to processing
          setUploadQueue((prev) =>
            prev.map((item, idx) =>
              idx === i ? { ...item, status: 'processing' } : item
            )
          );

          await onUpload(file);

          // Mark as completed
          setUploadQueue((prev) =>
            prev.map((item, idx) =>
              idx === i ? { ...item, status: 'completed' } : item
            )
          );
        } catch (error) {
          // Mark as error
          setUploadQueue((prev) =>
            prev.map((item, idx) =>
              idx === i
                ? {
                    ...item,
                    status: 'error',
                    error:
                      error instanceof Error ? error.message : 'Upload failed',
                  }
                : item
            )
          );
        }
      }

      setIsUploading(false);

      // Clear completed uploads after 3 seconds
      setTimeout(() => {
        setUploadQueue([]);
      }, 3000);
    },
    [onUpload]
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      processFiles(acceptedFiles);
    },
    [processFiles]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: Object.fromEntries(acceptedTypes.map((t) => [t, []])),
    multiple: true,
    disabled: isProcessing || isUploading,
  });

  const getStatusIcon = () => {
    if (isProcessing || isUploading) {
      return (
        <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
      );
    }
    if (
      uploadQueue.length > 0 &&
      uploadQueue.every((item) => item.status === 'completed')
    ) {
      return <CheckCircle className="h-12 w-12 text-green-500" />;
    }
    if (
      uploadQueue.length > 0 &&
      uploadQueue.some((item) => item.status === 'error')
    ) {
      return <XCircle className="h-12 w-12 text-red-500" />;
    }
    return <Upload className="h-12 w-12 text-muted-foreground" />;
  };

  const getStatusText = () => {
    if (uploadQueue.length > 0) {
      const processing = uploadQueue.filter(
        (item) => item.status === 'uploading' || item.status === 'processing'
      ).length;
      const completed = uploadQueue.filter(
        (item) => item.status === 'completed'
      ).length;
      const errors = uploadQueue.filter(
        (item) => item.status === 'error'
      ).length;

      if (processing > 0) {
        return `Processing ${completed + 1} of ${uploadQueue.length}...`;
      }
      if (completed === uploadQueue.length) {
        return `Successfully processed ${completed} image${completed !== 1 ? 's' : ''}!`;
      }
      if (errors > 0 && completed === 0) {
        return `${errors} upload${errors !== 1 ? 's' : ''} failed`;
      }
      return `Processed ${completed}/${uploadQueue.length}${errors > 0 ? ` (${errors} failed)` : ''}`;
    }
    if (isProcessing || isUploading) {
      return 'AI is analyzing your image...';
    }
    if (isDragActive) {
      return 'Drop images here (multiple files supported)';
    }
    return 'Drag & drop images, or click to select (multiple files supported)';
  };

  const getProgressValue = () => {
    if (uploadQueue.length === 0) return 0;
    const completed = uploadQueue.filter(
      (item) => item.status === 'completed' || item.status === 'error'
    ).length;
    return (completed / uploadQueue.length) * 100;
  };

  const hasErrors = uploadQueue.some((item) => item.status === 'error');
  const allCompleted =
    uploadQueue.length > 0 &&
    uploadQueue.every(
      (item) => item.status === 'completed' || item.status === 'error'
    );

  return (
    <div className="space-y-4">
      <Card
        className={cn(
          'border-2 border-dashed transition-colors',
          isDragActive && 'border-primary bg-primary/5',
          hasErrors && !allCompleted && 'border-red-500 bg-red-50',
          allCompleted && !hasErrors && 'border-green-500 bg-green-50'
        )}
      >
        <CardContent
          {...getRootProps()}
          className="flex flex-col items-center justify-center p-8 cursor-pointer"
        >
          <input {...getInputProps()} />
          {getStatusIcon()}
          <p
            className={cn(
              'mt-4 text-sm text-center',
              hasErrors && !allCompleted && 'text-red-600',
              allCompleted && !hasErrors && 'text-green-600',
              uploadQueue.length === 0 && 'text-muted-foreground'
            )}
          >
            {getStatusText()}
          </p>
          {uploadQueue.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Supported formats: JPEG, PNG, WebP
            </p>
          )}
          {uploadQueue.length > 0 && (
            <div className="w-full mt-4 space-y-2">
              <Progress value={getProgressValue()} className="h-2" />
              <div className="max-h-48 overflow-y-auto space-y-1">
                {uploadQueue.map((item, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'flex items-center justify-between text-xs p-2 rounded',
                      item.status === 'error' && 'bg-red-50 text-red-700',
                      item.status === 'completed' &&
                        'bg-green-50 text-green-700',
                      (item.status === 'uploading' ||
                        item.status === 'processing') &&
                        'bg-blue-50 text-blue-700',
                      item.status === 'pending' && 'bg-gray-50 text-gray-600'
                    )}
                  >
                    <span className="flex-1 truncate">{item.file.name}</span>
                    <div className="flex items-center gap-2 ml-2">
                      {item.status === 'uploading' && (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Uploading...</span>
                        </>
                      )}
                      {item.status === 'processing' && (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" />
                          <span>Processing...</span>
                        </>
                      )}
                      {item.status === 'completed' && (
                        <>
                          <CheckCircle className="h-3 w-3" />
                          <span>Done</span>
                        </>
                      )}
                      {item.status === 'error' && (
                        <>
                          <XCircle className="h-3 w-3" />
                          <span
                            className="truncate max-w-[100px]"
                            title={item.error}
                          >
                            {item.error || 'Failed'}
                          </span>
                        </>
                      )}
                      {item.status === 'pending' && (
                        <span className="text-gray-400">Waiting...</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

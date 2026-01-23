'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useUpload } from '@/contexts/upload-context';

interface ImageUploadProps {
  isManualMode?: boolean;
  acceptedTypes?: string[];
}

export function ImageUpload({
  isManualMode = false,
  acceptedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
  ],
}: ImageUploadProps) {
  const { addFiles, isProcessing, queue } = useUpload();

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      addFiles(acceptedFiles, isManualMode);
    },
    [addFiles, isManualMode]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: Object.fromEntries(acceptedTypes.map((t) => [t, []])),
    multiple: true,
    disabled: isProcessing,
  });

  const getStatusIcon = () => {
    if (isProcessing) {
      return (
        <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
      );
    }
    return <Upload className="h-12 w-12 text-muted-foreground" />;
  };

  const getStatusText = () => {
    if (isProcessing) {
      return 'Processing your images in the background...';
    }
    if (isDragActive) {
      return 'Drop images here (multiple files supported)';
    }
    return 'Drag & drop images, or click to select (multiple files supported)';
  };

  return (
    <div className="space-y-4">
      <Card
        className={cn(
          'border-2 border-dashed transition-colors',
          isDragActive && 'border-primary bg-primary/5',
          isProcessing && 'border-primary/50'
        )}
      >
        <CardContent
          {...getRootProps()}
          className="flex flex-col items-center justify-center p-8 cursor-pointer"
        >
          <input {...getInputProps()} />
          {getStatusIcon()}
          <p className="mt-4 text-sm text-center text-muted-foreground">
            {getStatusText()}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Supported formats: JPEG, PNG, WebP, HEIC
          </p>
        </CardContent>
      </Card>

      {queue.length > 0 && !isProcessing && (
        <p className="text-[10px] text-center text-muted-foreground">
          View background progress in the bottom right tracker.
        </p>
      )}
    </div>
  );
}

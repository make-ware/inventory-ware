'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useUpload } from '@/contexts/upload-context';

interface ImageUploadProps {
  isManualMode?: boolean;
  acceptedTypes?: string[];
}

export function ImageUpload({
  isManualMode = false,
  acceptedTypes = ['image/jpeg', 'image/png', 'image/webp'],
}: ImageUploadProps) {
  const { addFiles, queue } = useUpload();

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
  });

  const getStatusIcon = () => {
    return <Upload className="h-12 w-12 text-muted-foreground" />;
  };

  const getStatusText = () => {
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
          isDragActive && 'border-primary bg-primary/5'
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
            Supported formats: JPEG, PNG, WebP
          </p>
        </CardContent>
      </Card>

      {queue.length > 0 && (
        <p className="text-[10px] text-center text-muted-foreground">
          View background progress in the bottom right tracker.
        </p>
      )}
    </div>
  );
}

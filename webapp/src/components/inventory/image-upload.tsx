'use client';

import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Loader2 } from 'lucide-react';
import { useUpload } from '@/contexts/upload-context';
import { UploadDropzone } from './upload-dropzone';

interface ImageUploadProps {
  isManualMode?: boolean;
  acceptedTypes?: string[];
  className?: string;
}

export function ImageUpload({
  isManualMode = false,
  acceptedTypes = ['image/jpeg', 'image/png', 'image/webp'],
  className,
}: ImageUploadProps) {
  const { addFiles, isProcessing } = useUpload();

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

  const getStatusText = () => {
    if (isProcessing) {
      return 'Processing your images in the background...';
    }
    if (isDragActive) {
      return 'Drop images here';
    }
    return 'Drag & drop images, or click to select';
  };

  return (
    <UploadDropzone
      rootProps={getRootProps()}
      inputProps={getInputProps()}
      className={className}
      state={isProcessing ? 'busy' : isDragActive ? 'active' : 'idle'}
      icon={
        isProcessing ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Upload className="h-5 w-5" />
        )
      }
      label={getStatusText()}
      hint={
        isProcessing
          ? 'Track progress in the bottom right tracker'
          : 'JPEG, PNG or WebP — multiple files supported'
      }
    />
  );
}

'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import pb from '@/lib/pocketbase-client';
import { UploadDropzone } from './upload-dropzone';
import type { ItemsResponse, ImagesResponse } from '@project/shared';

interface ItemImageUploadProps {
  itemId: string;
  onSuccess?: (result: ItemUploadResult) => void;
  onError?: (error: Error) => void;
  acceptedTypes?: string[];
  className?: string;
}

interface ItemUploadResult {
  success: boolean;
  image: ImagesResponse;
  item: ItemsResponse;
}

type UploadStage = 'idle' | 'uploading' | 'analyzing' | 'success' | 'error';

export function ItemImageUpload({
  itemId,
  onSuccess,
  onError,
  acceptedTypes = ['image/jpeg', 'image/png', 'image/webp'],
  className,
}: ItemImageUploadProps) {
  const [stage, setStage] = useState<UploadStage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ItemUploadResult | null>(null);

  const uploadImage = useCallback(
    async (file: File) => {
      try {
        setStage('uploading');
        setError(null);
        setResult(null);

        // Create form data with file and itemId
        const formData = new FormData();
        formData.append('file', file);
        formData.append('itemId', itemId);

        // Get auth token
        const authToken = pb.authStore.token;

        // POST to API route
        setStage('analyzing');
        const response = await fetch('/api-next/item-upload', {
          method: 'POST',
          headers: {
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Upload failed');
        }

        const data: ItemUploadResult = await response.json();

        setStage('success');
        setResult(data);

        // Trigger success callback
        if (onSuccess) {
          onSuccess(data);
        }

        // Dispatch event for other components to refresh
        window.dispatchEvent(new CustomEvent('inventory-updated'));
      } catch (err) {
        console.error('Item image upload failed:', err);
        const errorMessage =
          err instanceof Error ? err.message : 'Upload failed';
        setError(errorMessage);
        setStage('error');

        if (onError && err instanceof Error) {
          onError(err);
        }
      }
    },
    [itemId, onSuccess, onError]
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      // Only process the first file for item upload
      uploadImage(acceptedFiles[0]);
    },
    [uploadImage]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: Object.fromEntries(acceptedTypes.map((t) => [t, []])),
    multiple: false,
    disabled: stage === 'uploading' || stage === 'analyzing',
  });

  const isProcessing = stage === 'uploading' || stage === 'analyzing';

  const getStatusIcon = () => {
    if (stage === 'success') {
      return <CheckCircle2 className="h-5 w-5 text-green-500" />;
    }
    if (stage === 'error') {
      return <AlertCircle className="h-5 w-5 text-destructive" />;
    }
    if (isProcessing) {
      return <Loader2 className="h-5 w-5 animate-spin" />;
    }
    return <Upload className="h-5 w-5" />;
  };

  const getDropzoneState = () => {
    if (stage === 'success') return 'success' as const;
    if (stage === 'error') return 'error' as const;
    if (isProcessing) return 'busy' as const;
    if (isDragActive) return 'active' as const;
    return 'idle' as const;
  };

  const getStatusText = () => {
    if (stage === 'uploading') {
      return 'Uploading image...';
    }
    if (stage === 'analyzing') {
      return 'Analyzing image with AI...';
    }
    if (stage === 'success') {
      return 'Upload complete!';
    }
    if (stage === 'error') {
      return 'Upload failed';
    }
    if (isDragActive) {
      return 'Drop image here';
    }
    return 'Drag & drop a new item image, or click to select';
  };

  const handleRetry = () => {
    setStage('idle');
    setError(null);
    setResult(null);
  };

  return (
    <div className="space-y-4">
      <UploadDropzone
        rootProps={getRootProps()}
        inputProps={getInputProps()}
        className={className}
        state={getDropzoneState()}
        icon={getStatusIcon()}
        label={getStatusText()}
        hint="JPEG, PNG or WebP"
      />

      {/* Error Display */}
      {stage === 'error' && error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Upload Failed</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={handleRetry}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Success Message */}
      {stage === 'success' && result && (
        <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          <AlertTitle className="text-green-800 dark:text-green-200">
            Item Updated Successfully
          </AlertTitle>
          <AlertDescription className="text-green-700 dark:text-green-300">
            <p className="text-sm">
              The item image has been updated and metadata has been enhanced
              with AI analysis.
            </p>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

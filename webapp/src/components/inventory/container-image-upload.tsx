'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import pb from '@/lib/pocketbase-client';
import type {
  ItemsResponse,
  ImagesResponse,
  ContainersResponse,
} from '@project/shared';

interface ContainerImageUploadProps {
  containerId: string;
  onSuccess?: (result: ContainerUpsertResult) => void;
  onError?: (error: Error) => void;
  acceptedTypes?: string[];
}

interface ContainerUpsertResult {
  success: boolean;
  image: ImagesResponse;
  updatedItems: ItemsResponse[];
  createdItems: ItemsResponse[];
  unmatchedExisting: ItemsResponse[];
  container: ContainersResponse;
}

type UploadStage =
  | 'idle'
  | 'uploading'
  | 'analyzing'
  | 'processing'
  | 'success'
  | 'error';

export function ContainerImageUpload({
  containerId,
  onSuccess,
  onError,
  acceptedTypes = ['image/jpeg', 'image/png', 'image/webp'],
}: ContainerImageUploadProps) {
  const [stage, setStage] = useState<UploadStage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ContainerUpsertResult | null>(null);

  const uploadImage = useCallback(
    async (file: File) => {
      try {
        setStage('uploading');
        setError(null);
        setResult(null);

        // Create form data with file and containerId
        const formData = new FormData();
        formData.append('file', file);
        formData.append('containerId', containerId);

        // Get auth token
        const authToken = pb.authStore.token;

        // POST to API route
        setStage('analyzing');
        const response = await fetch('/api-next/container-upload', {
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

        setStage('processing');
        const data: ContainerUpsertResult = await response.json();

        setStage('success');
        setResult(data);

        // Trigger success callback
        if (onSuccess) {
          onSuccess(data);
        }

        // Dispatch event for other components to refresh
        window.dispatchEvent(new CustomEvent('inventory-updated'));
      } catch (err) {
        console.error('Container image upload failed:', err);
        const errorMessage =
          err instanceof Error ? err.message : 'Upload failed';
        setError(errorMessage);
        setStage('error');

        if (onError && err instanceof Error) {
          onError(err);
        }
      }
    },
    [containerId, onSuccess, onError]
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      // Only process the first file for container upload
      uploadImage(acceptedFiles[0]);
    },
    [uploadImage]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: Object.fromEntries(acceptedTypes.map((t) => [t, []])),
    multiple: false,
    disabled:
      stage === 'uploading' || stage === 'analyzing' || stage === 'processing',
  });

  const isProcessing =
    stage === 'uploading' || stage === 'analyzing' || stage === 'processing';

  const getStatusIcon = () => {
    if (stage === 'success') {
      return <CheckCircle2 className="h-12 w-12 text-green-500" />;
    }
    if (stage === 'error') {
      return <AlertCircle className="h-12 w-12 text-destructive" />;
    }
    if (isProcessing) {
      return (
        <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
      );
    }
    return <Upload className="h-12 w-12 text-muted-foreground" />;
  };

  const getStatusText = () => {
    if (stage === 'uploading') {
      return 'Uploading image...';
    }
    if (stage === 'analyzing') {
      return 'Analyzing image with AI...';
    }
    if (stage === 'processing') {
      return 'Processing and updating items...';
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
    return 'Drag & drop a new container image, or click to select';
  };

  const handleRetry = () => {
    setStage('idle');
    setError(null);
    setResult(null);
  };

  return (
    <div className="space-y-4">
      <Card
        className={cn(
          'border-2 border-dashed transition-colors',
          isDragActive && 'border-primary bg-primary/5',
          isProcessing && 'border-primary/50',
          stage === 'success' && 'border-green-500',
          stage === 'error' && 'border-destructive'
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

      {/* Success Summary */}
      {stage === 'success' && result && (
        <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          <AlertTitle className="text-green-800 dark:text-green-200">
            Container Updated Successfully
          </AlertTitle>
          <AlertDescription className="text-green-700 dark:text-green-300">
            <div className="space-y-2 mt-2">
              <div className="flex flex-wrap gap-2">
                {result.updatedItems.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                  >
                    {result.updatedItems.length} item
                    {result.updatedItems.length !== 1 ? 's' : ''} updated
                  </Badge>
                )}
                {result.createdItems.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                  >
                    {result.createdItems.length} new item
                    {result.createdItems.length !== 1 ? 's' : ''} created
                  </Badge>
                )}
                {result.unmatchedExisting.length > 0 && (
                  <Badge
                    variant="secondary"
                    className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                  >
                    {result.unmatchedExisting.length} item
                    {result.unmatchedExisting.length !== 1 ? 's' : ''} not found
                    in new image
                  </Badge>
                )}
              </div>
              {result.unmatchedExisting.length > 0 && (
                <p className="text-xs mt-2">
                  Review unmatched items to decide if they should be kept,
                  removed, or deleted.
                </p>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

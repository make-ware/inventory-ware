'use client';

import type { ReactNode } from 'react';
import type { DropzoneInputProps, DropzoneRootProps } from 'react-dropzone';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type UploadDropzoneState =
  'idle' | 'active' | 'busy' | 'success' | 'error';

interface UploadDropzoneProps {
  rootProps: DropzoneRootProps;
  inputProps: DropzoneInputProps;
  icon: ReactNode;
  label: string;
  hint?: string;
  state?: UploadDropzoneState;
  className?: string;
}

/**
 * Slim, single-row drop target shared by every uploader so the drop box looks
 * and behaves the same on the item, container and image screens.
 */
export function UploadDropzone({
  rootProps,
  inputProps,
  icon,
  label,
  hint,
  state = 'idle',
  className,
}: UploadDropzoneProps) {
  return (
    <Card
      className={cn(
        'border-2 border-dashed py-0 gap-0 shadow-none transition-colors',
        state === 'active' && 'border-primary bg-primary/5',
        state === 'busy' && 'border-primary/50',
        state === 'success' && 'border-green-500',
        state === 'error' && 'border-destructive',
        className
      )}
    >
      <CardContent
        {...rootProps}
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
      >
        <input {...inputProps} />
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm truncate">{label}</p>
          {hint && (
            <p className="text-xs text-muted-foreground truncate">{hint}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

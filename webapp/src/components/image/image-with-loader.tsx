'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import NextImage, { type ImageProps } from 'next/image';
import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';

type LoadState = 'loading' | 'loaded' | 'error';

/**
 * `next/image` wrapper that keeps the frame filled while the file is still in
 * flight. Without it a slow connection (the common case on mobile) shows an
 * empty box that pops into a picture, which reads as a half-loaded page.
 *
 * Renders the image plus an absolutely positioned placeholder, so the caller
 * must provide a positioned parent — which `fill` requires anyway.
 */
export function ImageWithLoader({
  className,
  onLoad,
  ...props
}: ImageProps & { onLoad?: React.ReactEventHandler<HTMLImageElement> }) {
  const [state, setState] = useState<LoadState>('loading');
  const imgRef = useRef<HTMLImageElement | null>(null);
  const src = props.src;

  const handleLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      setState('loaded');
      onLoad?.(event);
    },
    [onLoad]
  );

  // Cached images can finish decoding before React attaches the load handler,
  // in which case `onLoad` never fires and the placeholder would stick around.
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) {
      handleLoad({
        currentTarget: img,
      } as React.SyntheticEvent<HTMLImageElement>);
    } else {
      setState('loading');
    }
    // `handleLoad` is intentionally omitted: re-running on a new callback
    // identity would reset the state of an already loaded image.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  return (
    <>
      <NextImage
        {...props}
        ref={imgRef}
        className={cn(
          'transition-opacity duration-300 motion-reduce:transition-none',
          state === 'loaded' ? 'opacity-100' : 'opacity-0',
          className
        )}
        onLoad={handleLoad}
        onError={() => setState('error')}
      />
      {state !== 'loaded' && (
        <div
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center bg-muted"
        >
          {state === 'error' ? (
            <ImageOff className="h-6 w-6 text-muted-foreground" />
          ) : (
            <div className="h-full w-full animate-pulse bg-accent" />
          )}
        </div>
      )}
    </>
  );
}

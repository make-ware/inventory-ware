'use client';

import { type BoundingBox } from '@project/shared';
import { cn } from '@/lib/utils';
import NextImage from 'next/image';

interface CroppedImageViewerProps {
  imageUrl: string;
  boundingBox?: BoundingBox;
  mode?: 'crop' | 'highlight';
  className?: string;
  alt?: string;
}

export function CroppedImageViewer({
  imageUrl,
  boundingBox,
  mode = 'crop',
  className,
  alt = 'Image',
}: CroppedImageViewerProps) {
  if (!boundingBox) {
    // If no bounding box, just show the full image
    return (
      <div className={cn('relative w-full h-full overflow-hidden', className)}>
        <NextImage
          src={imageUrl}
          alt={alt}
          fill
          className="object-cover"
          unoptimized
        />
      </div>
    );
  }

  if (mode === 'highlight') {
    return (
      <div className={cn('relative w-full h-full overflow-hidden', className)}>
        <NextImage
          src={imageUrl}
          alt={alt}
          fill
          className="object-contain"
          unoptimized
        />
        <div
          className="absolute border-2 border-primary bg-primary/20"
          style={{
            left: `${boundingBox.x * 100}%`,
            top: `${boundingBox.y * 100}%`,
            width: `${boundingBox.width * 100}%`,
            height: `${boundingBox.height * 100}%`,
          }}
        />
      </div>
    );
  }

  // Crop mode
  // Avoid division by zero when width/height is 1 (100%)
  const posX =
    boundingBox.width >= 1
      ? 0
      : (boundingBox.x / (1 - boundingBox.width)) * 100;
  const posY =
    boundingBox.height >= 1
      ? 0
      : (boundingBox.y / (1 - boundingBox.height)) * 100;

  return (
    <div
      className={cn('relative overflow-hidden bg-muted', className)}
      style={{
        backgroundImage: `url(${imageUrl})`,
        backgroundSize: `${(1 / boundingBox.width) * 100}% ${(1 / boundingBox.height) * 100}%`,
        backgroundPosition: `${posX}% ${posY}%`,
        backgroundRepeat: 'no-repeat',
      }}
      role="img"
      aria-label={alt}
    />
  );
}

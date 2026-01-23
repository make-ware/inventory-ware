'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
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

/**
 * Calculate how object-cover positions an image and transform bounding box coordinates
 * to match the visible portion of the image in the container.
 */
function calculateCoverTransform(
  imageWidth: number,
  imageHeight: number,
  containerWidth: number,
  containerHeight: number,
  boundingBox: BoundingBox
): { left: string; top: string; width: string; height: string } | null {
  if (!imageWidth || !imageHeight || !containerWidth || !containerHeight) {
    return null;
  }

  const imageAspect = imageWidth / imageHeight;
  const containerAspect = containerWidth / containerHeight;

  let scale: number;
  let offsetX = 0;
  let offsetY = 0;

  if (imageAspect > containerAspect) {
    // Image is wider - height fills container, width is cropped
    scale = containerHeight / imageHeight;
    const scaledWidth = imageWidth * scale;
    offsetX = (scaledWidth - containerWidth) / 2;
  } else {
    // Image is taller - width fills container, height is cropped
    scale = containerWidth / imageWidth;
    const scaledHeight = imageHeight * scale;
    offsetY = (scaledHeight - containerHeight) / 2;
  }

  // Convert bounding box from normalized image coords to container coords
  // Bounding box coords are 0-1 relative to the original image
  const bboxLeftInImage = boundingBox.x * imageWidth * scale;
  const bboxTopInImage = boundingBox.y * imageHeight * scale;
  const bboxWidthScaled = boundingBox.width * imageWidth * scale;
  const bboxHeightScaled = boundingBox.height * imageHeight * scale;

  // Adjust for the crop offset
  const left = bboxLeftInImage - offsetX;
  const top = bboxTopInImage - offsetY;

  return {
    left: `${left}px`,
    top: `${top}px`,
    width: `${bboxWidthScaled}px`,
    height: `${bboxHeightScaled}px`,
  };
}

export function CroppedImageViewer({
  imageUrl,
  boundingBox,
  mode = 'highlight',
  className,
  alt = 'Image',
}: CroppedImageViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageDimensions, setImageDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [containerDimensions, setContainerDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  // Update container dimensions on mount and resize
  useEffect(() => {
    const updateContainerDimensions = () => {
      if (containerRef.current) {
        setContainerDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    updateContainerDimensions();

    const resizeObserver = new ResizeObserver(updateContainerDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, []);

  // Load image dimensions
  useEffect(() => {
    if (!imageUrl) return;

    const img = new Image();
    img.onload = () => {
      setImageDimensions({
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Calculate bounding box position using useMemo (derived state)
  const bboxStyle = useMemo(() => {
    if (
      boundingBox &&
      imageDimensions &&
      containerDimensions &&
      mode === 'highlight'
    ) {
      return calculateCoverTransform(
        imageDimensions.width,
        imageDimensions.height,
        containerDimensions.width,
        containerDimensions.height,
        boundingBox
      );
    }
    return null;
  }, [boundingBox, imageDimensions, containerDimensions, mode]);

  if (!boundingBox) {
    // If no bounding box, just show the full image
    return (
      <div
        ref={containerRef}
        className={cn('relative w-full h-full overflow-hidden', className)}
      >
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
    // Calculate clip-path to create inverted overlay (darken outside bounding box)
    const clipPath =
      bboxStyle && containerDimensions
        ? (() => {
            const left = parseFloat(bboxStyle.left);
            const top = parseFloat(bboxStyle.top);
            const width = parseFloat(bboxStyle.width);
            const height = parseFloat(bboxStyle.height);
            const right = left + width;
            const bottom = top + height;
            const cw = containerDimensions.width;
            const ch = containerDimensions.height;

            // Create a polygon that covers the entire container with a hole for the bbox
            // Using evenodd fill rule: outer rectangle + inner rectangle creates a hole
            return `polygon(evenodd, 
              0 0, ${cw}px 0, ${cw}px ${ch}px, 0 ${ch}px, 0 0,
              ${left}px ${top}px, ${left}px ${bottom}px, ${right}px ${bottom}px, ${right}px ${top}px, ${left}px ${top}px
            )`;
          })()
        : undefined;

    return (
      <div
        ref={containerRef}
        className={cn('relative w-full h-full overflow-hidden', className)}
      >
        <NextImage
          src={imageUrl}
          alt={alt}
          fill
          className="object-cover"
          unoptimized
        />
        {clipPath && (
          <div
            className="absolute inset-0 bg-black/60 pointer-events-none"
            style={{ clipPath }}
          />
        )}
        {bboxStyle && (
          <div
            className="absolute border-2 border-primary pointer-events-none"
            style={bboxStyle}
          />
        )}
      </div>
    );
  }

  // Crop mode - use cover image display with bounding box centered
  // Calculate the center of the bounding box in normalized coordinates (0-1)
  const bboxCenterX = boundingBox.x + boundingBox.width / 2;
  const bboxCenterY = boundingBox.y + boundingBox.height / 2;

  // Convert center position to percentage for CSS positioning
  // This centers the bounding box region in the view
  const positionX = bboxCenterX * 100;
  const positionY = bboxCenterY * 100;

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative w-full h-full overflow-hidden bg-muted',
        className
      )}
    >
      <NextImage
        src={imageUrl}
        alt={alt}
        fill
        className="object-cover"
        style={{
          objectPosition: `${positionX}% ${positionY}%`,
        }}
        unoptimized
      />
    </div>
  );
}

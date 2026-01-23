'use client';

import pb from '@/lib/pocketbase-client';
import type { Image } from '@project/shared';

/**
 * Get the file URL for an Image record
 */
export function getImageFileUrl(image: Image): string {
  return pb.files.getURL(image, image.file);
}

/**
 * Get image URL from a record with expanded primaryImage
 */
export function getExpandedImageUrl<
  T extends { expand?: { primaryImage?: Image } },
>(record: T): string | undefined {
  return record.expand?.primaryImage
    ? getImageFileUrl(record.expand.primaryImage)
    : undefined;
}

/**
 * Reading a case's image off disk in the form the analysis service wants.
 *
 * The production path base64-encodes images before sending them because
 * providers cannot reach a localhost PocketBase URL (see CLAUDE.md); the
 * benchmark hands over the same `data:` URL so the model sees byte-identical
 * input to a real upload.
 */
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * Extension → media type. Deliberately a small allowlist: the media type is
 * written into the data URL and passed to the provider, so guessing wrong is
 * worse than refusing the file.
 */
const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

/**
 * Refuse anything larger. Providers reject oversized payloads anyway, and a
 * case image is meant to be committed to the repo — failing here costs nothing,
 * failing at the provider costs a round trip per run.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Media type for a path, or undefined when the extension is not supported. */
export function mimeTypeForPath(filePath: string): string | undefined {
  return MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()];
}

/**
 * Load an image as a `data:<mime>;base64,...` URL.
 *
 * @throws when the file is missing, has an unsupported extension, or exceeds
 *   {@link MAX_IMAGE_BYTES}.
 */
export async function loadImageAsDataUrl(filePath: string): Promise<string> {
  const mimeType = mimeTypeForPath(filePath);
  if (!mimeType) {
    throw new Error(
      `Unsupported image type "${path.extname(filePath) || '(none)'}" for ${filePath}. ` +
        `Supported extensions: ${Object.keys(MIME_BY_EXTENSION).join(', ')}.`
    );
  }

  let sizeBytes: number;
  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) {
      throw new Error(`Image path is not a file: ${filePath}`);
    }
    sizeBytes = stats.size;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `Image not found: ${filePath}. Case "image" paths are relative to the benchmark/ directory.`,
        { cause: err }
      );
    }
    throw err;
  }

  if (sizeBytes > MAX_IMAGE_BYTES) {
    throw new Error(
      `Image ${filePath} is ${(sizeBytes / 1024 / 1024).toFixed(1)}MB, over the ` +
        `${MAX_IMAGE_BYTES / 1024 / 1024}MB benchmark cap. Resize it before committing.`
    );
  }

  const bytes = await readFile(filePath);
  return `data:${mimeType};base64,${bytes.toString('base64')}`;
}

/**
 * Utility functions for computing file hashes
 */

/**
 * Compute SHA-256 hash of file content
 * Works in both browser (Web Crypto API) and Node.js environments
 * @param file - File object or ArrayBuffer to hash
 * @returns Hex-encoded SHA-256 hash string
 */
export async function computeFileHash(
  file: File | ArrayBuffer
): Promise<string> {
  // Get the ArrayBuffer from the file
  const buffer = file instanceof File ? await file.arrayBuffer() : file;

  // Use Web Crypto API (available in both browser and Node.js 15+)
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);

  // Convert ArrayBuffer to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return hashHex;
}

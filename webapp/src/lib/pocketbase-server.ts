/**
 * Server-side PocketBase client
 */
import 'server-only';

import PocketBase, { ClientResponseError } from 'pocketbase';
import type { TypedPocketBase } from '@project/shared/types';

/**
 * Create a new PocketBase client for server-side usage.
 *
 * Use this in API routes or Server Actions to create a fresh instance
 * per request, avoiding auth state sharing between requests.
 *
 * @example
 * ```ts
 * // app/api-next/example/route.ts
 * import { createServerPocketBaseClient } from '@/lib/pocketbase-server';
 *
 * export async function GET() {
 *   const pb = createServerPocketBaseClient();
 *   // Use pb for this request only
 * }
 * ```
 */
export function createServerPocketBaseClient(): TypedPocketBase {
  // Mirror the client-side fallback so dev works even when the root .env
  // was not loaded into this process (see webapp package.json dev script).
  const url = process.env.POCKETBASE_URL || 'http://localhost:8090';
  const pb = new PocketBase(url) as TypedPocketBase;
  pb.autoCancellation(false);
  return pb;
}

/**
 * Authenticate PocketBase client with the user's token from the request.
 * Extracts the token from the Authorization header and verifies it.
 *
 * @param pb PocketBase client instance
 * @param req Request object to extract Authorization header from
 * @throws Error if token is missing or invalid
 *
 * @example
 * ```ts
 * // app/api-next/example/route.ts
 * import { createServerPocketBaseClient, authenticateAsUser } from '@/lib/pocketbase-server';
 *
 * export async function GET(req: Request) {
 *   const pb = createServerPocketBaseClient();
 *   await authenticateAsUser(pb, req);
 *   // pb is now authenticated as the requesting user
 * }
 * ```
 */
export async function authenticateAsUser(
  pb: TypedPocketBase,
  req: Request
): Promise<void> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    throw new Error('Missing Authorization header');
  }

  // Extract token from "Bearer <token>" format
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) {
    throw new Error(
      'Invalid Authorization header format. Expected: Bearer <token>'
    );
  }

  const token = match[1];

  // Set the token on the authStore
  // PocketBase will validate it on the next request
  pb.authStore.save(token, null);

  // Verify the token is valid by refreshing the auth
  // This will throw if the token is invalid or expired
  try {
    const authData = await pb.collection('Users').authRefresh();

    // authRefresh returns { token, record } - we need to explicitly save the record
    // The record contains the full user data including the ID
    if (!authData.record) {
      pb.authStore.clear();
      throw new Error(
        'Authentication failed: no user record returned from authRefresh'
      );
    }

    // Explicitly save both the token and record to ensure authStore is fully populated
    // Use the refreshed token if available, otherwise use the original token
    const tokenToSave = authData.token || token;
    pb.authStore.save(tokenToSave, authData.record);

    // Double-check that the record is now available in authStore
    if (!pb.authStore.record || !pb.authStore.record.id) {
      console.error('Auth store state after save:', {
        hasRecord: !!pb.authStore.record,
        recordId: pb.authStore.record?.id,
        hasToken: !!pb.authStore.token,
        isValid: pb.authStore.isValid,
      });
      pb.authStore.clear();
      throw new Error(
        'Authentication failed: user record ID not available after saving to authStore'
      );
    }
  } catch (error) {
    pb.authStore.clear();
    // status 0 means the request never got a response (the SDK's generic
    // "Something went wrong.") — name the URL so the failure is diagnosable.
    if (error instanceof ClientResponseError && error.status === 0) {
      throw new Error(
        `Could not reach PocketBase at ${pb.baseURL} (${error.message}) — ` +
          'is PocketBase running and POCKETBASE_URL set correctly?'
      );
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Invalid or expired authentication token');
  }
}

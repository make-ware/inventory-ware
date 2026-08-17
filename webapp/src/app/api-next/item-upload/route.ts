import { NextRequest, NextResponse } from 'next/server';
import { createInventoryService } from '@/services/inventory';
import {
  createServerPocketBaseClient,
  authenticateAsUser,
} from '@/lib/pocketbase-server';
import { aiConfigErrorResponse } from '@/lib/ai-error-response';
import { createLogger, errorMessage } from '@/lib/logger';

const log = createLogger('api-next/item-upload');

/**
 * API route to process an item image upload with metadata enhancement
 * This ensures environment variables (like the AI provider credentials)
 * are available
 *
 * Validates Requirements: 8.1, 8.2, 8.3, 8.4
 */
export async function POST(request: NextRequest) {
  const startedAt = Date.now();

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const itemId = formData.get('itemId') as string;
    log.debug('item upload received', {
      itemId,
      filename: file?.name,
      bytes: file?.size,
    });

    // Validate required fields
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!itemId) {
      return NextResponse.json(
        { error: 'Item ID is required' },
        { status: 400 }
      );
    }

    // Create a new PocketBase client instance for this request
    const pb = createServerPocketBaseClient();

    // Authenticate using the user's token from the request
    try {
      await authenticateAsUser(pb, request);
    } catch (authError) {
      log.warn('authentication failed', { reason: errorMessage(authError) });
      return NextResponse.json(
        {
          error:
            authError instanceof Error
              ? authError.message
              : 'Authentication required',
        },
        { status: 401 }
      );
    }

    // Get the authenticated user ID
    const userId = pb.authStore.record?.id;
    if (!userId) {
      return NextResponse.json(
        { error: 'User authentication required' },
        { status: 401 }
      );
    }

    // Create service server-side where env vars are available
    const service = createInventoryService(pb);

    // Process the item image upload with metadata enhancement
    // This will verify item ownership and throw if unauthorized
    try {
      const result = await service.processItemImageUpload(file, itemId, userId);

      log.info('item image processed', {
        itemId,
        imageId: result.image?.id,
        userId,
        bytes: file.size,
        durationMs: Date.now() - startedAt,
      });

      return NextResponse.json({
        success: true,
        image: result.image,
        item: result.item,
      });
    } catch (serviceError) {
      // Check for authorization errors
      if (
        serviceError instanceof Error &&
        (serviceError.message.includes('Unauthorized') ||
          serviceError.message.includes('do not own'))
      ) {
        return NextResponse.json(
          { error: serviceError.message },
          { status: 403 }
        );
      }

      // Check for not found errors
      if (
        serviceError instanceof Error &&
        serviceError.message.includes('not found')
      ) {
        return NextResponse.json(
          { error: serviceError.message },
          { status: 404 }
        );
      }

      // Re-throw other errors to be caught by outer catch
      throw serviceError;
    }
  } catch (error) {
    log.error('item image upload failed', {
      err: error,
      durationMs: Date.now() - startedAt,
    });
    const aiError = aiConfigErrorResponse(error);
    if (aiError) return aiError;
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to process item image upload',
      },
      { status: 500 }
    );
  }
}

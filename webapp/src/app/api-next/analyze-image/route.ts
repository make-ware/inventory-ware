import { NextRequest, NextResponse } from 'next/server';
import { createInventoryService } from '@/services/inventory';
import {
  createServerPocketBaseClient,
  authenticateAsUser,
} from '@/lib/pocketbase-server';
import { aiConfigErrorResponse } from '@/lib/ai-error-response';
import { createLogger, errorMessage } from '@/lib/logger';

const log = createLogger('api-next/analyze-image');

/**
 * API route to analyze an existing image server-side
 */
export async function POST(request: NextRequest) {
  const startedAt = Date.now();

  try {
    const { imageId } = await request.json();
    log.debug('analyze requested', { imageId });

    if (!imageId) {
      return NextResponse.json(
        { error: 'No imageId provided' },
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

    // Process the existing image
    const result = await service.processExistingImage(imageId, userId);

    log.info('image analyzed', {
      imageId,
      userId,
      items: result.items?.length ?? 0,
      container: result.container?.id,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      success: true,
      image: result.image,
      items: result.items,
      container: result.container,
    });
  } catch (error) {
    log.error('image analysis failed', {
      err: error,
      durationMs: Date.now() - startedAt,
    });
    const aiError = aiConfigErrorResponse(error);
    if (aiError) return aiError;
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to analyze image',
      },
      { status: 500 }
    );
  }
}

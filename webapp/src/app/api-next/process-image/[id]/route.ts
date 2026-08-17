import { NextRequest, NextResponse } from 'next/server';
import { createInventoryService } from '@/services/inventory';
import { ImageMutator } from '@project/shared';
import {
  createServerPocketBaseClient,
  authenticateAsUser,
} from '@/lib/pocketbase-server';
import { aiConfigErrorResponse } from '@/lib/ai-error-response';
import { createLogger, errorMessage } from '@/lib/logger';

const log = createLogger('api-next/process-image/[id]');

/**
 * API route to process an existing image server-side
 * This ensures environment variables (like the AI provider credentials)
 * are available
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now();

  try {
    const { id } = await params;
    log.debug('reprocess requested', { imageId: id });

    if (!id) {
      return NextResponse.json(
        { error: 'Image ID is required' },
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

    // Verify the image exists before processing
    const imageMutator = new ImageMutator(pb);
    let image;
    try {
      image = await imageMutator.getById(id);
    } catch (error: unknown) {
      // Handle 404 or other errors when fetching the image
      const err = error as { status?: number; response?: { code?: number } };
      if (err?.status === 404 || err?.response?.code === 404) {
        return NextResponse.json(
          { error: `Image with ID ${id} not found. It may have been deleted.` },
          { status: 404 }
        );
      }
      throw error;
    }

    if (!image) {
      return NextResponse.json(
        { error: `Image with ID ${id} not found` },
        { status: 404 }
      );
    }

    // Create service server-side where env vars are available
    const service = createInventoryService(pb);

    // Process the existing image
    const result = await service.processExistingImage(id, userId);

    log.info('image reprocessed', {
      imageId: id,
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
  } catch (error: unknown) {
    log.error('image reprocessing failed', {
      err: error,
      durationMs: Date.now() - startedAt,
    });

    const aiError = aiConfigErrorResponse(error);
    if (aiError) return aiError;

    // Handle 404 errors specifically
    const err = error as { status?: number; response?: { code?: number } };
    if (err?.status === 404 || err?.response?.code === 404) {
      return NextResponse.json(
        { error: 'Image not found. It may have been deleted.' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to process image',
      },
      { status: 500 }
    );
  }
}

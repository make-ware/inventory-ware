import { NextRequest, NextResponse } from 'next/server';
import { createInventoryService } from '@/services/inventory';
import {
  createServerPocketBaseClient,
  authenticateAsUser,
} from '@/lib/pocketbase-server';
import { aiConfigErrorResponse } from '@/lib/ai-error-response';
import { createLogger, errorMessage } from '@/lib/logger';

const log = createLogger('api-next/container-upload');

/**
 * API route to process a container image upload with intelligent upsert
 * This ensures environment variables (like the AI provider credentials)
 * are available
 *
 * Validates Requirements: 7.1, 7.2, 7.3, 7.4
 */
export async function POST(request: NextRequest) {
  const startedAt = Date.now();

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const containerId = formData.get('containerId') as string;
    log.debug('container upload received', {
      containerId,
      filename: file?.name,
      bytes: file?.size,
    });

    // Validate required fields
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!containerId) {
      return NextResponse.json(
        { error: 'Container ID is required' },
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

    const user = pb.authStore.record as {
      aiEstimateEnabled?: boolean;
      aiEstimateCurrency?: string;
    };

    // Create service server-side where env vars are available
    const service = createInventoryService(pb);

    // Process the container image upload with upsert
    // This will verify container ownership and throw if unauthorized
    try {
      const result = await service.processContainerImageUpload(
        file,
        containerId,
        userId,
        {
          estimateValue: user.aiEstimateEnabled === true,
          currency: user.aiEstimateCurrency || 'USD',
        }
      );

      log.info('container image processed', {
        containerId,
        imageId: result.image?.id,
        userId,
        bytes: file.size,
        updatedItems: result.updatedItems?.length ?? 0,
        createdItems: result.createdItems?.length ?? 0,
        unmatchedExisting: result.unmatchedExisting?.length ?? 0,
        durationMs: Date.now() - startedAt,
      });

      return NextResponse.json({
        success: true,
        image: result.image,
        updatedItems: result.updatedItems,
        createdItems: result.createdItems,
        unmatchedExisting: result.unmatchedExisting,
        container: result.container,
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
    log.error('container image upload failed', {
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
            : 'Failed to process container image upload',
      },
      { status: 500 }
    );
  }
}

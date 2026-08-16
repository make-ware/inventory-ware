import { NextRequest, NextResponse } from 'next/server';
import { createInventoryService } from '@/services/inventory';
import {
  createServerPocketBaseClient,
  authenticateAsUser,
} from '@/lib/pocketbase-server';
import { aiConfigErrorResponse } from '@/lib/ai-error-response';

/**
 * API route to process an image server-side
 * This ensures environment variables (like the AI provider credentials)
 * are available
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Create a new PocketBase client instance for this request
    const pb = createServerPocketBaseClient();

    // Authenticate using the user's token from the request
    try {
      await authenticateAsUser(pb, request);
    } catch (authError) {
      console.error('Authentication failed:', authError);
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

    // Process the image
    const result = await service.processImageUpload(file, userId);

    return NextResponse.json({
      success: true,
      image: result.image,
      items: result.items,
      container: result.container,
    });
  } catch (error) {
    console.error('Error processing image:', error);
    const aiError = aiConfigErrorResponse(error);
    if (aiError) return aiError;
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to process image',
      },
      { status: 500 }
    );
  }
}

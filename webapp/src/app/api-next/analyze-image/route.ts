import { NextRequest, NextResponse } from 'next/server';
import { createInventoryService } from '@/services/inventory';
import {
  createServerPocketBaseClient,
  authenticateAsUser,
} from '@/lib/pocketbase-server';

/**
 * API route to analyze an existing image server-side
 */
export async function POST(request: NextRequest) {
  try {
    const { imageId } = await request.json();

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

    // Process the existing image
    const result = await service.processExistingImage(imageId, userId);

    return NextResponse.json({
      success: true,
      image: result.image,
      items: result.items,
      container: result.container,
    });
  } catch (error) {
    console.error('Error analyzing image:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to analyze image',
      },
      { status: 500 }
    );
  }
}

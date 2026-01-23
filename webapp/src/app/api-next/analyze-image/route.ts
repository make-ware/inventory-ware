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
    const body = await request.json();
    const { imageId, userId: bodyUserId } = body;

    if (!imageId) {
      return NextResponse.json(
        { error: 'No imageId provided' },
        { status: 400 }
      );
    }

    // Create a new PocketBase client instance for this request
    const pb = createServerPocketBaseClient();
    let userId: string | undefined;

    // Check for internal service authentication
    const internalSecret = request.headers.get('x-internal-secret');
    const isInternalCall =
      process.env.INTERNAL_API_SECRET &&
      internalSecret === process.env.INTERNAL_API_SECRET;

    if (isInternalCall) {
      // Authenticate as admin for internal calls
      if (
        !process.env.POCKETBASE_ADMIN_EMAIL ||
        !process.env.POCKETBASE_ADMIN_PASSWORD
      ) {
        console.error('Admin credentials not configured');
        return NextResponse.json(
          { error: 'Server configuration error' },
          { status: 500 }
        );
      }

      await pb.admins.authWithPassword(
        process.env.POCKETBASE_ADMIN_EMAIL,
        process.env.POCKETBASE_ADMIN_PASSWORD
      );

      // Use the userId provided in the body
      userId = bodyUserId;
      if (!userId) {
        return NextResponse.json(
          { error: 'userId required for internal calls' },
          { status: 400 }
        );
      }
    } else {
      // Authenticate using the user's token from the request
      try {
        await authenticateAsUser(pb, request);
        userId = pb.authStore.record?.id;
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
    }

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

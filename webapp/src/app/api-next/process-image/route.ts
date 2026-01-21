import { NextRequest, NextResponse } from 'next/server';
import { createInventoryService } from '@/services/inventory';
import PocketBase from 'pocketbase';
import type { TypedPocketBase } from '@project/shared';

/**
 * API route to process an image server-side
 * This ensures environment variables (like OPENAI_API_KEY) are available
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Create a new PocketBase client instance for this request
    const pbUrl =
      process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://localhost:8090';
    const pb = new PocketBase(pbUrl) as TypedPocketBase;

    // Get auth token from Authorization header (passed from client)
    const authHeader = request.headers.get('authorization');
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      if (token) {
        // Set the auth token on the PocketBase client
        // PocketBase will validate the token on the first request
        pb.authStore.save(token, null);
      }
    }

    // Debug: Log that we're in server context (don't log the actual key value)
    if (!process.env.OPENAI_API_KEY) {
      console.warn(
        'OPENAI_API_KEY not found in API route. Available env vars:',
        Object.keys(process.env)
          .filter((k) => k.includes('OPENAI') || k.includes('API'))
          .join(', ') || 'none'
      );
    }

    // Create service server-side where env vars are available
    const service = createInventoryService(pb);

    // Process the image
    const result = await service.processImageUpload(file);

    return NextResponse.json({
      success: true,
      image: result.image,
      items: result.items,
      container: result.container,
    });
  } catch (error) {
    console.error('Error processing image:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to process image',
      },
      { status: 500 }
    );
  }
}

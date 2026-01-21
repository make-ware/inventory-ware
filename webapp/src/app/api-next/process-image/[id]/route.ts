import { NextRequest, NextResponse } from 'next/server';
import { createInventoryService } from '@/services/inventory';
import PocketBase from 'pocketbase';
import type { TypedPocketBase } from '@project/shared';
import { ImageMutator } from '@project/shared';

/**
 * API route to process an existing image server-side
 * This ensures environment variables (like OPENAI_API_KEY) are available
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Image ID is required' },
        { status: 400 }
      );
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

    // Process the existing image
    const result = await service.processExistingImage(id);

    return NextResponse.json({
      success: true,
      image: result.image,
      items: result.items,
      container: result.container,
    });
  } catch (error: unknown) {
    console.error('Error processing image:', error);

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

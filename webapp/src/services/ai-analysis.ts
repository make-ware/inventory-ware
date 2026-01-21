import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import {
  ItemImageMetadataSchema,
  ContainerImageMetadataSchema,
} from '@project/shared';
import type { AnalysisResult } from '@project/shared';

/**
 * Category library for maintaining consistency across AI analysis
 */
export interface CategoryLibrary {
  functional: string[];
  specific: string[];
  item_type: string[];
}

/**
 * AI Analysis Service for image analysis using gpt-5.2-2025-12-11
 */
export interface AIAnalysisService {
  /**
   * Analyze an image and extract structured metadata
   * @param imageData - Base64-encoded image data (data URL format: data:image/jpeg;base64,...)
   * @param existingCategories - Existing category values for consistency
   * @returns Structured analysis result (item or container)
   */
  analyzeImage(
    imageData: string,
    existingCategories: CategoryLibrary
  ): Promise<AnalysisResult>;

  /**
   * Determine if an image contains a single item or a container with multiple items
   * @param imageData - Base64-encoded image data (data URL format: data:image/jpeg;base64,...)
   * @returns Image type: "item" or "container"
   */
  determineImageType(imageData: string): Promise<'item' | 'container'>;
}

/**
 * Create an AI Analysis Service instance
 * Note: This should only be called server-side or in API routes where environment variables are available
 */
export function createAIAnalysisService(): AIAnalysisService {
  // Lazy initialization of OpenAI client - only create when actually needed
  let openaiInstance: ReturnType<typeof createOpenAI> | null = null;

  const getOpenAI = () => {
    if (!openaiInstance) {
      // Get API key from environment variable
      // In Next.js, this will be available server-side but not in client components
      const apiKey = process.env.OPENAI_API_KEY;

      if (!apiKey) {
        // Debug: Log available env vars (without exposing values)
        const envKeys = Object.keys(process.env).filter(
          (key) => key.includes('OPENAI') || key.includes('API')
        );

        const errorMessage = [
          'OPENAI_API_KEY environment variable is not set.',
          '',
          'To fix this:',
          '1. Create or edit .env or .env.local file at the project root',
          '2. Add: OPENAI_API_KEY=your-api-key-here',
          '3. Restart your Next.js dev server (stop and start again)',
          '',
          'Note: The .env file can be at the project root (preferred) or in webapp/ directory.',
          'Available env vars with "OPENAI" or "API" in name: ' +
            (envKeys.length > 0 ? envKeys.join(', ') : 'none found'),
        ].join('\n');

        throw new Error(errorMessage);
      }

      // Create OpenAI instance with explicit API key configuration
      // According to https://ai-sdk.dev/providers/ai-sdk-providers/openai
      // The apiKey can be passed explicitly or defaults to OPENAI_API_KEY env var
      openaiInstance = createOpenAI({
        apiKey,
      });
    }
    return openaiInstance;
  };

  return {
    async determineImageType(imageData: string): Promise<'item' | 'container'> {
      const openai = getOpenAI();
      const { object } = await generateObject({
        model: openai('gpt-5.2-2025-12-11'),
        schema: z.object({
          type: z
            .enum(['item', 'container'])
            .describe(
              'Whether image shows a single item or a container with multiple items'
            ),
        }),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Determine if this image shows a single inventory item or a container/box with multiple items inside.',
              },
              { type: 'image', image: imageData },
            ],
          },
        ],
      });
      return object.type;
    },

    async analyzeImage(
      imageData: string,
      existingCategories: CategoryLibrary
    ): Promise<AnalysisResult> {
      // First determine the image type
      const imageType = await this.determineImageType(imageData);

      // Build category context for AI
      const categoryContext = `
Existing categories for consistency:
- Functional: ${existingCategories.functional.join(', ') || 'None yet'}
- Specific: ${existingCategories.specific.join(', ') || 'None yet'}
- Item Types: ${existingCategories.item_type.join(', ') || 'None yet'}

Use existing categories when appropriate, or create new ones if needed.
`;

      if (imageType === 'item') {
        // Analyze single item
        const openai = getOpenAI();
        const { object } = await generateObject({
          model: openai('gpt-5.2-2025-12-11'),
          schema: ItemImageMetadataSchema,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Analyze this image of an inventory item. Extract detailed metadata including label, notes, categories, manufacturer, and attributes.

${categoryContext}

Be thorough and specific in your analysis. Include relevant attributes like dimensions, specifications, quantities, colors, or other distinguishing features.`,
                },
                { type: 'image', image: imageData },
              ],
            },
          ],
        });
        return { type: 'item', data: object };
      } else {
        // Analyze container with multiple items
        const openai = getOpenAI();
        const { object } = await generateObject({
          model: openai('gpt-5.2-2025-12-11'),
          schema: ContainerImageMetadataSchema,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Analyze this image of a container with multiple items. Extract metadata for the container and each visible item inside.

${categoryContext}

For each item in the container, provide detailed metadata including label, categories, manufacturer, and attributes. Be thorough and specific.`,
                },
                { type: 'image', image: imageData },
              ],
            },
          ],
        });
        return { type: 'container', data: object };
      }
    },
  };
}

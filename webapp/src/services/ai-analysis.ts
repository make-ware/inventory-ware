import { generateObject } from 'ai';
import { z } from 'zod';
import {
  ItemImageMetadataSchema,
  ContainerImageMetadataSchema,
} from '@project/shared';
import type {
  AnalysisResult,
  Item,
  ContainerImageMetadata,
} from '@project/shared';
import { getLanguageModel } from './ai-provider';

/**
 * Category library for maintaining consistency across AI analysis
 */
export interface CategoryLibrary {
  functional: string[];
  specific: string[];
  itemType: string[];
}

/**
 * Shared preamble telling the model how to name categories and attributes.
 * Used by every analysis prompt so the vocabulary stays consistent.
 */
function buildCategoryContext(existingCategories: CategoryLibrary): string {
  return `
IMPORTANT CATEGORY & ATTRIBUTE RULES:
1. Categories AND Attributes allow alphanumeric (A-Z, a-z, 0-9), hyphens (-), and SPACES ( ). 
2. Use human-readable formats: "Anti-Static Bags", "CPU Cooler", "Input Voltage" are all valid.
3. Use existing categories whenever possible to avoid duplicates.
4. If you must create a new category or attribute, keep it concise but descriptive.

DISPLAY NAME RULES:
- 'itemType' is the PRIMARY DISPLAY NAME. It should be a concise, generic noun (e.g., "Drill", "Screws", "Bin").
- 'itemName' is the SPECIFIC IDENTITY. It should include the brand and record if possible (e.g., "DeWalt DCD771", "Grizzly G8688").
- 'itemLabel' is a descriptive tag for the specific instance (e.g., "Main Workshop Drill").

Existing example categories for your reference:
- Functional: ${existingCategories.functional.join(', ') || 'None yet'}
- Specific: ${existingCategories.specific.join(', ') || 'None yet'}
- Item Types: ${existingCategories.itemType.join(', ') || 'None yet'}
`;
}

/**
 * AI Analysis Service for image analysis.
 * The provider, model, credential and base URL are resolved from the
 * environment by `ai-config.ts` — see that module for the supported variables.
 */
export interface AIAnalysisService {
  /**
   * Analyze an image and extract structured metadata
   * @param imageData - Base64-encoded image data (data URL format: data:image/jpeg;base64,...)
   * @param existingCategories - Existing category values for consistency (3 examples of each)
   * @param searchCategories - Tool function for AI to search all existing categories
   * @returns Structured analysis result (item or container)
   */
  analyzeImage(
    imageData: string,
    existingCategories: CategoryLibrary,
    searchCategories: (
      query: string,
      type: 'functional' | 'specific' | 'itemType'
    ) => Promise<string[]>
  ): Promise<AnalysisResult>;

  /**
   * Determine if an image contains a single item or a container with multiple items
   * @param imageData - Base64-encoded image data (data URL format: data:image/jpeg;base64,...)
   * @returns Image type: "item" or "container"
   */
  determineImageType(imageData: string): Promise<'item' | 'container'>;

  /**
   * Analyze a container image with context of existing items for consistent naming
   * @param imageData - Base64-encoded image data (data URL format: data:image/jpeg;base64,...)
   * @param existingItems - Array of existing items in the container for context
   * @param existingCategories - Existing category values for consistency
   * @returns Structured container metadata with detected items
   */
  analyzeContainerImageWithContext(
    imageData: string,
    existingItems: Item[],
    existingCategories: CategoryLibrary
  ): Promise<ContainerImageMetadata>;
}

/**
 * Create an AI Analysis Service instance
 * Note: This should only be called server-side or in API routes where environment variables are available
 */
export function createAIAnalysisService(): AIAnalysisService {
  return {
    async determineImageType(imageData: string): Promise<'item' | 'container'> {
      const { object } = await generateObject({
        model: getLanguageModel(),
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
      const categoryContext = buildCategoryContext(existingCategories);

      if (imageType === 'item') {
        // Analyze single item
        const { object } = await generateObject({
          model: getLanguageModel(),
          schema: ItemImageMetadataSchema,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Analyze this image of an inventory item. Extract detailed metadata including label, notes, categories, manufacturer, and attributes.

${categoryContext}

Be thorough and specific in your analysis. Include relevant attributes like dimensions, specifications, quantities, colors, or other distinguishing features.
Return the final result as a structured object.`,
                },
                { type: 'image', image: imageData },
              ],
            },
          ],
        });
        return { type: 'item', data: object };
      } else {
        // Analyze container with multiple items
        const { object } = await generateObject({
          model: getLanguageModel(),
          schema: ContainerImageMetadataSchema,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Analyze this image of a container with multiple items. Extract metadata for the container and each visible item inside.

${categoryContext}

For each item in the container, provide detailed metadata including label, categories, manufacturer, and attributes. Be thorough and specific.
Return the final result as a structured object.`,
                },
                { type: 'image', image: imageData },
              ],
            },
          ],
        });
        return { type: 'container', data: object };
      }
    },

    async analyzeContainerImageWithContext(
      imageData: string,
      existingItems: Item[],
      existingCategories: CategoryLibrary
    ): Promise<ContainerImageMetadata> {
      // Build category context for AI
      const categoryContext = buildCategoryContext(existingCategories);

      // Build existing items context for consistent naming
      const existingItemsContext =
        existingItems.length > 0
          ? `
EXISTING ITEMS IN THIS CONTAINER:
The container already has the following items. When you see similar items in the new image, 
use consistent naming and categories to help with matching:

${existingItems
  .map(
    (item, index) => `
${index + 1}. ${item.itemLabel}
   - Type: ${item.itemType}
   - Functional Category: ${item.categoryFunctional}
   - Specific Category: ${item.categorySpecific}
   - Name: ${item.itemName || 'N/A'}
   - Manufacturer: ${item.itemManufacturer || 'N/A'}
   - Attributes: ${item.itemAttributes?.map((attr) => `${attr.name}: ${attr.value}`).join(', ') || 'None'}
`
  )
  .join('\n')}

When analyzing the new image:
- If you see items that appear to match existing items above, use the SAME category values and similar naming
- This helps the system match items correctly and avoid duplicates
- If an item is clearly different from all existing items, use appropriate new categories
`
          : `
This container currently has no items. Analyze all items you see in the image.
`;

      const { object } = await generateObject({
        model: getLanguageModel(),
        schema: ContainerImageMetadataSchema,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this image of a container with multiple items. Extract metadata for the container and each visible item inside.

${categoryContext}

${existingItemsContext}

For each item in the container, provide detailed metadata including label, categories, manufacturer, and attributes. Be thorough and specific.
Return the final result as a structured object.`,
              },
              { type: 'image', image: imageData },
            ],
          },
        ],
      });
      return object;
    },
  };
}

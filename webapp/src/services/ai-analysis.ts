import { generateObject, generateText, stepCountIs, tool, Output } from 'ai';
import type { ToolSet } from 'ai';
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
import { getAIConfig } from './ai-config';
import { CURATED_CATEGORIES } from './category-defaults';
import { createLogger } from '@/lib/logger';

const log = createLogger('ai-analysis');

/**
 * Step budget for the experimental tool-calling loop: enough for the model to
 * run a couple of `searchCategories` probes and still produce the object, low
 * enough that a model which keeps calling the tool cannot run up an unbounded
 * bill. Exported so tests assert the same number the loop uses.
 */
export const EXPERIMENTAL_MAX_STEPS = 4;

/**
 * Runs one model call, recording what it cost. A vision call is the slowest and
 * most expensive thing this app does, and until now it produced no log line at
 * all - an upload that hung on the provider looked identical to one that was
 * never made.
 */
async function traced<T>(operation: string, run: () => Promise<T>): Promise<T> {
  const model = getLanguageModel();
  const modelId =
    typeof model === 'string'
      ? model
      : `${model.provider ?? 'unknown'}/${model.modelId ?? 'unknown'}`;
  const startedAt = Date.now();

  log.debug('model call started', { operation, model: modelId });

  try {
    const result = await run();
    // `usage` is the aggregate across every step for a multi-step
    // `generateText` loop, so the experimental path is costed in full here.
    const usage = (
      result as {
        usage?: { inputTokens?: number; outputTokens?: number };
      }
    ).usage;

    log.info('model call complete', {
      operation,
      model: modelId,
      durationMs: Date.now() - startedAt,
      inputTokens: usage?.inputTokens,
      outputTokens: usage?.outputTokens,
    });

    return result;
  } catch (err) {
    log.error('model call failed', {
      operation,
      model: modelId,
      durationMs: Date.now() - startedAt,
      err,
    });
    throw err;
  }
}

/**
 * Category library for maintaining consistency across AI analysis
 */
export interface CategoryLibrary {
  functional: string[];
  specific: string[];
  itemType: string[];
}

/** The three tiers of the category vocabulary. */
export type CategoryTier = keyof CategoryLibrary;

/**
 * Searches every category value in the database, not just the truncated sample
 * rendered into the prompt. Supplied by `inventory.ts`.
 */
export type SearchCategoriesFn = (
  query: string,
  type: CategoryTier
) => Promise<string[]>;

/** Renders one tier as a prompt line, with its size so the model can gauge it. */
function tierLine(label: string, values: string[]): string {
  return values.length > 0
    ? `- ${label} (${values.length}): ${values.join(', ')}`
    : `- ${label}: None yet`;
}

/**
 * Shared preamble telling the model how to name categories and attributes.
 *
 * The ordering matters: the decision ladder comes before the vocabulary so the
 * model reads "reuse first" as a rule and the lists as evidence, rather than
 * treating the lists as a menu of equally good options. The two vocabulary
 * blocks are deliberately headed differently — values already in the inventory
 * are binding, curated examples are only a nudge.
 */
function buildCategoryContext(
  existingCategories: CategoryLibrary,
  opts: { variant: 'item' | 'container'; experimental: boolean }
): string {
  const perItemRules =
    opts.variant === 'container'
      ? `
PER-ITEM CATEGORIES (CONTAINER ANALYSIS):
- Every entry in 'containerItems' gets its own categoryFunctional, categorySpecific and itemType, chosen independently by the ladder above. Do not copy the container's own labelling onto its contents.
- Two items of the same kind in this image MUST get byte-identical category strings — do not write "Screw" for one and "Screws" for the next.
- The container itself is described by containerLabel/containerNotes only; do not invent a category for it.
`
      : '';

  const experimentalRules = opts.experimental
    ? `
EXPERIMENTAL MODE: You have a tool \`searchCategories(query, type)\` that searches ALL existing categories, not just the examples above. BEFORE inventing a new category you MUST call it with relevant queries (e.g. "tool", "electronic") to confirm nothing existing fits. Prefer tool results over invention.
`
    : '';

  return `
CATEGORY & ATTRIBUTE VOCABULARY — REUSE FIRST

Pick each category value by walking this ladder in order and stopping at the first step that applies:
1. EXACT reuse — if a value under EXISTING INVENTORY matches semantically, YOU MUST use it verbatim. Match case-insensitively and treat hyphens and spaces as equivalent, so "power-tools", "Power tools" and "Power Tools" are the same value; write the existing spelling.
2. CLOSE synonym — if an existing value is a close synonym of what you would write ("Hand Tools" vs "Manual Tools", "Fasteners" vs "Fixings"), prefer the existing value.
3. CURATED example — if nothing existing fits, prefer a value from CURATED EXAMPLES below.
4. NEW — only if genuinely nothing above fits. A new value is a last resort, not a default.

NORMALISATION RULES (apply to every category value, new or reused):
- Title Case: "Power Tools", never "power-tools" or "POWER TOOLS".
- 1-3 words. No abbreviations ("Electrical Components", not "Elec Comp").
- 'itemType' is singular: "Screw", not "Screws".
- No brand or model names in categories — those belong in itemName / itemManufacturer.
- Alphanumeric (A-Z, a-z, 0-9), spaces and hyphens only. Attribute names follow the same rules ("Input Voltage", "Anti-Static Bags").

ANTI-PATTERNS — do NOT do these:
- Do NOT write "powertools" or "power-tools" when "Power Tools" is already in use.
- Do NOT pluralise an itemType ("Drills") or make it specific to one unit ("DeWalt Drill").
- Do NOT use a manufacturer as a category ("DeWalt", "Bosch").
- Do NOT coin a near-duplicate tier ("Hand Tool" alongside "Hand Tools").

EXISTING INVENTORY (MUST REUSE — these values are already in this inventory):
${tierLine('Functional', existingCategories.functional)}
${tierLine('Specific', existingCategories.specific)}
${tierLine('Item Types', existingCategories.itemType)}

CURATED EXAMPLES (may reuse — suggestions, not yet in this inventory):
${tierLine('Functional', CURATED_CATEGORIES.functional)}
${tierLine('Specific', CURATED_CATEGORIES.specific)}
${tierLine('Item Types', CURATED_CATEGORIES.itemType)}
${perItemRules}${experimentalRules}
DISPLAY NAME RULES:
- 'itemType' is the PRIMARY DISPLAY NAME. It should be a concise, generic noun (e.g., "Drill", "Screw", "Bin").
- 'itemName' is the SPECIFIC IDENTITY. It should include the brand and record if possible (e.g., "DeWalt DCD771", "Grizzly G8688").
- 'itemLabel' is a descriptive tag for the specific instance (e.g., "Main Workshop Drill").
`;
}

/**
 * The `searchCategories` tool offered to the model in experimental mode.
 *
 * Prefers the injected full-database search — reaching values past the
 * truncated sample in the prompt is the entire point of the tool. Falls back to
 * filtering the sample in memory when no search was supplied, and also when the
 * search throws, so a database hiccup degrades the answer rather than failing
 * the whole analysis.
 */
function buildSearchCategoriesTool(
  existingCategories: CategoryLibrary,
  search?: SearchCategoriesFn
): ToolSet {
  const filterInMemory = (query: string, type: CategoryTier): string[] => {
    const lowerQuery = query.toLowerCase();
    return existingCategories[type]
      .filter((category) => category.toLowerCase().includes(lowerQuery))
      .slice(0, 10);
  };

  return {
    searchCategories: tool({
      description:
        'Search all existing category values in this inventory. Call this before inventing a new category to confirm nothing existing fits.',
      inputSchema: z.object({
        query: z.string().describe('search substring'),
        type: z
          .enum(['functional', 'specific', 'itemType'])
          .describe('category domain'),
      }),
      execute: async ({
        query,
        type,
      }: {
        query: string;
        type: CategoryTier;
      }) => {
        let results: string[];
        if (search) {
          try {
            results = await search(query, type);
          } catch (err) {
            log.warn('searchCategories fell back to the prompt sample', {
              query,
              type,
              err,
            });
            results = filterInMemory(query, type);
          }
        } else {
          results = filterInMemory(query, type);
        }

        log.debug('searchCategories called', {
          query,
          type,
          results: results.length,
        });
        return results;
      },
    }),
  };
}

/**
 * Wrap a base64 data URL as an AI SDK `file` content part.
 *
 * The older `{ type: 'image', image }` part is deprecated; a `file` part wants
 * the media type declared alongside the payload, so split it back out of the
 * data URL and fall back to JPEG for anything that is not one.
 */
function imageFilePart(imageData: string) {
  const mediaType =
    /^data:(image\/[^;,]+)/.exec(imageData)?.[1] ?? 'image/jpeg';
  return { type: 'file' as const, mediaType, data: imageData };
}

/**
 * One image-analysis model call, in whichever shape the feature flag selects.
 *
 * Default: a single `generateObject` call, exactly as before the flag existed.
 *
 * Experimental: `generateText` with a tool loop. `generateObject` cannot
 * register tools in this SDK version (its options type has no `tools` key), so
 * the structured result comes from `Output.object`, which validates against the
 * same schema. `stopWhen` bounds the loop — v7 has no `maxSteps`.
 */
async function runStructuredAnalysis<T>(params: {
  operation: string;
  schema: z.ZodType<T>;
  prompt: string;
  imageData: string;
  tools: ToolSet;
}): Promise<T> {
  const { operation, schema, prompt, imageData, tools } = params;
  const messages = [
    {
      role: 'user' as const,
      content: [
        { type: 'text' as const, text: prompt },
        imageFilePart(imageData),
      ],
    },
  ];

  if (!getAIConfig().experimentalMode) {
    const { object } = await traced(operation, () =>
      generateObject({ model: getLanguageModel(), schema, messages })
    );
    return object;
  }

  const { output } = await traced(operation, () =>
    generateText({
      model: getLanguageModel(),
      output: Output.object({ schema }),
      messages,
      tools,
      stopWhen: stepCountIs(EXPERIMENTAL_MAX_STEPS),
    })
  );
  return output;
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
   * @param existingCategories - Existing category values for consistency (a truncated sample)
   * @param searchCategories - Tool function for AI to search all existing categories; only used in experimental mode
   * @returns Structured analysis result (item or container)
   */
  analyzeImage(
    imageData: string,
    existingCategories: CategoryLibrary,
    searchCategories?: SearchCategoriesFn
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
   * @param searchCategories - Tool function for AI to search all existing categories; only used in experimental mode
   * @returns Structured container metadata with detected items
   */
  analyzeContainerImageWithContext(
    imageData: string,
    existingItems: Item[],
    existingCategories: CategoryLibrary,
    searchCategories?: SearchCategoriesFn
  ): Promise<ContainerImageMetadata>;
}

/**
 * Create an AI Analysis Service instance
 * Note: This should only be called server-side or in API routes where environment variables are available
 */
export function createAIAnalysisService(): AIAnalysisService {
  return {
    async determineImageType(imageData: string): Promise<'item' | 'container'> {
      // Deliberately a plain single-step call in both modes: this is a
      // yes/no classification with no vocabulary to reuse, so a tool loop
      // would only add latency and cost.
      const { object } = await traced('determine-image-type', () =>
        generateObject({
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
                imageFilePart(imageData),
              ],
            },
          ],
        })
      );
      return object.type;
    },

    async analyzeImage(
      imageData: string,
      existingCategories: CategoryLibrary,
      searchCategories?: SearchCategoriesFn
    ): Promise<AnalysisResult> {
      // First determine the image type
      const imageType = await this.determineImageType(imageData);

      const experimental = getAIConfig().experimentalMode;
      const tools = buildSearchCategoriesTool(
        existingCategories,
        searchCategories
      );

      if (imageType === 'item') {
        const categoryContext = buildCategoryContext(existingCategories, {
          variant: 'item',
          experimental,
        });

        const data = await runStructuredAnalysis({
          operation: 'analyze-item-image',
          schema: ItemImageMetadataSchema,
          imageData,
          tools,
          prompt: `Analyze this image of an inventory item. Extract detailed metadata including label, notes, categories, manufacturer, and attributes.

${categoryContext}

Be thorough and specific in your analysis. Include relevant attributes like dimensions, specifications, quantities, colors, or other distinguishing features.
Return the final result as a structured object.`,
        });
        return { type: 'item', data };
      } else {
        const categoryContext = buildCategoryContext(existingCategories, {
          variant: 'container',
          experimental,
        });

        const data = await runStructuredAnalysis({
          operation: 'analyze-container-image',
          schema: ContainerImageMetadataSchema,
          imageData,
          tools,
          prompt: `Analyze this image of a container with multiple items. Extract metadata for the container and each visible item inside.

${categoryContext}

For each item in the container, provide detailed metadata including label, categories, manufacturer, and attributes. Be thorough and specific.
Return the final result as a structured object.`,
        });
        return { type: 'container', data };
      }
    },

    async analyzeContainerImageWithContext(
      imageData: string,
      existingItems: Item[],
      existingCategories: CategoryLibrary,
      searchCategories?: SearchCategoriesFn
    ): Promise<ContainerImageMetadata> {
      const experimental = getAIConfig().experimentalMode;

      // Build category context for AI
      const categoryContext = buildCategoryContext(existingCategories, {
        variant: 'container',
        experimental,
      });

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

      return await runStructuredAnalysis({
        operation: 'analyze-container-image-with-context',
        schema: ContainerImageMetadataSchema,
        imageData,
        tools: buildSearchCategoriesTool(existingCategories, searchCategories),
        prompt: `Analyze this image of a container with multiple items. Extract metadata for the container and each visible item inside.

${categoryContext}

${existingItemsContext}

For each item in the container, provide detailed metadata including label, categories, manufacturer, and attributes. Be thorough and specific.
Return the final result as a structured object.`,
      });
    },
  };
}

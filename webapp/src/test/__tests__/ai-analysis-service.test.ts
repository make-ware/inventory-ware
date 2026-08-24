import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ItemImageMetadataSchema,
  ContainerImageMetadataSchema,
} from '@project/shared';

const FAKE_MODEL = { vendor: 'fake', modelId: 'fake-model' };

const { generateObject, generateText } = vi.hoisted(() => ({
  generateObject: vi.fn(),
  generateText: vi.fn(),
}));

// Only the two call functions are replaced: `tool`, `Output` and `stepCountIs`
// must stay real, since the experimental path builds live tool definitions
// with them.
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ai')>()),
  generateObject,
  generateText,
}));
vi.mock('@/services/ai-provider', () => ({
  getLanguageModel: () => FAKE_MODEL,
}));

const { getAIConfig } = vi.hoisted(() => ({ getAIConfig: vi.fn() }));

vi.mock('@/services/ai-config', () => ({ getAIConfig }));

import {
  createAIAnalysisService,
  EXPERIMENTAL_MAX_STEPS,
} from '@/services/ai-analysis';
import type { CategoryLibrary } from '@/services/ai-analysis';

const CATEGORIES: CategoryLibrary = {
  functional: ['tools'],
  specific: ['power-tools', 'Hand Tools'],
  itemType: ['drill'],
};

const IMAGE = 'data:image/jpeg;base64,AAAA';

const ITEM_RESULT = {
  imageLabel: 'A drill',
  imageNotes: 'On a bench',
  item: {
    itemLabel: 'Cordless drill',
    itemNotes: '',
    categoryFunctional: 'tools',
    categorySpecific: 'power-tools',
    itemType: 'drill',
    itemName: 'DeWalt DCD771',
    itemManufacturer: 'DeWalt',
    itemAttributes: [],
  },
};

const CONTAINER_RESULT = {
  imageLabel: 'A bin',
  imageNotes: '',
  container: {
    containerLabel: 'Bin 1',
    containerNotes: '',
    containerItems: [],
  },
};

/** The text part of the first user message of the Nth call to `mock`. */
function promptOf(
  mock: typeof generateObject | typeof generateText,
  callIndex: number
): string {
  const call = mock.mock.calls[callIndex][0];
  return call.messages[0].content.find(
    (part: { type: string }) => part.type === 'text'
  ).text;
}

/** Turn the experimental tool loop on for the calls that follow. */
function enableExperimentalMode(): void {
  getAIConfig.mockReturnValue({ experimentalMode: true });
}

/** The `searchCategories` tool as handed to `generateText` on the Nth call. */
function toolOf(callIndex: number) {
  return generateText.mock.calls[callIndex][0].tools.searchCategories;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: the flag is off, so every existing expectation describes the
  // shipped, non-experimental behaviour.
  getAIConfig.mockReturnValue({ experimentalMode: false });
});

describe('AIAnalysisService', () => {
  it('routes every model call through the shared provider', async () => {
    // The regression guard for this refactor: no call site may construct its
    // own client. Exercises all four generateObject sites.
    generateObject
      .mockResolvedValueOnce({ object: { type: 'container' } })
      .mockResolvedValueOnce({ object: CONTAINER_RESULT })
      .mockResolvedValueOnce({ object: CONTAINER_RESULT });

    const service = createAIAnalysisService();
    await service.analyzeImage(IMAGE, CATEGORIES, async () => []);
    await service.analyzeContainerImageWithContext(IMAGE, [], CATEGORIES);

    expect(generateObject).toHaveBeenCalledTimes(3);
    for (const [args] of generateObject.mock.calls) {
      expect(args.model).toBe(FAKE_MODEL);
    }
  });

  it('returns the detected image type', async () => {
    generateObject.mockResolvedValueOnce({ object: { type: 'container' } });

    const service = createAIAnalysisService();

    await expect(service.determineImageType(IMAGE)).resolves.toBe('container');
  });

  it('sends the image as a file content part with its media type', async () => {
    generateObject.mockResolvedValueOnce({ object: { type: 'item' } });

    await createAIAnalysisService().determineImageType(IMAGE);

    expect(generateObject.mock.calls[0][0].messages[0].content).toContainEqual({
      type: 'file',
      mediaType: 'image/jpeg',
      data: IMAGE,
    });
  });

  it('falls back to image/jpeg when the payload is not a data URL', async () => {
    generateObject.mockResolvedValueOnce({ object: { type: 'item' } });

    await createAIAnalysisService().determineImageType('AAAA');

    expect(generateObject.mock.calls[0][0].messages[0].content).toContainEqual({
      type: 'file',
      mediaType: 'image/jpeg',
      data: 'AAAA',
    });
  });

  it('analyses a single item against the item schema', async () => {
    generateObject
      .mockResolvedValueOnce({ object: { type: 'item' } })
      .mockResolvedValueOnce({ object: ITEM_RESULT });

    const result = await createAIAnalysisService().analyzeImage(
      IMAGE,
      CATEGORIES,
      async () => []
    );

    expect(generateObject).toHaveBeenCalledTimes(2);
    expect(generateObject.mock.calls[1][0].schema).toBe(
      ItemImageMetadataSchema
    );
    expect(result).toEqual({ type: 'item', data: ITEM_RESULT });
  });

  it('analyses a container against the container schema', async () => {
    generateObject
      .mockResolvedValueOnce({ object: { type: 'container' } })
      .mockResolvedValueOnce({ object: CONTAINER_RESULT });

    const result = await createAIAnalysisService().analyzeImage(
      IMAGE,
      CATEGORIES,
      async () => []
    );

    expect(generateObject.mock.calls[1][0].schema).toBe(
      ContainerImageMetadataSchema
    );
    expect(result).toEqual({ type: 'container', data: CONTAINER_RESULT });
  });

  it('includes the existing category vocabulary in the prompt', async () => {
    generateObject
      .mockResolvedValueOnce({ object: { type: 'item' } })
      .mockResolvedValueOnce({ object: ITEM_RESULT });

    await createAIAnalysisService().analyzeImage(
      IMAGE,
      CATEGORIES,
      async () => []
    );

    expect(promptOf(generateObject, 1)).toContain('power-tools');
  });

  it('gives the model existing container items for consistent naming', async () => {
    generateObject.mockResolvedValueOnce({ object: CONTAINER_RESULT });

    await createAIAnalysisService().analyzeContainerImageWithContext(
      IMAGE,
      [{ itemLabel: 'Existing widget', itemType: 'widget' }] as never,
      CATEGORIES
    );

    expect(promptOf(generateObject, 0)).toContain('Existing widget');
  });

  it('does not instruct the model to use a tool that is never registered', async () => {
    // generateObject cannot register tools, so advertising `searchCategories`
    // in the prompt was asking the model to call something that does not exist.
    generateObject
      .mockResolvedValueOnce({ object: { type: 'item' } })
      .mockResolvedValueOnce({ object: ITEM_RESULT });

    await createAIAnalysisService().analyzeImage(
      IMAGE,
      CATEGORIES,
      async () => []
    );

    expect(promptOf(generateObject, 1)).not.toContain('searchCategories');
  });
});

describe('reuse-first prompt', () => {
  beforeEach(() => {
    generateObject
      .mockResolvedValueOnce({ object: { type: 'item' } })
      .mockResolvedValueOnce({ object: ITEM_RESULT });
  });

  it('states the reuse ladder and normalisation rules', async () => {
    await createAIAnalysisService().analyzeImage(IMAGE, CATEGORIES);

    const prompt = promptOf(generateObject, 1);
    expect(prompt).toContain('CATEGORY & ATTRIBUTE VOCABULARY — REUSE FIRST');
    expect(prompt).toContain('EXACT reuse');
    expect(prompt).toContain('NORMALISATION RULES');
    expect(prompt).toContain('ANTI-PATTERNS');
  });

  it('separates values already in use from merely curated suggestions', async () => {
    await createAIAnalysisService().analyzeImage(IMAGE, CATEGORIES);

    const prompt = promptOf(generateObject, 1);
    expect(prompt).toContain('EXISTING INVENTORY (MUST REUSE');
    expect(prompt).toContain('CURATED EXAMPLES (may reuse');
    // Existing values, and a curated one that is not in CATEGORIES.
    expect(prompt).toContain('Hand Tools');
    expect(prompt).toContain('Microcontrollers');
  });

  it('reports an empty tier as such rather than silently omitting it', async () => {
    await createAIAnalysisService().analyzeImage(IMAGE, {
      functional: [],
      specific: [],
      itemType: [],
    });

    expect(promptOf(generateObject, 1)).toContain('None yet');
  });
});

describe('container prompt', () => {
  it('carries per-item category rules the item prompt does not', async () => {
    generateObject
      .mockResolvedValueOnce({ object: { type: 'item' } })
      .mockResolvedValueOnce({ object: ITEM_RESULT })
      .mockResolvedValueOnce({ object: CONTAINER_RESULT });

    const service = createAIAnalysisService();
    await service.analyzeImage(IMAGE, CATEGORIES);
    await service.analyzeContainerImageWithContext(IMAGE, [], CATEGORIES);

    expect(promptOf(generateObject, 1)).not.toContain(
      'PER-ITEM CATEGORIES (CONTAINER ANALYSIS)'
    );
    const containerPrompt = promptOf(generateObject, 2);
    expect(containerPrompt).toContain(
      'PER-ITEM CATEGORIES (CONTAINER ANALYSIS)'
    );
    expect(containerPrompt).toContain('containerItems');
  });
});

describe('experimental tool loop', () => {
  it('runs the item analysis through generateText with a bounded tool loop', async () => {
    enableExperimentalMode();
    generateObject.mockResolvedValueOnce({ object: { type: 'item' } });
    generateText.mockResolvedValueOnce({ output: ITEM_RESULT });

    const result = await createAIAnalysisService().analyzeImage(
      IMAGE,
      CATEGORIES,
      async () => []
    );

    // The classification step stays a plain single-shot call.
    expect(generateObject).toHaveBeenCalledTimes(1);
    expect(generateText).toHaveBeenCalledTimes(1);

    const args = generateText.mock.calls[0][0];
    expect(args.model).toBe(FAKE_MODEL);
    expect(args.tools.searchCategories).toBeDefined();
    expect(args.stopWhen).toBeDefined();
    // The result is taken from the structured output, not the raw text.
    expect(result).toEqual({ type: 'item', data: ITEM_RESULT });
  });

  it('caps the loop at a small number of steps', async () => {
    expect(EXPERIMENTAL_MAX_STEPS).toBeGreaterThanOrEqual(3);
    expect(EXPERIMENTAL_MAX_STEPS).toBeLessThanOrEqual(5);
  });

  it('offers the tool on the container-with-context path too', async () => {
    enableExperimentalMode();
    generateText.mockResolvedValueOnce({ output: CONTAINER_RESULT });

    const result =
      await createAIAnalysisService().analyzeContainerImageWithContext(
        IMAGE,
        [],
        CATEGORIES,
        async () => []
      );

    expect(generateObject).not.toHaveBeenCalled();
    expect(generateText.mock.calls[0][0].tools.searchCategories).toBeDefined();
    expect(result).toEqual(CONTAINER_RESULT);
  });

  it('tells the model the tool exists', async () => {
    enableExperimentalMode();
    generateObject.mockResolvedValueOnce({ object: { type: 'item' } });
    generateText.mockResolvedValueOnce({ output: ITEM_RESULT });

    await createAIAnalysisService().analyzeImage(IMAGE, CATEGORIES);

    expect(promptOf(generateText, 0)).toContain('searchCategories');
  });

  it('prefers the injected full-database search over the prompt sample', async () => {
    enableExperimentalMode();
    generateObject.mockResolvedValueOnce({ object: { type: 'item' } });
    generateText.mockResolvedValueOnce({ output: ITEM_RESULT });
    // Returns a value that is NOT in CATEGORIES, proving the callback was used.
    const search = vi.fn(async () => ['Pneumatic Tools']);

    await createAIAnalysisService().analyzeImage(IMAGE, CATEGORIES, search);

    await expect(
      toolOf(0).execute({ query: 'tool', type: 'specific' })
    ).resolves.toEqual(['Pneumatic Tools']);
    expect(search).toHaveBeenCalledWith('tool', 'specific');
  });

  it('filters the prompt sample in memory when no search is supplied', async () => {
    enableExperimentalMode();
    generateObject.mockResolvedValueOnce({ object: { type: 'item' } });
    generateText.mockResolvedValueOnce({ output: ITEM_RESULT });

    await createAIAnalysisService().analyzeImage(IMAGE, CATEGORIES);

    await expect(
      toolOf(0).execute({ query: 'power', type: 'specific' })
    ).resolves.toEqual(['power-tools']);
    // Case-insensitive, and scoped to the requested tier.
    await expect(
      toolOf(0).execute({ query: 'HAND', type: 'specific' })
    ).resolves.toEqual(['Hand Tools']);
    await expect(
      toolOf(0).execute({ query: 'power', type: 'itemType' })
    ).resolves.toEqual([]);
  });

  it('degrades to the prompt sample when the search throws', async () => {
    enableExperimentalMode();
    generateObject.mockResolvedValueOnce({ object: { type: 'item' } });
    generateText.mockResolvedValueOnce({ output: ITEM_RESULT });
    const search = vi.fn(async () => {
      throw new Error('pocketbase unreachable');
    });

    await createAIAnalysisService().analyzeImage(IMAGE, CATEGORIES, search);

    await expect(
      toolOf(0).execute({ query: 'power', type: 'specific' })
    ).resolves.toEqual(['power-tools']);
  });
});

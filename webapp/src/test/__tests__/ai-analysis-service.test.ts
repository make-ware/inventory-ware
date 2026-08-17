import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ItemImageMetadataSchema,
  ContainerImageMetadataSchema,
} from '@project/shared';

const FAKE_MODEL = { vendor: 'fake', modelId: 'fake-model' };

const { generateObject } = vi.hoisted(() => ({ generateObject: vi.fn() }));

vi.mock('ai', () => ({ generateObject }));
vi.mock('@/services/ai-provider', () => ({
  getLanguageModel: () => FAKE_MODEL,
}));

import { createAIAnalysisService } from '@/services/ai-analysis';
import type { CategoryLibrary } from '@/services/ai-analysis';

const CATEGORIES: CategoryLibrary = {
  functional: ['tools'],
  specific: ['power-tools'],
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

/** The text part of the first user message of the Nth generateObject call. */
function promptOf(callIndex: number): string {
  const call = generateObject.mock.calls[callIndex][0];
  return call.messages[0].content.find(
    (part: { type: string }) => part.type === 'text'
  ).text;
}

beforeEach(() => {
  vi.clearAllMocks();
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

    expect(promptOf(1)).toContain('power-tools');
  });

  it('gives the model existing container items for consistent naming', async () => {
    generateObject.mockResolvedValueOnce({ object: CONTAINER_RESULT });

    await createAIAnalysisService().analyzeContainerImageWithContext(
      IMAGE,
      [{ itemLabel: 'Existing widget', itemType: 'widget' }] as never,
      CATEGORIES
    );

    expect(promptOf(0)).toContain('Existing widget');
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

    expect(promptOf(1)).not.toContain('searchCategories');
  });
});

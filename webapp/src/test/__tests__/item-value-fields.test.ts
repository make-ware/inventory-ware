/**
 * The one rule the two value fields exist to encode: AI analysis owns
 * `estimatedValue` and may overwrite it on every pass, while `itemValue` — the
 * number a human vouched for — is never in an AI-built write at all.
 *
 * These drive the real `createInventoryService` against a mocked PocketBase
 * collection, so what is asserted is the payload that would actually reach the
 * server, not an intermediate object.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createInventoryService } from '@/services/inventory';
import { resetAIConfigCache } from '@/services/ai-config';
import type { TypedPocketBase } from '@project/shared';

const analyzeImage = vi.fn();
const analyzeContainerImageWithContext = vi.fn();

vi.mock('@/services/ai-analysis', () => ({
  createAIAnalysisService: () => ({
    analyzeImage,
    analyzeContainerImageWithContext,
  }),
}));

const EXISTING_ITEM = {
  id: 'item-1',
  itemLabel: 'Cordless drill',
  itemName: 'DCD771',
  itemNotes: '',
  categoryFunctional: 'tools',
  categorySpecific: 'power-tools',
  itemType: 'drill',
  itemManufacturer: 'dewalt',
  itemAttributes: [],
  // The user typed this one in themselves; nothing below may touch it.
  itemValue: 200,
  estimatedValue: 90,
  ContainerRef: '',
  ImageRef: 'image-0',
  UserRef: 'user-1',
  created: '2026-01-01',
  updated: '2026-01-01',
  collectionId: 'items',
  collectionName: 'Items',
};

const UPLOADED_IMAGE = {
  id: 'image-1',
  imageType: 'unprocessed',
  analysisStatus: 'pending',
  UserRef: 'user-1',
  created: '2026-01-01',
  updated: '2026-01-01',
  collectionId: 'images',
  collectionName: 'Images',
};

function analysisWith(suggestedValue: number | undefined) {
  return {
    type: 'item' as const,
    data: {
      imageLabel: 'A drill',
      imageNotes: '',
      item: {
        itemLabel: 'Cordless drill',
        itemName: 'DCD771',
        itemNotes: 'Looks well used',
        categoryFunctional: 'tools',
        categorySpecific: 'power-tools',
        itemType: 'drill',
        itemManufacturer: 'dewalt',
        itemAttributes: [],
        ...(suggestedValue === undefined ? {} : { suggestedValue }),
      },
    },
  };
}

interface Harness {
  pb: TypedPocketBase;
  items: { update: ReturnType<typeof vi.fn> };
}

function makeHarness(): Harness {
  const items = {
    getOne: vi.fn().mockResolvedValue(EXISTING_ITEM),
    getList: vi
      .fn()
      .mockResolvedValue({ items: [], page: 1, perPage: 50, totalItems: 0 }),
    update: vi.fn().mockImplementation(async (_id: string, data: unknown) => ({
      ...EXISTING_ITEM,
      ...(data as object),
    })),
    create: vi.fn().mockResolvedValue(EXISTING_ITEM),
  };
  const images = {
    create: vi.fn().mockResolvedValue(UPLOADED_IMAGE),
    update: vi.fn().mockResolvedValue(UPLOADED_IMAGE),
    getOne: vi.fn().mockResolvedValue(UPLOADED_IMAGE),
  };
  const collections: Record<string, unknown> = {
    Items: items,
    Images: images,
    ImageMetadata: {
      getFirstListItem: vi.fn().mockRejectedValue(new Error('not found')),
      getList: vi
        .fn()
        .mockResolvedValue({ items: [], page: 1, perPage: 50, totalItems: 0 }),
      create: vi.fn().mockResolvedValue({}),
    },
    Containers: {
      getList: vi
        .fn()
        .mockResolvedValue({ items: [], page: 1, perPage: 50, totalItems: 0 }),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
  };

  const pb = {
    collection: vi.fn((name: string) => collections[name]),
    authStore: { token: 'token', model: { id: 'user-1' } },
  } as unknown as TypedPocketBase;

  return { pb, items };
}

/** The service reads the file itself, so this has to be a real File. */
function imageFile(): File {
  return new File([new Uint8Array([1, 2, 3, 4])], 'drill.jpg', {
    type: 'image/jpeg',
  });
}

/** The last payload sent to `Items.update` for the item under test. */
function lastItemPatch(harness: Harness): Record<string, unknown> {
  const calls = harness.items.update.mock.calls.filter(
    ([id]) => id === 'item-1'
  );
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][1] as Record<string, unknown>;
}

describe('AI re-analysis and the two value fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetAIConfigCache();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.AI_ESTIMATE_VALUE;
    delete process.env.OPENAI_API_KEY;
    resetAIConfigCache();
  });

  it('writes the model guess to estimatedValue and leaves itemValue alone', async () => {
    process.env.AI_ESTIMATE_VALUE = 'true';
    resetAIConfigCache();
    analyzeImage.mockResolvedValue(analysisWith(175));

    const harness = makeHarness();
    const service = createInventoryService(harness.pb);
    await service.processItemImageUpload(imageFile(), 'item-1', 'user-1');

    const patch = lastItemPatch(harness);
    expect(patch.estimatedValue).toBe(175);
    // Not "equal to the old value" — absent. A key that is present is a write,
    // and this path must never write the authoritative field.
    expect(patch).not.toHaveProperty('itemValue');
  });

  it('overwrites an estimate the previous analysis left behind', async () => {
    process.env.AI_ESTIMATE_VALUE = 'true';
    resetAIConfigCache();
    analyzeImage.mockResolvedValue(analysisWith(42));

    const harness = makeHarness();
    const service = createInventoryService(harness.pb);
    await service.processItemImageUpload(imageFile(), 'item-1', 'user-1');

    // EXISTING_ITEM.estimatedValue was 90.
    expect(lastItemPatch(harness).estimatedValue).toBe(42);
  });

  it('leaves the stored estimate alone when the model declines to guess', async () => {
    process.env.AI_ESTIMATE_VALUE = 'true';
    resetAIConfigCache();
    analyzeImage.mockResolvedValue(analysisWith(undefined));

    const harness = makeHarness();
    const service = createInventoryService(harness.pb);
    await service.processItemImageUpload(imageFile(), 'item-1', 'user-1');

    const patch = lastItemPatch(harness);
    // Proves the analysis path ran: on failure this method falls back to a
    // patch carrying only ImageRef, which would satisfy the assertions below
    // for the wrong reason.
    expect(patch.itemNotes).toBe('Looks well used');
    // Absent, not `undefined` and not 0 — either of those would clear it.
    expect(patch).not.toHaveProperty('estimatedValue');
    expect(patch).not.toHaveProperty('itemValue');
  });

  it('persists nothing when AI_ESTIMATE_VALUE is off, even if the model guesses', async () => {
    analyzeImage.mockResolvedValue(analysisWith(175));

    const harness = makeHarness();
    const service = createInventoryService(harness.pb);
    await service.processItemImageUpload(imageFile(), 'item-1', 'user-1');

    const patch = lastItemPatch(harness);
    expect(patch.itemNotes).toBe('Looks well used');
    expect(patch).not.toHaveProperty('estimatedValue');
    expect(patch).not.toHaveProperty('itemValue');
  });

  it('never writes itemValue when creating an item from a new upload', async () => {
    process.env.AI_ESTIMATE_VALUE = 'true';
    resetAIConfigCache();
    analyzeImage.mockResolvedValue(analysisWith(175));

    const harness = makeHarness();
    const service = createInventoryService(harness.pb);
    await service.processImageUpload(imageFile(), 'user-1');

    const created = (
      harness.pb.collection('Items') as unknown as {
        create: ReturnType<typeof vi.fn>;
      }
    ).create;
    expect(created).toHaveBeenCalled();
    const payload = created.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.estimatedValue).toBe(175);
    expect(payload).not.toHaveProperty('itemValue');
  });
});

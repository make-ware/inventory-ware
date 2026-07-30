import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ItemMutator, type TypedPocketBase } from '@project/shared';

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockGetList = vi.fn();

const mockPb = {
  collection: vi.fn(() => ({
    create: mockCreate,
    update: mockUpdate,
    delete: mockDelete,
    getList: mockGetList,
  })),
} as unknown as TypedPocketBase;

const fakeContext = {
  pb: mockPb,
  config: {
    pocketbaseUrl: 'http://localhost:8090',
    apiUrl: 'http://localhost:3000',
  },
  items: new ItemMutator(mockPb),
  containers: {},
  images: {},
  api: {},
};

vi.mock('../context.js', () => ({
  createContext: vi.fn(async () => fakeContext),
  requireUserId: () => 'user123',
}));

const { buildProgram } = await import('../program.js');

const runCli = (args: string[]) =>
  buildProgram().parseAsync(args, { from: 'user' });

describe('iw item', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('threads the authenticated user id into UserRef on create', async () => {
    mockCreate.mockResolvedValue({ id: 'item1', itemLabel: 'Hammer' });

    await runCli([
      'item',
      'create',
      '--label',
      'Hammer',
      '--functional',
      'Tools',
      '--specific',
      'Hand Tools',
      '--type',
      'Hammer',
    ]);

    // UserRef is required by ItemInputSchema and is NOT auto-filled by shared.
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        itemLabel: 'Hammer',
        UserRef: 'user123',
      })
    );
  });

  it('passes repeated --attr flags through as itemAttributes', async () => {
    mockCreate.mockResolvedValue({ id: 'item1' });

    await runCli([
      'item',
      'create',
      '--label',
      'Drill',
      '--functional',
      'Tools',
      '--specific',
      'Power Tools',
      '--type',
      'Drill',
      '--attr',
      'voltage=18V',
      '--attr',
      'color=blue',
    ]);

    const input = mockCreate.mock.calls[0][0];
    expect(input.itemAttributes).toHaveLength(2);
    expect(input.itemAttributes[0].name).toBe('voltage');
  });

  it('rejects an update with no fields instead of issuing a request', async () => {
    await expect(runCli(['item', 'update', 'item1'])).rejects.toThrow(
      /Nothing to update/
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('filters by container when --container is given', async () => {
    mockGetList.mockResolvedValue({ items: [], totalItems: 0 });

    await runCli(['item', 'list', '--container', 'container9']);

    expect(mockGetList).toHaveBeenCalledWith(
      1,
      100,
      expect.objectContaining({ filter: 'ContainerRef="container9"' })
    );
  });

  it('requires --yes before deleting', async () => {
    await expect(runCli(['item', 'delete', 'item1'])).rejects.toThrow(
      /without confirmation/
    );
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('surfaces a failed delete as an error', async () => {
    // BaseMutator.delete() swallows the error and returns false.
    mockDelete.mockRejectedValue(new Error('nope'));

    await expect(runCli(['item', 'delete', 'item1', '--yes'])).rejects.toThrow(
      /Could not delete item/
    );
  });
});

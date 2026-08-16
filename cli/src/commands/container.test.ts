import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ContainerMutator,
  ItemMutator,
  type TypedPocketBase,
} from '@project/shared';

const mockGetList = vi.fn();

const mockPb = {
  collection: vi.fn(() => ({ getList: mockGetList })),
} as unknown as TypedPocketBase;

const fakeContext = {
  pb: mockPb,
  config: {
    pocketbaseUrl: 'http://localhost:8090',
    apiUrl: 'http://localhost:3000',
  },
  items: new ItemMutator(mockPb),
  containers: new ContainerMutator(mockPb),
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

const emptyPage = {
  page: 1,
  perPage: 100,
  totalItems: 0,
  totalPages: 0,
  items: [],
};

describe('iw container list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetList.mockResolvedValue(emptyPage);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends no filter when nothing was asked for', async () => {
    await runCli(['container', 'list']);

    // An empty query must not become `containerLabel~""`, which matches all.
    expect(mockGetList).toHaveBeenCalledWith(1, 100, { sort: '-created' });
  });

  it('turns --search into a label/notes filter', async () => {
    await runCli(['container', 'list', '--search', 'garage']);

    expect(mockGetList).toHaveBeenCalledWith(
      1,
      100,
      expect.objectContaining({
        filter: '(containerLabel~"garage" || containerNotes~"garage")',
      })
    );
  });

  it('escapes a query that would otherwise break out of the filter', async () => {
    await runCli(['container', 'list', '--search', 'a" || id!="']);

    const filter = mockGetList.mock.calls[0][2].filter as string;
    expect(filter).toContain('\\"');
    expect(filter).toBe(
      '(containerLabel~"a\\" || id!=\\"" || containerNotes~"a\\" || id!=\\"")'
    );
  });

  it('threads pagination and sort through', async () => {
    await runCli([
      'container',
      'list',
      '--page',
      '3',
      '--per-page',
      '25',
      '--sort',
      'containerLabel',
    ]);

    expect(mockGetList).toHaveBeenCalledWith(3, 25, { sort: 'containerLabel' });
  });

  it('accepts the search alias and runs the same query', async () => {
    await runCli(['container', 'search', 'garage']);

    expect(mockGetList).toHaveBeenCalledWith(
      1,
      100,
      expect.objectContaining({
        filter: '(containerLabel~"garage" || containerNotes~"garage")',
      })
    );
  });
});

describe('iw container items', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetList.mockResolvedValue(emptyPage);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('filters by the positional container id', async () => {
    await runCli(['container', 'items', 'container9']);

    expect(mockGetList).toHaveBeenCalledWith(
      1,
      100,
      expect.objectContaining({ filter: 'ContainerRef="container9"' })
    );
  });

  it('supports the same sort and pagination flags as item list', async () => {
    await runCli([
      'container',
      'items',
      'container9',
      '--sort',
      'itemLabel',
      '--page',
      '2',
      '--per-page',
      '5',
    ]);

    expect(mockGetList).toHaveBeenCalledWith(
      2,
      5,
      expect.objectContaining({ sort: 'itemLabel' })
    );
  });

  it('does not offer --container, which the positional already supplies', async () => {
    await expect(
      runCli(['container', 'items', 'c1', '--container', 'c2'])
    ).rejects.toThrow(/unknown option/);
  });
});

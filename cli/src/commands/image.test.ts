import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageMutator, type TypedPocketBase } from '@project/shared';

const mockGetList = vi.fn();

const mockPb = {
  collection: vi.fn(() => ({ getList: mockGetList })),
  files: { getURL: vi.fn(() => 'http://localhost:8090/file') },
} as unknown as TypedPocketBase;

const fakeContext = {
  pb: mockPb,
  config: {
    pocketbaseUrl: 'http://localhost:8090',
    apiUrl: 'http://localhost:3000',
  },
  items: {},
  containers: {},
  images: new ImageMutator(mockPb),
  api: {},
};

vi.mock('../context.js', () => ({
  createContext: vi.fn(async () => fakeContext),
  requireUserId: () => 'user123',
}));

const { buildProgram } = await import('../program.js');

const runCli = (args: string[]) =>
  buildProgram().parseAsync(args, { from: 'user' });

describe('iw image list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetList.mockResolvedValue({
      page: 1,
      perPage: 100,
      totalItems: 0,
      totalPages: 0,
      items: [],
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('honours pagination alongside --status', async () => {
    // Regression: --status used to route through getByAnalysisStatus, which
    // hardcoded getList(1, 100) and silently dropped both paging flags.
    await runCli([
      'image',
      'list',
      '--status',
      'pending',
      '--page',
      '2',
      '--per-page',
      '10',
    ]);

    expect(mockGetList).toHaveBeenCalledWith(
      2,
      10,
      expect.objectContaining({ filter: 'analysisStatus="pending"' })
    );
  });

  it('combines --status and --type into one filter', async () => {
    await runCli(['image', 'list', '--status', 'failed', '--type', 'item']);

    expect(mockGetList).toHaveBeenCalledWith(
      1,
      100,
      expect.objectContaining({
        filter: '(analysisStatus="failed") && (imageType="item")',
      })
    );
  });

  it('supports --sort, which it previously had no flag for', async () => {
    await runCli(['image', 'list', '--sort', 'analysisStatus']);

    expect(mockGetList).toHaveBeenCalledWith(
      1,
      100,
      expect.objectContaining({ sort: 'analysisStatus' })
    );
  });

  it('rejects an invalid status against the shared enum', async () => {
    await expect(runCli(['image', 'list', '--status', 'done'])).rejects.toThrow(
      /Allowed choices are/
    );
    expect(mockGetList).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric --page instead of sending NaN', async () => {
    // This used to reach PocketBase as Number('abc') === NaN.
    await expect(runCli(['image', 'list', '--page', 'abc'])).rejects.toThrow(
      /Expected a whole number/
    );
    expect(mockGetList).not.toHaveBeenCalled();
  });
});

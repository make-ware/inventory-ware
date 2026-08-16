import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notLoggedIn, reportError, setVerbose, SilentExit } from './errors.js';

// Stub the context so these tests never touch a real config file, cached
// session, or PocketBase instance - the error contract must hold regardless.
vi.mock('./context.js', () => ({
  createContext: vi.fn(async () => ({
    pb: { authStore: { isValid: false, record: null } },
    config: {
      pocketbaseUrl: 'http://localhost:8090',
      apiUrl: 'http://localhost:3000',
    },
    items: {},
    containers: {},
    images: {},
    api: {},
  })),
  requireUserId: () => {
    throw notLoggedIn();
  },
}));

const { buildProgram } = await import('./program.js');

/**
 * Drive the real program and capture what a user would see on stderr.
 *
 * This is the contract the whole error design exists to keep: every usage
 * mistake gets `error:`, the usage line, hints, and a --help pointer.
 */
async function runCli(args: string[]): Promise<{
  exitCode: number;
  stderr: string[];
  stdout: string[];
}> {
  const stderr: string[] = [];
  const stdout: string[] = [];
  const errorSpy = vi
    .spyOn(console, 'error')
    .mockImplementation((...a: unknown[]) => {
      stderr.push(a.join(' '));
    });
  const logSpy = vi
    .spyOn(console, 'log')
    .mockImplementation((...a: unknown[]) => {
      stdout.push(a.join(' '));
    });
  // Commander writes help through process.stdout/stderr directly; swallow it
  // so the suite's own output stays readable.
  const writeSpy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation(() => true);
  const writeErrSpy = vi
    .spyOn(process.stderr, 'write')
    .mockImplementation(() => true);

  let exitCode = 0;
  try {
    await buildProgram().parseAsync(args, { from: 'user' });
  } catch (error) {
    exitCode = reportError(error);
  } finally {
    errorSpy.mockRestore();
    logSpy.mockRestore();
    writeSpy.mockRestore();
    writeErrSpy.mockRestore();
  }
  return { exitCode, stderr, stdout };
}

beforeEach(() => {
  setVerbose(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('usage errors', () => {
  it('reports a bad option value with usage and a pointer', async () => {
    const { exitCode, stderr } = await runCli([
      'item',
      'list',
      '--page',
      'abc',
    ]);

    expect(exitCode).toBe(2);
    expect(stderr[0]).toBe(
      "error: option '--page <n>' argument 'abc' is invalid. Expected a whole number."
    );
    expect(stderr[1]).toBe('');
    expect(stderr[2]).toBe('Usage: iw item list [options]');
    expect(stderr.at(-1)).toBe('Run `iw item list --help` for all options.');
  });

  it('suggests the flag the user meant', async () => {
    const { exitCode, stderr } = await runCli([
      'item',
      'list',
      '--containr',
      'x',
    ]);

    expect(exitCode).toBe(2);
    expect(stderr[0]).toBe("error: unknown option '--containr'");
    expect(stderr).toContain('hint: Did you mean --container?');
    expect(stderr.at(-1)).toBe('Run `iw item list --help` for all options.');
  });

  it('validates --sort against the entity allowlist before hitting the API', async () => {
    const { exitCode, stderr } = await runCli([
      'item',
      'list',
      '--sort',
      '-crated',
    ]);

    expect(exitCode).toBe(2);
    expect(stderr[0]).toBe('error: Unknown sort field "crated" in --sort.');
    expect(stderr).toContain('hint: did you mean "created"?');
    expect(stderr.join('\n')).toMatch(/hint: valid sort fields: .*created/);
  });

  it('rejects --all together with --page instead of ignoring one', async () => {
    const { exitCode, stderr } = await runCli([
      'item',
      'list',
      '--all',
      '--page',
      '2',
    ]);

    expect(exitCode).toBe(2);
    expect(stderr[0]).toMatch(/--all' cannot be used with option '--page/);
  });

  it('reports an unknown subcommand against its parent', async () => {
    const { exitCode, stderr } = await runCli(['item', 'nonsuch']);

    expect(exitCode).toBe(2);
    expect(stderr[0]).toBe("error: unknown command 'nonsuch'");
    expect(stderr).toContain('Usage: iw item [options] [command]');
    expect(stderr.at(-1)).toBe('Run `iw item --help` for all options.');
  });

  it('rejects a bad --status via the shared enum, not a local copy', async () => {
    const { exitCode, stderr } = await runCli([
      'image',
      'list',
      '--status',
      'done',
    ]);

    expect(exitCode).toBe(2);
    expect(stderr[0]).toMatch(
      /Allowed choices are pending, processing, completed, failed/
    );
  });
});

describe('non-usage errors', () => {
  it('does not print usage for an error help cannot fix', async () => {
    // Not logged in: showing the flag list would be noise.
    const { exitCode, stderr } = await runCli(['item', 'get', 'missing']);

    expect(exitCode).toBe(4);
    expect(stderr).toEqual([
      'error: Not logged in.',
      'hint: Run `iw login` first.',
    ]);
  });
});

describe('help and version', () => {
  it('exits 0 with nothing on stderr for --help', async () => {
    const { exitCode, stderr } = await runCli(['--help']);
    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
  });

  it('exits 0 for a subcommand --help', async () => {
    const { exitCode, stderr } = await runCli(['item', 'list', '--help']);
    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
  });

  it('exits 0 for --version', async () => {
    const { exitCode, stderr } = await runCli(['--version']);
    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
  });

  it('treats a bare invocation as a usage miss', async () => {
    const { exitCode } = await runCli([]);
    expect(exitCode).toBe(2);
  });
});

describe('SilentExit', () => {
  it('prints nothing and carries its own exit code', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(reportError(new SilentExit(0))).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });
});

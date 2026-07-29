import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CliError,
  EXIT,
  setVerbose,
  toCliError,
  withQuietMutators,
} from './errors.js';

describe('toCliError', () => {
  it('passes CliError through untouched', () => {
    const original = new CliError('boom', EXIT.USAGE);
    expect(toCliError(original)).toBe(original);
  });

  it('maps a 404 to the not-found exit code', () => {
    // PocketBase's 404 message is "The requested resource wasn't found.",
    // which BaseMutator.isNotFoundError does not recognise - so the error
    // reaches us as a throw and we classify it by status here.
    const error = Object.assign(
      new Error("The requested resource wasn't found."),
      { status: 404 }
    );
    const cliError = toCliError(error);
    expect(cliError.exitCode).toBe(EXIT.NOT_FOUND);
  });

  it('maps 401 and 403 to the auth exit code with a re-login hint', () => {
    for (const status of [401, 403]) {
      const cliError = toCliError(Object.assign(new Error('nope'), { status }));
      expect(cliError.exitCode).toBe(EXIT.AUTH);
      expect(cliError.hint).toMatch(/iw login/);
    }
  });

  it('maps network failures to the API exit code', () => {
    const cliError = toCliError(new Error('fetch failed'));
    expect(cliError.exitCode).toBe(EXIT.API);
  });
});

describe('withQuietMutators', () => {
  afterEach(() => {
    setVerbose(false);
    vi.restoreAllMocks();
  });

  it('suppresses BaseMutator console noise by default', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setVerbose(false);

    await withQuietMutators(async () => {
      console.error('Error in ItemMutator:', 'details');
    });

    expect(spy).not.toHaveBeenCalled();
  });

  it('restores console.error afterwards, even on throw', async () => {
    const before = console.error;
    await expect(
      withQuietMutators(async () => {
        throw new Error('kaboom');
      })
    ).rejects.toThrow('kaboom');
    expect(console.error).toBe(before);
  });

  it('lets output through when verbose', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setVerbose(true);

    await withQuietMutators(async () => {
      console.error('Error in ItemMutator:', 'details');
    });

    expect(spy).toHaveBeenCalled();
  });
});

import { parseAuthError } from '@project/shared';

/** Process exit codes, kept stable so scripts can branch on them. */
export const EXIT = {
  GENERAL: 1,
  USAGE: 2,
  NOT_FOUND: 3,
  AUTH: 4,
  API: 5,
} as const;

export class CliError extends Error {
  readonly exitCode: number;
  readonly hint?: string;

  constructor(message: string, exitCode: number = EXIT.GENERAL, hint?: string) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
    this.hint = hint;
  }
}

export const notLoggedIn = () =>
  new CliError('Not logged in.', EXIT.AUTH, 'Run `iw login` first.');

let verbose = false;

export function setVerbose(value: boolean): void {
  verbose = value;
}

export function isVerbose(): boolean {
  return verbose;
}

/**
 * Run an operation with `console.error` suppressed.
 *
 * The shared `BaseMutator` logs to `console.error` before rethrowing on
 * create/getList/delete. That noise would corrupt `--json` output, so it is
 * swallowed unless `--verbose` was passed.
 */
export async function withQuietMutators<T>(fn: () => Promise<T>): Promise<T> {
  if (verbose) return fn();

  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
}

function statusOf(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as { status: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return undefined;
}

/**
 * Turn any thrown value into a CliError with a useful message and exit code.
 */
export function toCliError(error: unknown): CliError {
  if (error instanceof CliError) return error;

  const status = statusOf(error);
  if (status === 401 || status === 403) {
    return new CliError(
      'Authentication failed or session expired.',
      EXIT.AUTH,
      'Run `iw login` to sign in again.'
    );
  }
  if (status === 404) {
    return new CliError('Record not found.', EXIT.NOT_FOUND);
  }

  const parsed = parseAuthError(error);
  const exitCode = parsed.type === 'network' ? EXIT.API : EXIT.GENERAL;
  return new CliError(parsed.message, exitCode);
}

/** Print an error to stderr and return the exit code to use. */
export function reportError(error: unknown): number {
  const cliError = toCliError(error);
  console.error(`error: ${cliError.message}`);
  if (cliError.hint) console.error(cliError.hint);
  if (verbose && error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  return cliError.exitCode;
}

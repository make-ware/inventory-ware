import type { Command } from 'commander';
import { parseAuthError } from '@project/shared';

/** Process exit codes, kept stable so scripts can branch on them. */
export const EXIT = {
  GENERAL: 1,
  USAGE: 2,
  NOT_FOUND: 3,
  AUTH: 4,
  API: 5,
} as const;

/**
 * Where a usage error happened, so the reporter can point at the right help.
 *
 * `usage` is the rendered "Usage: iw item list [options]" line and `command`
 * is the invocation path ("iw item list") used for the --help pointer.
 */
export interface UsageContext {
  usage: string;
  command: string;
}

/** Build a UsageContext from the command that failed. */
export function usageContext(command: Command): UsageContext {
  const path: string[] = [];
  for (
    let current: Command | null = command;
    current;
    current = current.parent
  ) {
    path.unshift(current.name());
  }
  return {
    usage: `Usage: ${command.createHelp().commandUsage(command)}`,
    command: path.join(' '),
  };
}

export class CliError extends Error {
  readonly exitCode: number;
  readonly hints: string[];
  /** Filled in by `run()`/`applyErrorHandling` once the command is known. */
  usage?: UsageContext;

  constructor(
    message: string,
    exitCode: number = EXIT.GENERAL,
    hint?: string | string[],
    usage?: UsageContext,
    options?: { cause?: unknown }
  ) {
    super(message, options as ErrorOptions);
    this.name = 'CliError';
    this.exitCode = exitCode;
    this.hints = hint === undefined ? [] : Array.isArray(hint) ? hint : [hint];
    this.usage = usage;
  }

  /** The first hint. Kept for callers that only ever set one. */
  get hint(): string | undefined {
    return this.hints[0];
  }
}

/**
 * Thrown for `--help` and `--version`, which Commander treats as errors but
 * which are successful outcomes. Carries only an exit code and prints nothing.
 */
export class SilentExit extends Error {
  readonly exitCode: number;

  constructor(exitCode: number) {
    super('silent exit');
    this.name = 'SilentExit';
    this.exitCode = exitCode;
  }
}

export const notLoggedIn = () =>
  new CliError('Not logged in.', EXIT.AUTH, 'Run `iw login` first.');

/**
 * Attach usage context to a usage error that does not have it yet.
 *
 * Only usage errors get the treatment - a 404 or a network failure is not
 * something the help text can fix, so printing it would be noise.
 */
export function attachUsage(error: unknown, command: Command): unknown {
  if (
    error instanceof CliError &&
    error.exitCode === EXIT.USAGE &&
    !error.usage
  ) {
    error.usage = usageContext(command);
  }
  return error;
}

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
 * Recognise a ZodError without `instanceof`.
 *
 * The release bundle inlines `@project/shared`, so a second copy of Zod can
 * end up in the graph and `instanceof z.ZodError` would miss.
 */
function isZodError(
  error: unknown
): error is { issues: Array<{ path: PropertyKey[]; message: string }> } {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'ZodError' &&
    Array.isArray((error as { issues?: unknown }).issues)
  );
}

function formatZodIssue(issue: {
  path: PropertyKey[];
  message: string;
}): string {
  const path = issue.path.map(String).join('.');
  return path ? `${path}: ${issue.message}` : issue.message;
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

  if (isZodError(error)) {
    // Show at most five issues; a wholly wrong payload would otherwise bury
    // the useful ones.
    const issues = error.issues.slice(0, 5).map(formatZodIssue);
    if (error.issues.length > issues.length) {
      issues.push(`...and ${error.issues.length - issues.length} more`);
    }
    return new CliError('Invalid input.', EXIT.USAGE, issues, undefined, {
      cause: error,
    });
  }

  const parsed = parseAuthError(error);
  const exitCode = parsed.type === 'network' ? EXIT.API : EXIT.GENERAL;
  return new CliError(parsed.message, exitCode, undefined, undefined, {
    cause: error,
  });
}

/** Print an error to stderr and return the exit code to use. */
export function reportError(error: unknown): number {
  if (error instanceof SilentExit) return error.exitCode;

  const cliError = toCliError(error);
  console.error(`error: ${cliError.message}`);

  if (cliError.usage) {
    console.error('');
    console.error(cliError.usage.usage);
  }
  for (const hint of cliError.hints) {
    console.error(`hint: ${hint}`);
  }
  if (cliError.usage) {
    console.error(`Run \`${cliError.usage.command} --help\` for all options.`);
  }

  if (verbose) {
    const cause = cliError.cause ?? error;
    if (cause instanceof Error && cause.stack) console.error(cause.stack);
  }
  return cliError.exitCode;
}

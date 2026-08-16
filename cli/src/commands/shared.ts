import { type Command, InvalidArgumentError } from 'commander';
import { createContext, type Context } from '../context.js';
import type { GlobalFlags } from '../config.js';
import { attachUsage } from '../errors.js';

/**
 * Build a context from the merged global options and run a command body.
 *
 * Errors propagate to the top-level handler in `cli.ts`, which maps them to a
 * message and exit code. Usage errors pick up the failing command's usage line
 * on the way out so the reporter can show it.
 */
export async function run(
  command: Command,
  body: (ctx: Context) => Promise<void>
): Promise<void> {
  try {
    const opts = command.optsWithGlobals() as GlobalFlags;
    const ctx = await createContext({
      url: opts.url,
      pbUrl: opts.pbUrl,
      apiUrl: opts.apiUrl,
    });
    await body(ctx);
  } catch (error) {
    throw attachUsage(error, command);
  }
}

/**
 * Parse repeated `--attr name=value` flags into an accumulating array.
 *
 * Throws `InvalidArgumentError` so Commander formats and reports it like any
 * other bad option value rather than rethrowing it raw.
 */
export function collectAttr(
  value: string,
  previous: Array<{ name: string; value: string }> = []
): Array<{ name: string; value: string }> {
  const index = value.indexOf('=');
  if (index <= 0) {
    throw new InvalidArgumentError('Expected name=value.');
  }
  return [
    ...previous,
    {
      name: value.slice(0, index).trim(),
      value: value.slice(index + 1).trim(),
    },
  ];
}

/**
 * Positive-integer argParser.
 *
 * `name` is only used to keep the message self-describing when the parser is
 * called outside Commander (which prefixes the flag itself).
 */
export function parseIntOption(value: string, name: string): number {
  if (!/^\d+$/.test(value.trim())) {
    throw new InvalidArgumentError(
      `Invalid ${name} "${value}". Expected a positive integer.`
    );
  }
  const parsed = Number.parseInt(value, 10);
  if (parsed < 1) {
    throw new InvalidArgumentError(
      `Invalid ${name} "${value}". Expected a positive integer.`
    );
  }
  return parsed;
}

/** Drop undefined entries so PocketBase is not sent explicit nulls. */
export function compact<T extends Record<string, unknown>>(
  input: T
): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

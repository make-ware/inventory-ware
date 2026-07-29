import type { Command } from 'commander';
import { createContext, type Context } from '../context.js';
import type { GlobalFlags } from '../config.js';

/**
 * Build a context from the merged global options and run a command body.
 *
 * Errors propagate to the top-level handler in `cli.ts`, which maps them to a
 * message and exit code.
 */
export async function run(
  command: Command,
  body: (ctx: Context) => Promise<void>
): Promise<void> {
  const opts = command.optsWithGlobals() as GlobalFlags;
  const ctx = await createContext({
    pbUrl: opts.pbUrl,
    apiUrl: opts.apiUrl,
  });
  await body(ctx);
}

/** Parse repeated `--attr name=value` flags into an accumulating array. */
export function collectAttr(
  value: string,
  previous: Array<{ name: string; value: string }> = []
): Array<{ name: string; value: string }> {
  const index = value.indexOf('=');
  if (index <= 0) {
    throw new Error(`Invalid --attr "${value}". Expected name=value.`);
  }
  return [
    ...previous,
    {
      name: value.slice(0, index).trim(),
      value: value.slice(index + 1).trim(),
    },
  ];
}

export function parseIntOption(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Invalid ${name} "${value}". Expected a positive integer.`);
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

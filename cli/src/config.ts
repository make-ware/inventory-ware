import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CliError, EXIT } from './errors.js';

export interface CliConfig {
  pocketbaseUrl: string;
  apiUrl: string;
}

/** Flags accepted on the root command, applying to every subcommand. */
export interface GlobalFlags {
  /** The application origin - covers both PocketBase and the webapp. */
  url?: string;
  /** Advanced overrides for split deployments (hidden from --help). */
  pbUrl?: string;
  apiUrl?: string;
}

/**
 * Used only when no application URL is configured at all, matching the
 * development layout where PocketBase and Next.js run on separate ports.
 * Behind nginx a single origin serves both, so one URL is enough.
 */
const DEFAULTS: CliConfig = {
  pocketbaseUrl: 'http://localhost:8090',
  apiUrl: 'http://localhost:3000',
};

export function configDir(): string {
  const base =
    process.env.XDG_CONFIG_HOME && process.env.XDG_CONFIG_HOME.trim()
      ? process.env.XDG_CONFIG_HOME
      : join(homedir(), '.config');
  return join(base, 'inventory-ware');
}

export function configPath(): string {
  return join(configDir(), 'config.json');
}

export function authPath(): string {
  return join(configDir(), 'auth.json');
}

interface ConfigFile {
  /** Single application origin. */
  appUrl?: string;
  /** Advanced per-service overrides. */
  pocketbaseUrl?: string;
  apiUrl?: string;
}

const CONFIG_KEYS = ['appUrl', 'pocketbaseUrl', 'apiUrl'] as const;

export async function readConfigFile(
  path: string = configPath()
): Promise<ConfigFile> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    return {};
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CliError(
      `Config file at ${path} is not valid JSON.`,
      EXIT.USAGE,
      'Fix or delete the file, then try again.'
    );
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new CliError(
      `Config file at ${path} must contain a JSON object.`,
      EXIT.USAGE
    );
  }

  const record = parsed as Record<string, unknown>;
  const result: ConfigFile = {};
  for (const key of CONFIG_KEYS) {
    const value = record[key];
    if (value === undefined) continue;
    if (typeof value !== 'string') {
      throw new CliError(`Config key "${key}" must be a string.`, EXIT.USAGE);
    }
    result[key] = value;
  }
  return result;
}

export async function writeConfigFile(
  values: ConfigFile,
  path: string = configPath()
): Promise<void> {
  await mkdir(configDir(), { recursive: true, mode: 0o700 });
  const current = await readConfigFile(path);
  const merged = { ...current, ...values };
  await writeFile(path, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
}

function validUrl(value: string, source: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  try {
    new URL(trimmed);
  } catch {
    // The webapp accepts a relative "/" and resolves it against the browser
    // origin; a CLI has no origin to resolve against, so say so explicitly.
    throw new CliError(
      `Invalid URL from ${source}: ${value}`,
      EXIT.USAGE,
      'An absolute URL is required, e.g. https://inventory.example.com'
    );
  }
  return trimmed;
}

/** First candidate with a value wins; candidates are [value, source] pairs. */
function pick(
  candidates: Array<[string | undefined, string]>,
  fallback: string
): { value: string; source: string } {
  for (const [value, source] of candidates) {
    if (value) return { value, source };
  }
  return { value: fallback, source: 'default' };
}

/**
 * Resolve the URLs the CLI talks to.
 *
 * Normally there is a single application origin (`--url` / `APP_URL`): behind
 * nginx, `/api/` and `/_/` route to PocketBase while `/api-next/` and `/` route
 * to the webapp, so one value serves both. `--pb-url`/`--api-url` remain as
 * hidden overrides for split deployments, and with nothing set at all we fall
 * back to the development ports.
 *
 * Precedence per resolved key:
 *   specific flag > --url > APP_URL > config file (specific) >
 *   config file (appUrl) > default
 */
export async function resolveConfig(
  flags: GlobalFlags = {},
  path: string = configPath()
): Promise<CliConfig> {
  const file = await readConfigFile(path);
  const appUrl = process.env.APP_URL;

  const pb = pick(
    [
      [flags.pbUrl, 'flag --pb-url'],
      [flags.url, 'flag --url'],
      [appUrl, 'environment APP_URL'],
      [file.pocketbaseUrl, 'config file (pocketbaseUrl)'],
      [file.appUrl, 'config file (appUrl)'],
    ],
    DEFAULTS.pocketbaseUrl
  );

  const api = pick(
    [
      [flags.apiUrl, 'flag --api-url'],
      [flags.url, 'flag --url'],
      [appUrl, 'environment APP_URL'],
      [file.apiUrl, 'config file (apiUrl)'],
      [file.appUrl, 'config file (appUrl)'],
    ],
    DEFAULTS.apiUrl
  );

  return {
    pocketbaseUrl: validUrl(pb.value, `PocketBase URL (${pb.source})`),
    apiUrl: validUrl(api.value, `API URL (${api.source})`),
  };
}

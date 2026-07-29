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
  pbUrl?: string;
  apiUrl?: string;
}

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

type ConfigFile = Partial<CliConfig>;

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
  for (const key of ['pocketbaseUrl', 'apiUrl'] as const) {
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
    throw new CliError(`Invalid URL from ${source}: ${value}`, EXIT.USAGE);
  }
  return trimmed;
}

function pick(
  flag: string | undefined,
  env: string | undefined,
  file: string | undefined,
  fallback: string
): { value: string; source: string } {
  if (flag) return { value: flag, source: 'flag' };
  if (env) return { value: env, source: 'environment' };
  if (file) return { value: file, source: 'config file' };
  return { value: fallback, source: 'default' };
}

/**
 * Resolve configuration with precedence: flag > env > config file > default.
 */
export async function resolveConfig(
  flags: GlobalFlags = {},
  path: string = configPath()
): Promise<CliConfig> {
  const file = await readConfigFile(path);

  const pb = pick(
    flags.pbUrl,
    process.env.POCKETBASE_URL,
    file.pocketbaseUrl,
    DEFAULTS.pocketbaseUrl
  );
  const api = pick(
    flags.apiUrl,
    process.env.INVENTORY_WARE_API_URL,
    file.apiUrl,
    DEFAULTS.apiUrl
  );

  return {
    pocketbaseUrl: validUrl(pb.value, `PocketBase URL (${pb.source})`),
    apiUrl: validUrl(api.value, `API URL (${api.source})`),
  };
}

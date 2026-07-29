import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveConfig, readConfigFile } from './config.js';
import { CliError } from './errors.js';

const ENV_KEYS = ['APP_URL', 'POCKETBASE_URL', 'INVENTORY_WARE_API_URL'];

describe('resolveConfig', () => {
  let dir: string;
  let file: string;

  const clearEnv = () => {
    for (const key of ENV_KEYS) delete process.env[key];
  };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'iw-config-'));
    file = join(dir, 'config.json');
    clearEnv();
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    clearEnv();
  });

  const write = (value: unknown) =>
    writeFile(file, JSON.stringify(value), 'utf8');

  it('falls back to the development ports when nothing is set', async () => {
    // Also the docker-compose layout: no nginx, both services on own ports.
    const config = await resolveConfig({}, file);
    expect(config).toEqual({
      pocketbaseUrl: 'http://localhost:8090',
      apiUrl: 'http://localhost:3000',
    });
  });

  it('points both services at a single APP_URL', async () => {
    // Behind nginx one origin serves both: /api/ -> PocketBase,
    // /api-next/ -> webapp.
    process.env.APP_URL = 'https://inventory.example.com';

    const config = await resolveConfig({}, file);
    expect(config.pocketbaseUrl).toBe('https://inventory.example.com');
    expect(config.apiUrl).toBe('https://inventory.example.com');
  });

  it('points both services at a single --url flag', async () => {
    const config = await resolveConfig(
      { url: 'https://flag.example.com' },
      file
    );
    expect(config.pocketbaseUrl).toBe('https://flag.example.com');
    expect(config.apiUrl).toBe('https://flag.example.com');
  });

  it('prefers --url over APP_URL', async () => {
    process.env.APP_URL = 'https://env.example.com';

    const config = await resolveConfig(
      { url: 'https://flag.example.com' },
      file
    );
    expect(config.pocketbaseUrl).toBe('https://flag.example.com');
  });

  it('lets --pb-url override just PocketBase, leaving the webapp on --url', async () => {
    const config = await resolveConfig(
      { url: 'https://app.example.com', pbUrl: 'http://127.0.0.1:8090' },
      file
    );
    expect(config.pocketbaseUrl).toBe('http://127.0.0.1:8090');
    expect(config.apiUrl).toBe('https://app.example.com');
  });

  it('lets --api-url override just the webapp, leaving PocketBase on APP_URL', async () => {
    process.env.APP_URL = 'https://app.example.com';

    const config = await resolveConfig(
      { apiUrl: 'http://127.0.0.1:3000' },
      file
    );
    expect(config.pocketbaseUrl).toBe('https://app.example.com');
    expect(config.apiUrl).toBe('http://127.0.0.1:3000');
  });

  it('ignores POCKETBASE_URL and INVENTORY_WARE_API_URL', async () => {
    // POCKETBASE_URL is the webapp's server-side internal address (in
    // docker-compose it is an unroutable container hostname), so the CLI
    // deliberately does not read it.
    process.env.POCKETBASE_URL = 'http://pocketbase:8090';
    process.env.INVENTORY_WARE_API_URL = 'http://webapp:3000';

    const config = await resolveConfig({}, file);
    expect(config.pocketbaseUrl).toBe('http://localhost:8090');
    expect(config.apiUrl).toBe('http://localhost:3000');
  });

  it('reads appUrl from the config file', async () => {
    await write({ appUrl: 'https://file.example.com' });

    const config = await resolveConfig({}, file);
    expect(config.pocketbaseUrl).toBe('https://file.example.com');
    expect(config.apiUrl).toBe('https://file.example.com');
  });

  it('prefers a specific config key over appUrl', async () => {
    await write({
      appUrl: 'https://file.example.com',
      pocketbaseUrl: 'https://pb.example.com',
    });

    const config = await resolveConfig({}, file);
    expect(config.pocketbaseUrl).toBe('https://pb.example.com');
    expect(config.apiUrl).toBe('https://file.example.com');
  });

  it('prefers APP_URL over the config file', async () => {
    await write({ appUrl: 'https://file.example.com' });
    process.env.APP_URL = 'https://env.example.com';

    const config = await resolveConfig({}, file);
    expect(config.pocketbaseUrl).toBe('https://env.example.com');
  });

  it('strips trailing slashes so path joins stay predictable', async () => {
    // One value is concatenated with both /api/... and /api-next/...
    const config = await resolveConfig(
      { url: 'https://app.example.com//' },
      file
    );
    expect(config.pocketbaseUrl).toBe('https://app.example.com');
    expect(config.apiUrl).toBe('https://app.example.com');
  });

  it('rejects a relative URL, which has no origin to resolve against', async () => {
    // The webapp accepts "/" and resolves it against window.location.origin;
    // a CLI cannot.
    await expect(resolveConfig({ url: '/' }, file)).rejects.toThrow(CliError);
    await expect(resolveConfig({ url: '/' }, file)).rejects.toThrow(
      /Invalid URL/
    );
  });

  it('rejects a malformed URL', async () => {
    await expect(resolveConfig({ url: 'not-a-url' }, file)).rejects.toThrow(
      CliError
    );
  });

  it('returns an empty object when the config file is missing', async () => {
    await expect(readConfigFile(join(dir, 'absent.json'))).resolves.toEqual({});
  });

  it('rejects invalid JSON rather than silently ignoring it', async () => {
    await writeFile(file, '{ not json', 'utf8');
    await expect(readConfigFile(file)).rejects.toThrow(/not valid JSON/);
  });

  it('rejects a non-string config value', async () => {
    await write({ appUrl: 8090 });
    await expect(readConfigFile(file)).rejects.toThrow(/must be a string/);
  });
});

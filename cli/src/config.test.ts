import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveConfig, readConfigFile } from './config.js';
import { CliError } from './errors.js';

describe('resolveConfig', () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'iw-config-'));
    file = join(dir, 'config.json');
    delete process.env.POCKETBASE_URL;
    delete process.env.INVENTORY_WARE_API_URL;
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    delete process.env.POCKETBASE_URL;
    delete process.env.INVENTORY_WARE_API_URL;
  });

  const write = (value: unknown) =>
    writeFile(file, JSON.stringify(value), 'utf8');

  it('falls back to defaults when nothing is set', async () => {
    const config = await resolveConfig({}, file);
    expect(config).toEqual({
      pocketbaseUrl: 'http://localhost:8090',
      apiUrl: 'http://localhost:3000',
    });
  });

  it('reads values from the config file', async () => {
    await write({
      pocketbaseUrl: 'http://pb.example.com',
      apiUrl: 'http://app.example.com',
    });
    const config = await resolveConfig({}, file);
    expect(config.pocketbaseUrl).toBe('http://pb.example.com');
    expect(config.apiUrl).toBe('http://app.example.com');
  });

  it('prefers env over the config file', async () => {
    await write({ pocketbaseUrl: 'http://file.example.com' });
    process.env.POCKETBASE_URL = 'http://env.example.com';

    const config = await resolveConfig({}, file);
    expect(config.pocketbaseUrl).toBe('http://env.example.com');
  });

  it('prefers flags over env and the config file', async () => {
    await write({ pocketbaseUrl: 'http://file.example.com' });
    process.env.POCKETBASE_URL = 'http://env.example.com';

    const config = await resolveConfig(
      { pbUrl: 'http://flag.example.com' },
      file
    );
    expect(config.pocketbaseUrl).toBe('http://flag.example.com');
  });

  it('resolves precedence per key, not per source', async () => {
    // The file only supplies apiUrl; it must not reset pocketbaseUrl.
    await write({ apiUrl: 'http://file-api.example.com' });
    process.env.POCKETBASE_URL = 'http://env-pb.example.com';

    const config = await resolveConfig({}, file);
    expect(config.pocketbaseUrl).toBe('http://env-pb.example.com');
    expect(config.apiUrl).toBe('http://file-api.example.com');
  });

  it('strips trailing slashes so URL joins stay predictable', async () => {
    const config = await resolveConfig(
      { pbUrl: 'http://pb.example.com/', apiUrl: 'http://app.example.com//' },
      file
    );
    expect(config.pocketbaseUrl).toBe('http://pb.example.com');
    expect(config.apiUrl).toBe('http://app.example.com');
  });

  it('rejects a malformed URL', async () => {
    await expect(resolveConfig({ pbUrl: 'not-a-url' }, file)).rejects.toThrow(
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
    await write({ pocketbaseUrl: 8090 });
    await expect(readConfigFile(file)).rejects.toThrow(/must be a string/);
  });
});

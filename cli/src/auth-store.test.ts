import { mkdtemp, rm, stat, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFileAuthStore } from './auth-store.js';

const isWindows = process.platform === 'win32';

describe('createFileAuthStore', () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'iw-auth-'));
    file = join(dir, 'nested', 'auth.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('starts empty when no cached session exists', async () => {
    const store = await createFileAuthStore(file);
    expect(store.token).toBe('');
    expect(store.isValid).toBe(false);
  });

  it('persists the session to disk, creating parent directories', async () => {
    const store = await createFileAuthStore(file);
    store.save('token-123', { id: 'user1' } as never);

    // AsyncAuthStore writes asynchronously via an internal queue.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const written = JSON.parse(await readFile(file, 'utf8'));
    expect(written.token).toBe('token-123');
    expect(written.record.id).toBe('user1');
  });

  it.skipIf(isWindows)(
    'writes the token file 0600 - it holds a bearer token',
    async () => {
      const store = await createFileAuthStore(file);
      store.save('token-123', { id: 'user1' } as never);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const stats = await stat(file);
      expect(stats.mode & 0o777).toBe(0o600);
    }
  );

  it('reloads a previously cached session', async () => {
    const first = await createFileAuthStore(file);
    first.save('token-abc', { id: 'user2' } as never);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const second = await createFileAuthStore(file);
    expect(second.token).toBe('token-abc');
    expect(second.record?.id).toBe('user2');
  });

  it('removes the file on clear and stays idempotent', async () => {
    const store = await createFileAuthStore(file);
    store.save('token-abc', { id: 'user3' } as never);
    await new Promise((resolve) => setTimeout(resolve, 50));

    store.clear();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await expect(stat(file)).rejects.toThrow();

    // A second clear must not throw on the now-missing file.
    store.clear();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
});

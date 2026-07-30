import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { AsyncAuthStore } from 'pocketbase';

/**
 * A PocketBase auth store persisted to disk so the session survives between
 * invocations. The file holds a bearer token, so it is written 0600.
 */
export async function createFileAuthStore(
  path: string
): Promise<AsyncAuthStore> {
  const initial = await readFile(path, 'utf8').catch(() => undefined);

  return new AsyncAuthStore({
    initial,
    save: async (serialized: string) => {
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await writeFile(path, serialized, { mode: 0o600 });
    },
    clear: async () => {
      await rm(path, { force: true });
    },
  });
}

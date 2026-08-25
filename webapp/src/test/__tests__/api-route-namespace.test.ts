import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * In production nginx (docker/nginx.conf) proxies these URL prefixes to
 * PocketBase, so a Next.js route or page placed under one of them is
 * unreachable — the request never hits Next.js and 404s against PocketBase.
 * Webapp API routes must live under /api-next/ instead.
 *
 * (Nginx also owns /_/ for the PocketBase admin UI, but Next.js already
 * treats underscore-prefixed folders as private, so no route can exist there.)
 */
const POCKETBASE_OWNED_PREFIXES = ['/api', '/health'];

// Vitest runs with cwd at the webapp root; the sanity test below fails
// loudly if this ever stops pointing at the real app directory.
const appDir = path.resolve(process.cwd(), 'src/app');

/** File names that make a directory publicly routable in the App Router. */
const ROUTABLE_FILE = /^(route|page)\.(ts|tsx|js|jsx|mjs)$/;

function collectRoutableFiles(): string[] {
  return (readdirSync(appDir, { recursive: true }) as string[]).filter((rel) =>
    ROUTABLE_FILE.test(path.basename(rel))
  );
}

/** Derive the public URL path a route/page file is served at. */
function urlPathOf(relFile: string): string {
  const segments = path
    .dirname(relFile)
    .split(path.sep)
    // Route groups "(group)" and parallel-route slots "@slot" do not
    // contribute URL segments.
    .filter(
      (seg) =>
        seg !== '.' &&
        !(seg.startsWith('(') && seg.endsWith(')')) &&
        !seg.startsWith('@')
    );
  return '/' + segments.join('/');
}

describe('app router URL namespace', () => {
  const files = collectRoutableFiles();

  it('finds route handlers to check (sanity)', () => {
    // If this fails, the scan is looking at the wrong directory and the
    // assertions below would pass vacuously.
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((f) => f.includes('api-next'))).toBe(true);
  });

  it.each(files)(
    '%s is not shadowed by a PocketBase-owned URL prefix',
    (relFile) => {
      const url = urlPathOf(relFile);
      for (const prefix of POCKETBASE_OWNED_PREFIXES) {
        const shadowed = url === prefix || url.startsWith(prefix + '/');
        expect(
          shadowed,
          `${relFile} is served at ${url}, but nginx routes ${prefix} to ` +
            `PocketBase in production (docker/nginx.conf), so Next.js never ` +
            `receives the request. Move it under src/app/api-next/.`
        ).toBe(false);
      }
    }
  );

  it('serves the label generation route under /api-next', () => {
    // Regression: this route used to live at /api/labels/generate, which
    // 404s in production because /api belongs to PocketBase.
    expect(files.map(urlPathOf)).toContain('/api-next/labels/generate');
  });
});

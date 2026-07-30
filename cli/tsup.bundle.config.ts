import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const version =
  process.env.IW_VERSION ??
  (
    JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    ) as { version: string }
  ).version;

/**
 * Standalone single-file build used for GitHub release assets.
 *
 * Bundles every workspace and npm dependency into one script so the published
 * artifact only requires Node.js >= 22 at runtime.
 */
export default defineConfig({
  entry: {
    iw: 'src/cli.ts',
  },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  // Kept out of dist/ so it never shadows the normal workspace build.
  outDir: 'bundle',
  dts: false,
  // Some bundled dependencies (commander) are CommonJS. esbuild's interop shim
  // needs a real `require` in scope, otherwise inlined `require('events')`
  // calls fail at runtime with "Dynamic require of ... is not supported".
  banner: {
    js: [
      '#!/usr/bin/env node',
      "import { createRequire as __iwCreateRequire } from 'node:module';",
      'const require = __iwCreateRequire(import.meta.url);',
    ].join('\n'),
  },
  define: { __IW_VERSION__: JSON.stringify(version) },
  // Inline all dependencies (@project/shared, pocketbase, commander, zod).
  noExternal: [/.*/],
  clean: true,
  sourcemap: false,
  minify: true,
  splitting: false,
});

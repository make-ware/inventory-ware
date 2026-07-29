import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

// release-please bumps the root package.json; cli/package.json stays at 0.0.0.
const version =
  process.env.IW_VERSION ??
  (
    JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    ) as { version: string }
  ).version;

export default defineConfig((options) => ({
  entry: {
    cli: 'src/cli.ts',
  },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  // The CLI is an application, not a library - consumers never import its types.
  dts: false,
  banner: { js: '#!/usr/bin/env node' },
  define: { __IW_VERSION__: JSON.stringify(version) },
  clean: !options.watch,
  sourcemap: true,
  minify: false,
  splitting: false,
}));

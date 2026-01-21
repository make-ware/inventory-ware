import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
  entry: {
    index: 'src/index.ts',
    schema: 'src/schema.ts',
    enums: 'src/enums.ts',
    types: 'src/types.ts',
    mutator: 'src/mutator.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: !options.watch, // Only clean when not in watch mode
  sourcemap: true,
  minify: false,
  splitting: false,
  treeshake: true,
}));

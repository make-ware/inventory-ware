export default {
  // PocketBase instance URL
  url: process.env.POCKETBASE_URL || 'http://localhost:8090',
  schema: {
    directory: './src/schema',
    exclude: ['*.test.ts', '*.spec.ts'],
  },
  migrations: {
    directory: '../pocketbase/pb_migrations',
    format: 'js',
  },
};

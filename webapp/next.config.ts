import type { NextConfig } from 'next';
import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables from the top-level .env file
// This allows using a single .env file at the root of the monorepo
// Priority: .env.local (root) > .env (root) > .env.local (webapp) > .env (webapp)
config({ path: resolve(__dirname, '../.env.local') }); // Check for .env.local at root first
config({ path: resolve(__dirname, '../.env') }); // Then check for .env at root

const nextConfig: NextConfig = {
  // Suppress verbose logging in production
  // Only show errors and warnings
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
  // Reduce build output verbosity in production
  productionBrowserSourceMaps: false,
  // Optimize for production
  poweredByHeader: false,
  compress: true,
  transpilePackages: ['@project/shared'],
};

export default nextConfig;

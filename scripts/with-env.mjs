#!/usr/bin/env node
/**
 * Loads the repo-root .env into process.env, then executes the given command:
 *
 *   node scripts/with-env.mjs <command> [args...]
 *
 * Needed because the webapp's env keys (POCKETBASE_URL, the AI provider
 * block, LOG_LEVEL) live in the repo-root .env, which Next.js never loads —
 * it only reads env files from its own project directory. Neither of the
 * in-process alternatives works:
 *  - loadEnvConfig() inside next.config.ts is a no-op: @next/env caches the
 *    env it loads for the CLI before the config file is evaluated.
 *  - `node --env-file-if-exists=../.env .bin/next` crashes: Next copies its
 *    execArgv into NODE_OPTIONS for spawned workers, and Node rejects
 *    --env-file flags in NODE_OPTIONS.
 *
 * Uses @next/env (Next's own parser) so semantics match Next exactly:
 * already-set environment variables always win over .env values.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nextEnv from '@next/env';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [cmd, ...args] = process.argv.slice(2);

if (!cmd) {
  console.error('usage: with-env.mjs <command> [args...]');
  process.exit(2);
}

const dev = !args.includes('build');
nextEnv.loadEnvConfig(root, dev);
// Loading marks the env as processed; the spawned Next process must still do
// its own (project-dir) env pass, so don't let the marker leak into it.
delete process.env.__NEXT_PROCESSED_ENV;

const child = spawn(cmd, args, { stdio: 'inherit', env: process.env });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});

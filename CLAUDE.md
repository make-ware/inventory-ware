# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Inventory Ware is a self-hosted inventory management app that labels items via AI image analysis (OpenAI) and stores them in PocketBase. The repo is a Yarn v4 workspace monorepo; Node ≥22 is required.

Workspaces:
- `@project/webapp` — Next.js 16 (App Router, React 19, Tailwind v4, shadcn/ui)
- `@project/shared` — Zod schemas, generated PocketBase types, and mutator classes; built with `tsup` to `dist/` and consumed by the webapp as `@project/shared` (subpath exports: `/schema`, `/enums`, `/types`, `/mutator`)
- `@project/pb` — PocketBase binary + JS hooks (`pocketbase/pb_hooks/main.pb.js`) + migrations (`pocketbase/pb_migrations/`)

## Commands

Run from repo root unless noted:

- `yarn setup` — downloads the PocketBase binary for this platform (one-time per checkout; required before `yarn dev`)
- `yarn dev` — runs webapp (3000), PocketBase (8090), and the shared-package `tsup` watcher concurrently
- `yarn build` — builds all workspaces (shared first, then webapp)
- `yarn test` — `shared` tests then `webapp` tests (both vitest)
- `yarn lint` (fix) / `yarn lint:check` / `yarn typecheck` / `yarn format`
- `yarn precommit` — format + lint + typecheck + test
- `yarn typegen` / `yarn db:typegen` — regenerate `shared/src/pocketbase-types.ts` from the live PocketBase schema (PocketBase must be running)
- `yarn db:migrate` — generate a `pocketbase-migrate` migration from schema drift
- `yarn db:status` — check migration status
- `yarn clean` — removes workspace build artifacts and the downloaded `pocketbase/pocketbase` binary

Single-test / single-workspace:
- `yarn workspace @project/shared test path/to/file.test.ts`
- `yarn workspace @project/webapp test -- -t "test name"`
- `yarn workspace @project/webapp dev` (webapp only)
- `yarn workspace @project/pb dev` (PocketBase only)
- `cd pocketbase && ./pocketbase superuser upsert <email> <password>` — create admin (admin UI at http://localhost:8090/_/)

## Architecture

**Data layer — always go through `shared` mutators.** All PocketBase reads/writes in the webapp use the mutator classes in `shared/src/mutators/` (`ItemMutator`, `ContainerMutator`, `ImageMutator`, `ImageMetadataMutator`, `UserMutator`). They extend `BaseMutator`, validate input via Zod, and return typed records. Do **not** call `pb.collection(...)` directly from app code — tests and consumers assume the mutator layer handles validation, default expands/filters/sorts, and error normalization. When adding a collection, add its schema in `shared/src/schema/`, a mutator in `shared/src/mutators/`, and re-export from `shared/src/index.ts`.

**Client-side only PocketBase access.** The webapp deliberately does not use SSR for PocketBase data (see `docs/PB_SSR.md`). `webapp/src/lib/pocketbase-client.ts` is a `'use client'` singleton with `autoCancellation(false)`; its URL resolves from `NEXT_PUBLIC_POCKETBASE_URL` and supports relative paths for nginx routing. Any module importing from `@/lib/pocketbase-client` should itself be client-only. Server-side code (Next.js route handlers under `webapp/src/app/api/` and `webapp/src/app/api-next/`) uses `@/lib/pocketbase-server` instead.

**Shared package must be built before the webapp resolves imports.** The webapp imports from `dist/`, so when editing `shared/` either run `yarn dev` (which includes the shared watcher) or `yarn workspace @project/shared build`. After schema changes in PocketBase, run `yarn typegen` to refresh `shared/src/pocketbase-types.ts`.

**AI image pipeline.** `webapp/src/services/inventory.ts` orchestrates upload → OpenAI vision analysis → entity creation (Item/Container/Image). The actual vision call lives in `webapp/src/services/ai-analysis.ts` and is invoked from the Next.js route handlers in `webapp/src/app/api-next/analyze-image/` and `webapp/src/app/api-next/process-image/`. Images are downloaded from PocketBase and base64-encoded before being sent to OpenAI because OpenAI cannot reach localhost URLs. `OPENAI_API_KEY` is required for this flow.

**Audit trail via PocketBase hooks.** `pocketbase/pb_hooks/main.pb.js` writes to the `ItemRecords` and `ContainerRecords` collections on create/update to capture field-level diffs, and also maintains the `ItemImages`/`ContainerImages` mapping collections when `ImageRef`/`boundingBox` change. Field-level changes power `item-history.tsx`. If you add a new tracked field, update the hook's blacklist/handling accordingly.

**Context providers.** `webapp/src/contexts/auth-context.tsx`, `inventory-context.tsx`, and `upload-context.tsx` provide app-wide state. The upload context owns the multi-file upload queue (including clearing/cancelling) surfaced by `components/inventory/upload-tracker.tsx`.

## Environment

Copy `.env.example` to `.env` at repo root. Keys in use: `POCKETBASE_URL`, `POCKETBASE_ADMIN_EMAIL`, `POCKETBASE_ADMIN_PASSWORD` (used by setup/migrations), `NEXT_PUBLIC_POCKETBASE_URL` (embedded at webapp build time), `OPENAI_API_KEY` (required for AI analysis routes).

## Releases & CI

Releases are automated via release-please (`.github/workflows/release-please.yml`), which bumps `inventory-ware` per Conventional Commits on the `main` branch. CI runs `ci.yml`; the Docker image is built by `docker-build.yml`. The repo uses Conventional Commit messages (`feat:`, `fix:`, `chore:`, `refactor:` — see recent history).

## Docs

More depth in `docs/`: `DEVELOPMENT.md`, `PB_AUTH.md`, `PB_COLLECTIONS.md`, `PB_FILTERS.md`, `PB_REALTIME.md`, `PB_RELATIONSHIPS.md`, `PB_SSR.md`, `PB_UPLOADS.md`, `PB_INTRO.md`.

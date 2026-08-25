# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Inventory Ware is a self-hosted inventory management app that labels items via AI image analysis (OpenAI or Google Gemini, selectable via env) and stores them in PocketBase. The repo is a Yarn v4 workspace monorepo; Node ≥22 is required.

Workspaces:
- `@project/webapp` — Next.js 16 (App Router, React 19, Tailwind v4, shadcn/ui)
- `@project/shared` — Zod schemas, generated PocketBase types, and mutator classes; built with `tsup` to `dist/` and consumed by the webapp as `@project/shared` (subpath exports: `/schema`, `/enums`, `/types`, `/mutator`)
- `@project/pb` — PocketBase binary + JS hooks (`pocketbase/pb_hooks/main.pb.js`) + migrations (`pocketbase/pb_migrations/`)
- `@project/cli` — Commander-based CLI (binary `iw`) built with `tsup`; consumes `@project/shared` mutators and talks to PocketBase directly (see `cli/README.md`)

## Commands

Run from repo root unless noted:

- `yarn setup` — downloads the PocketBase binary for this platform and ensures a superuser exists, generating `admin@inventory-ware.local` into `pocketbase/pb_data/.pb_superuser.env` (mode 0600) when `POCKETBASE_ADMIN_EMAIL`/`POCKETBASE_ADMIN_PASSWORD` are unset (required before `yarn dev`)
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
- `yarn workspace @project/cli test` / `yarn workspace @project/cli build` then `node cli/dist/cli.js --help`
- `yarn workspace @project/cli bundle` — standalone single-file build to `cli/bundle/iw.js` (release asset)
- `yarn workspace @project/webapp dev` (webapp only)
- `yarn workspace @project/pb dev` (PocketBase only)
- `cd pocketbase && ./pocketbase superuser upsert <email> <password>` — create admin (admin UI at http://localhost:8090/_/)

## Architecture

**Data layer — always go through `shared` mutators.** All PocketBase reads/writes in the webapp use the mutator classes in `shared/src/mutators/` (`ItemMutator`, `ContainerMutator`, `ImageMutator`, `ImageMetadataMutator`, `UserMutator`). They extend `BaseMutator`, validate input via Zod, and return typed records. Do **not** call `pb.collection(...)` directly from app code — tests and consumers assume the mutator layer handles validation, default expands/filters/sorts, and error normalization. When adding a collection, add its schema in `shared/src/schema/`, a mutator in `shared/src/mutators/`, and re-export from `shared/src/index.ts`.

**Filters are built in the mutator layer, never in app or CLI code.** List flows go through `<Entity>Mutator.search(query, options)`, which returns a `ListResult<T>` and builds its PocketBase filter with the helpers in `shared/src/utils/filter.ts` (`eq`, `like`, `anyOf`, `allOf`). Never interpolate a user-supplied value into a filter string — `escapeFilterValue` handles quoting, and `isUnrepresentableFilterValue` flags the one case PocketBase cannot parse (a trailing backslash). All list methods take the standard `ListQuery` (`page`, `perPage`, `filter`, `sort`, `expand`); `BaseMutator.getList` accepts it as an object or as the legacy positional arguments.

**Client-side only PocketBase access.** The webapp deliberately does not use SSR for PocketBase data (see `docs/PB_SSR.md`). `webapp/src/lib/pocketbase-client.ts` is a `'use client'` singleton with `autoCancellation(false)`; its URL resolves from `NEXT_PUBLIC_POCKETBASE_URL` and supports relative paths for nginx routing. Any module importing from `@/lib/pocketbase-client` should itself be client-only. Server-side code (Next.js route handlers under `webapp/src/app/api-next/`) uses `@/lib/pocketbase-server` instead.

**The `/api` URL prefix belongs to PocketBase — webapp routes live under `/api-next/`.** In production nginx (`docker/nginx.conf`) proxies `/api/*` and `/health` to PocketBase, so a Next.js route under `src/app/api/` works in dev but 404s in production. Never create routes there and never hardcode `/api/...` URLs in webapp source; both are enforced by ESLint rules in `webapp/eslint.config.mjs` and by `webapp/src/test/__tests__/api-route-namespace.test.ts`.

**Shared package must be built before the webapp resolves imports.** The webapp imports from `dist/`, so when editing `shared/` either run `yarn dev` (which includes the shared watcher) or `yarn workspace @project/shared build`. After schema changes in PocketBase, run `yarn typegen` to refresh `shared/src/pocketbase-types.ts`.

**AI image pipeline.** `webapp/src/services/inventory.ts` orchestrates upload → vision analysis → entity creation (Item/Container/Image). The actual vision call lives in `webapp/src/services/ai-analysis.ts` and is invoked from the Next.js route handlers in `webapp/src/app/api-next/analyze-image/` and `webapp/src/app/api-next/process-image/`. Images are downloaded from PocketBase and base64-encoded before being sent to the provider, because providers cannot reach localhost URLs.

**AI provider selection.** `webapp/src/services/ai-config.ts` resolves provider, model, credential and base URL from the environment (`AI_PROVIDER`, `AI_MODEL`, `AI_BASE_URL`, `OPENAI_API_KEY`, `GEMINI_API_KEY`); `webapp/src/services/ai-provider.ts` is the only module that imports a vendor SDK, and `ai-analysis.ts` just calls `getLanguageModel()`. Misconfiguration is tiered: an unusable model id falls back to the provider default with a warning, while a missing API key throws `AIConfigError` and the AI routes return **503 `AI_NOT_CONFIGURED`**. `resolveAIConfig` is pure (env in, config out) — add provider entries and test them there, not in the service. `AI_EXPERIMENTAL_MODE` (off by default) switches image analysis from a single `generateObject` call to a bounded `generateText` tool loop that offers the model a `searchCategories` tool; the curated fallback vocabulary shared by the prompt and `getCategoryLibrary()` lives in `webapp/src/services/category-defaults.ts`. Neither `ai-config.ts` nor `ai-provider.ts` may use `import 'server-only'`: the `@/services` barrel is imported by `'use client'` modules, so a server-only marker anywhere in that graph breaks the client build.

**Audit trail via PocketBase hooks.** `pocketbase/pb_hooks/main.pb.js` writes to the `ItemRecords` and `ContainerRecords` collections on create/update to capture field-level diffs, and also maintains the `ItemImages`/`ContainerImages` mapping collections when `ImageRef`/`boundingBox` change. Field-level changes power `item-history.tsx`. If you add a new tracked field, update the hook's blacklist/handling accordingly.

**CLI (`@project/cli`).** ESM-only, because `shared`'s `exports` map declares
only `import`/`types` conditions. It builds its own `PocketBase` client with a
file-backed `AsyncAuthStore` (`~/.config/inventory-ware/auth.json`, mode 0600)
and passes it into the shared mutators — there is no auth helper in `shared`,
and `UserRef` is never auto-filled, so the CLI supplies
`pb.authStore.record.id` explicitly on every create. It does **not** duplicate
the AI pipeline: `iw image analyze` POSTs to the webapp's `/api-next` routes
with a bearer token, so the CLI never needs an AI provider key. It takes a single
absolute `APP_URL` (flag `--url`) for both services, since nginx serves them on
one origin split by path; unset, it falls back to `localhost:8090`/`localhost:3000`.
It deliberately ignores `POCKETBASE_URL`, which is the webapp's server-side
internal address. Every list-style command (`item list`, `container list`, `image list`,
`container items`) shares one flag set built by `addQueryOptions` in
`cli/src/query/` — `-q/--search`, `--sort`, `--expand`, `--fields`, `--page`,
`--per-page`, `--all`, `--count`, `--json` — plus per-entity filters declared
in `cli/src/query/spec.ts`. Add a new list command by writing an `EntitySpec`
rather than hand-rolling flags. `search` subcommands are thin aliases for
`list --search`. Usage errors all exit `2` and print the usage line, targeted
hints and a `--help` pointer: `program.ts` routes Commander's own parse errors
through `reportError`, and argParsers must throw `InvalidArgumentError` (not a
plain `Error`) for Commander to report them. Root `build` and
`typecheck` use `yarn workspaces foreach -A -t` — the `-t` (topological) flag
is required, since `foreach` otherwise iterates alphabetically and would build
`cli` before `shared`.

**Logging.** One line format across the whole stack:
`<server> [<service>] <ISO-8601 timestamp> <LEVEL> <message>`. In the Docker
image `docker/log-prefix.awk` is the filter that produces it — `start.sh`
attaches one per stream per service (via FIFOs that supervisord writes into) and
the single-process images do the same through `docker/run-service.sh`. App code
logs through `webapp/src/lib/logger.ts` (`createLogger(scope)`), which emits the
timestamp/level/scope prefix the filter parses; use `errorMessage(err)` for
routine failures and pass the `Error` itself only when a stack is wanted.
`LOG_LEVEL` (error|warn|info|debug|verbose, default `info`) gates every service
at once. nginx's access log is the only per-request log in production — neither
Next.js nor PocketBase logs requests — and `pocketbase/pb_hooks/logging.pb.js`
mirrors failed PocketBase requests to stdout, since PocketBase's own log only
goes to its `_logs` table. See `docker/README.md` for the operator-facing
version.

**Live lists (PocketBase realtime folded into the query cache).** The Items,
Containers and Images lists stay current without polling or refetching:
`webapp/src/hooks/use-realtime-subscription.ts` owns the single SSE
subscription, and `webapp/src/lib/live-list.ts` holds the *pure* merges that
fold each event into the cached pages. The invariants there are load-bearing —
same reference on a no-op (so structural sharing suppresses the render), replace
only on a strictly newer `updated` stamp (so the echo of a local write drops),
and the sort-window rule that decides whether an unloaded record belongs in the
window or only in `totalItems`. Read that file's header before changing a merge.

A subscription's identity is its `key` and nothing else, so typing in a search
box never resubscribes; everything volatile (search text, filters, sort) reaches
the handler through refs and through the `LiveListSpec` built by
`webapp/src/lib/live-list-spec.ts`, which is the client mirror of the filter and
sort the *mutator* sent. That mirror is allowed to approximate — the gap-heal
invalidation fired once per mount, plus the next fetch, corrects any drift.
Handlers only write to the query cache; a handler that writes to PocketBase is a
loop with every other tab. Adding a live list means writing a `LiveListSpec` and
passing a subscription to `use-live-infinite-list.ts`, not hand-rolling
`pb.collection(...).subscribe`. See `docs/PB_REALTIME.md`.

**Writes go through the mutation hooks, never a mutator called from a page.**
Every create, edit and delete in the webapp is a `useMutation` in
`webapp/src/hooks/use-item-mutations.ts` or `use-container-mutations.ts`. Each
one patches the query cache before the request leaves (`onMutate`), puts its
snapshot back if the request is refused (`onError`) and invalidates the keys it
touched on success — so the screen moves on the click, an error undoes itself,
and the server still has the last word. A page that calls
`itemMutator.delete(...)` itself gets none of that, so add a hook rather than a
call site.

The cache surgery lives in `webapp/src/lib/query/mutations.ts`, and it is
deliberately *not* the realtime merge: a local patch carries the cached
record's `updated` stamp, so the newer-wins rule that makes the SSE merges
idempotent would reject every one of them, and rows are patched in place rather
than repositioned (the invalidation — or the echo, whichever lands first —
settles the order). Creates are not optimistic: there is no id to insert under
and every create navigates to the record it just made. Deleting a container is
the one compound write, and the order is load-bearing: read *all* of its items,
clear each `ContainerRef` (with `''`; an `undefined` field never reaches
PocketBase's JSON body), then delete the record — PocketBase does not cascade.

**Context providers.** `webapp/src/contexts/auth-context.tsx`, `inventory-context.tsx`, and `upload-context.tsx` provide app-wide state. The upload context owns the multi-file upload queue (including clearing/cancelling) surfaced by `components/inventory/upload-tracker.tsx`, and invalidates the item/container/image keys once an upload's analysis lands. The inventory context keeps no records and no mutations — what is left of it is the `/api-next/process-image` entry point.

## Environment

Copy `.env.example` to `.env` at repo root. Keys in use: `POCKETBASE_URL`, `POCKETBASE_ADMIN_EMAIL`, `POCKETBASE_ADMIN_PASSWORD` (used by setup/migrations; both optional — leave both unset and a superuser is generated, set both to manage it yourself, and setting exactly one is an error), `NEXT_PUBLIC_POCKETBASE_URL` (embedded at webapp build time), `LOG_LEVEL`, and the AI block — `AI_PROVIDER`, `AI_MODEL`, `AI_BASE_URL`, `AI_EXPERIMENTAL_MODE`, `OPENAI_API_KEY`, `GEMINI_API_KEY`. At least one provider key is required for the AI analysis routes.

## Releases & CI

Releases are automated via release-please (`.github/workflows/release-please.yml`), which bumps `inventory-ware` per Conventional Commits on the `main` branch. CI runs `ci.yml`; the Docker image is built by `docker-build.yml`. The repo uses Conventional Commit messages (`feat:`, `fix:`, `chore:`, `refactor:` — see recent history).

## Docs

More depth in `docs/`: `DEVELOPMENT.md`, `PB_AUTH.md`, `PB_COLLECTIONS.md`, `PB_FILTERS.md`, `PB_REALTIME.md`, `PB_RELATIONSHIPS.md`, `PB_SSR.md`, `PB_UPLOADS.md`, `PB_INTRO.md`.

# @project/cli (`iw`)

A Commander + TypeScript CLI for Inventory Ware. It reuses `@project/shared`
mutators directly, so it stays in lockstep with the app's data model —
validation, default expands/filters/sorts, and error normalization all come
from the same code the webapp uses.

## Build & run

```bash
# shared must be built first (it is a workspace dependency)
yarn workspace @project/shared build

# build the CLI, then run the binary
yarn workspace @project/cli build
node cli/dist/cli.js --help

# or run from source during development
yarn workspace @project/cli dev -- --help
```

`@project/shared` is consumed from its `dist/`, so a build (or the `yarn dev`
watcher) must have run before the CLI will typecheck, test, or run.

## Install (released builds)

Every GitHub release attaches a standalone single-file build of the CLI
(`iw-<version>.tar.gz`) produced by `yarn workspace @project/cli bundle`
(`tsup.bundle.config.ts` — bundles all workspace and npm dependencies into
one script; requires Node.js >= 22 at runtime).

```bash
# from a GitHub release
curl -fsSL -o iw.tar.gz \
  "https://github.com/make-ware/inventory-ware/releases/download/inventory-ware-v<version>/iw-<version>.tar.gz"
tar -xzf iw.tar.gz
install -m 755 iw-<version>/iw /usr/local/bin/iw

# via Homebrew
brew tap make-ware/tap
brew install iw
```

The release workflow (`.github/workflows/release-please.yml`,
`cli-release-asset` job) builds the bundle from the release tag, uploads the
tarball plus a `.sha256` checksum as release assets, and appends install
instructions to the release notes. If a `HOMEBREW_TAP_TOKEN` repository
secret is set (a token with push access to a `make-ware/homebrew-tap` repo),
it also commits an updated `Formula/iw.rb` to that tap on every release —
create the tap repo once and add the secret to enable it. Until then the
`homebrew-tap` job skips itself and the rest of the release is unaffected.

The CLI is versioned with the repo (release-please runs in single-package
mode), so `iw --version` reports the `inventory-ware` release version.

## Configuration

There is one setting: the application URL.

| Setting         | Flag    | Environment | Default                                       |
| --------------- | ------- | ----------- | --------------------------------------------- |
| Application URL | `--url` | `APP_URL`   | `http://localhost:8090` + `http://localhost:3000` |

Precedence is **flag > environment > config file > default**.

```bash
export APP_URL=https://inventory.example.com
iw item list
```

One value covers both services because the deployed app sits behind nginx on a
single origin, which routes by path: `/api/` and `/_/` go to PocketBase, while
`/api-next/` and `/` go to the webapp. The PocketBase SDK appends `/api/...` to
the base URL and the CLI appends `/api-next/...`, so both land in the right
place.

**`APP_URL` must be absolute.** The webapp accepts a relative
`NEXT_PUBLIC_POCKETBASE_URL=/` because a browser can resolve it against the
current origin; a CLI has no origin to resolve against.

When `APP_URL` is unset the CLI falls back to `http://localhost:8090` for
PocketBase and `http://localhost:3000` for the webapp — the `yarn dev` layout,
which is also what `docker-compose` exposes (it publishes both ports and runs
no nginx).

Config file: `~/.config/inventory-ware/config.json` (honors `XDG_CONFIG_HOME`),
with an `appUrl` key. The session token is cached separately in `auth.json` in
the same directory, written `0600`.

### Split deployments

If PocketBase and the webapp are not on the same origin, two hidden flags
override each independently and take precedence over `--url`/`APP_URL`:

```bash
iw --pb-url https://pb.example.com --api-url https://app.example.com item list
```

The equivalent config file keys are `pocketbaseUrl` and `apiUrl`. Note that the
CLI deliberately does **not** read `POCKETBASE_URL` — that variable is the
webapp's server-side internal address (in `docker-compose` it is a container
hostname that will not resolve from your shell).

## Commands

```bash
iw login                       # authenticate (Users collection); caches a token
iw logout                      # clear the cached session
iw whoami                      # show the current user

iw item list                   # list items (--container, --page, --per-page, --sort)
iw item search <query>         # search label/name/notes/manufacturer
iw item get <id>               # show one item
iw item create --label <l> --functional <c> --specific <c> --type <t>
iw item update <id> [flags]    # update fields
iw item delete <id> --yes      # delete (confirmation required)
iw item categories             # distinct categories in use

iw container list|search|get|create|update|delete
iw container items <id>        # items inside a container

iw image upload <file...>      # upload images (--type, --analyze)
iw image analyze <id>          # run AI analysis on an uploaded image
iw image list                  # list images (--status)
iw image get <id>
iw image url <id>              # print the file download URL
```

Every read command accepts `--json` for scripting:

```bash
iw item list --json | jq -r '.items[].itemLabel'
```

Custom attributes are repeatable `name=value` pairs:

```bash
iw item create --label Drill --functional Tools --specific "Power Tools" \
  --type Drill --attr voltage=18V --attr color=blue
```

## Notes and gotchas

- **`categoryFunctional`, `categorySpecific` and `itemType` are required** on
  `item create`, and the schema slugifies them. The CLI echoes back the stored
  record so you can see the transformed values.
- **AI analysis needs the webapp running.** The vision pipeline lives in
  `@project/webapp` (it needs `OPENAI_API_KEY` and the server-only PocketBase
  client), so `--analyze` and `iw image analyze` upload to PocketBase directly
  and then POST to `/api-next/analyze-image` with the same bearer token. The
  CLI never reads `OPENAI_API_KEY` itself. This mirrors the webapp's own
  upload flow.
- **Everything is scoped to the logged-in user** by PocketBase access rules
  (`UserRef = @request.auth.id`), so all data commands require `iw login`.
- **`item update` is validated by the CLI**, not by the mutator —
  `BaseMutator.update()` skips `validateInput`, so the CLI runs
  `ItemUpdateSchema` before sending the patch.
- Exit codes: `1` general, `2` usage, `3` not found, `4` not authenticated,
  `5` API/network.

## Tests

```bash
yarn workspace @project/cli test
```

Vitest with the same inline `vi.fn()` PocketBase mocking pattern used in
`@project/shared`. Command tests mock `../context.js` and drive the real
mutators over a mock client, so schema validation runs for real.

# Self-Hosting Inventory Ware

This guide provides instructions for running Inventory Ware locally using Docker. Two methods are available: a single monolithic image or Docker Compose.

## Image Registries

Every release publishes three images to GitHub Container Registry. The monolith is also mirrored to Docker Hub; the two copies are identical, so use whichever you prefer.

| Image | GitHub Container Registry | Docker Hub |
| --- | --- | --- |
| Monolith | `ghcr.io/make-ware/inventory-ware` | `dastron/inventory-ware` |
| Webapp | `ghcr.io/make-ware/inventory-ware-webapp` | — |
| PocketBase | `ghcr.io/make-ware/inventory-ware-pocketbase` | — |

Every image carries the same tags: `latest`, the full version (`1.2.3`), the major/minor rollups (`1.2`, `1`), and a `sha-` tag for traceability. The examples below use GHCR; substitute `dastron/inventory-ware` to pull the monolith from Docker Hub instead.

## Option 1: Monolithic Image

The monolithic image contains all services (Web Application, PocketBase, and Nginx) in a single container. This is the simplest method for getting started.

Run the following command in your terminal:

```bash
docker run -d \
  --name inventory-ware \
  -p 80:80 \
  -v data:/data \
  -e OPENAI_API_KEY=your-openai-api-key \
  ghcr.io/make-ware/inventory-ware:latest
```

To use Google Gemini instead of OpenAI, swap the key line for:

```bash
  -e GEMINI_API_KEY=your-gemini-api-key \
```

Without an AI provider key the container still runs, but image analysis is
disabled and the AI routes return `503 AI_NOT_CONFIGURED`.

This command will:
-   Start the container in detached mode (`-d`).
-   Expose the application on port `80`.
-   **Auto-create** the PocketBase admin account. With no `POCKETBASE_ADMIN_*`
    variables set, the container generates `admin@inventory-ware.local` with a
    random password on first start and saves it to
    `/data/pb_data/.pb_superuser.env` (mode 0600, root-owned). Read it with:

    ```bash
    docker exec inventory-ware cat /data/pb_data/.pb_superuser.env
    ```

    The file is reused on every restart, so the password does not rotate. Delete
    it to have a new one generated, or set both `POCKETBASE_ADMIN_EMAIL` and
    `POCKETBASE_ADMIN_PASSWORD` to manage the account yourself.
-   Persist all data (database and uploads) in a Docker volume named `data` mapped to `/data`.

## Option 2: Docker Compose

Docker Compose runs the Web Application and PocketBase in separate containers, pulling both images from GHCR.

1.  Navigate to the `docker` directory where `docker-compose.yml` is located.
2.  Start the services:

```bash
docker compose up -d
```

3.  The PocketBase container generates its own superuser on first start, exactly
    as the monolith does. Read the credentials with:

    ```bash
    docker compose exec pocketbase cat /data/pb_data/.pb_superuser.env
    ```

To stop the services:
```bash
docker compose down
```

## Environment Variables

All variables are optional unless noted. For Docker Compose these can go in a
`.env` file next to `docker-compose.yml`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `POCKETBASE_ADMIN_EMAIL` | generated | Superuser address. Unset, the container generates `admin@inventory-ware.local`. Must be set together with the password; setting only one stops the container with a `FATAL` line. |
| `POCKETBASE_ADMIN_PASSWORD` | generated | Superuser password. Unset, a random 32-character password is generated into `<PB_DATA_DIR>/.pb_superuser.env` (mode 0600) and reused on later starts. When supplied, it is **re-applied on every start**, so rotating the password in the admin UI is undone by the next restart - change it here (or in that file) instead. The documented placeholder `your-secure-password` is ignored, since it is published in this repository. |
| `POCKETBASE_URL` | `http://localhost:8090` | Internal address the webapp uses to reach PocketBase. |
| `NEXT_PUBLIC_POCKETBASE_URL` | `/` | Public address the browser uses. Baked in at image build time, so setting it at runtime on a prebuilt image has no effect — build the `webapp` target yourself to change it (see the comment in `docker-compose.yml`). |
| `LOG_LEVEL` | `info` | `error`, `warn`, `info`, `debug`, or `verbose`. Applies to every service in the container - see [Logs](#logs). |
| `LOG_SERVER_NAME` | container hostname | The `<server>` field every log line starts with. Set it when aggregating logs from several hosts. |
| `GRACEFUL_SHUTDOWN_TIMEOUT` | `30` | Seconds to allow for connection draining. |
| `OPENAI_API_KEY` | — | OpenAI credential. Enables AI image analysis. |
| `GEMINI_API_KEY` | — | Google Gemini credential. `GOOGLE_GENERATIVE_AI_API_KEY` is also accepted. |
| `AI_PROVIDER` | auto-detected | `openai` or `google` (`gemini` is accepted). Only needed when both keys are set. |
| `AI_MODEL` | `gpt-5.4-2026-03-05` / `gemini-3.5-flash` | Model id for the active provider. An unusable value falls back to the default with a warning in the log. |
| `AI_BASE_URL` | — | Point at a compatible endpoint (proxy, Azure, local inference server). |
| `AI_EXPERIMENTAL_MODE` | `false` | `true`, `1`, `yes` or `on` enables the experimental `searchCategories` tool-calling loop during image analysis. Costs extra tokens and latency per image. |

If exactly one AI provider key is present, that provider is selected
automatically. If both are present, OpenAI wins unless `AI_PROVIDER` says
otherwise. With no key at all the app runs normally with image analysis
disabled.

## Logs

Everything the container writes to `docker logs` is normalised to one line
format, whichever of the four processes produced it:

```
<server> [<service>] <ISO-8601 timestamp> <LEVEL> <message>
```

```
inventory-ware [startup]    2026-08-17T03:59:36Z INFO  Inventory Ware starting (log level info, node env production)
inventory-ware [supervisor] 2026-08-17T03:59:37.820Z INFO  spawned: 'nginx' with pid 23
inventory-ware [pocketbase] 2026-08-17T03:59:38Z INFO  Server started at http://0.0.0.0:8090
inventory-ware [nginx]      2026-08-17T04:01:02Z INFO  10.1.26.67 "GET /inventory/items HTTP/1.1" 200 5123B 0.031s upstream=127.0.0.1:3000 ref="-" ua="Mozilla/5.0"
inventory-ware [nextjs]     2026-08-17T04:01:04.812Z INFO  [api-next/process-image] image processed imageId=r83kd9 bytes=2216417 items=4 durationMs=8123
```

`<service>` is one of `startup`, `supervisor`, `nginx`, `pocketbase`, `nextjs`.
Multi-line output (stack traces) is indented and carries the level of the line
it belongs to. Timestamps are UTC.

### What gets logged at each level

| `LOG_LEVEL` | You get |
| --- | --- |
| `error` | Failures only. |
| `warn` | Failures, plus failed API requests, auth rejections and configuration warnings. |
| `info` (default) | The above, plus one line per HTTP request, per AI model call (with duration and token counts) and per completed upload/analysis. |
| `debug` | The above, plus request entry points, PocketBase request logging, and the container's own startup steps. |
| `verbose` | The above, plus PocketBase dev mode - every SQL statement. Loud. |

nginx's error log stays at its own `warn` level regardless: its `info` level
narrates every connection teardown and drowns out everything else.

### How it works

`docker/log-prefix.awk` is a filter that rewrites one stream into the format
above, working out the level from what the source already emits (supervisord's
`INFO`/`CRIT`, nginx's `[error]`, the level our own logger writes) and falling
back to INFO for stdout and ERROR for stderr. `start.sh` attaches one filter per
stream, per service, before supervisord starts; supervisord writes each
program's output into those FIFOs. The single-process images do the same thing
with `docker/run-service.sh`.

Two consequences worth knowing:

- **nginx access logging is on.** It is the only place a request to Next.js or
  PocketBase is logged with its status and duration, since neither logs its own
  requests in production. `/health` is excluded.
- **PocketBase failures reach the console.** PocketBase's own request log goes
  to its `_logs` table, so `pb_hooks/logging.pb.js` mirrors failed requests (and
  at `debug`, all requests) to stdout with the error message.

## Accessing the Application

### Monolithic Image
-   **Web Application:** [http://localhost:8888](http://localhost:8888)
-   **PocketBase Admin UI:** [http://localhost:8888/_/](http://localhost:8888/_/)

### Docker Compose
-   **Web Application:** [http://localhost:3000](http://localhost:3000)
-   **PocketBase Admin UI:** [http://localhost:8090/_/](http://localhost:8090/_/)

## Data Persistence

Both methods use Docker volumes to ensure your data is saved even if the containers are removed.
-   **Monolithic:** Uses a volume named `data`.
-   **Docker Compose:** Uses a volume named `data` (defined in `docker-compose.yml`).

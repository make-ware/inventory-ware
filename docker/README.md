# Self-Hosting Inventory Ware

This guide provides instructions for running Inventory Ware locally using Docker. Two methods are available: a single monolithic image or Docker Compose.

## Image Registries

Every release publishes the same three images to both GitHub Container Registry and Docker Hub. The two are identical — use whichever you prefer.

| Image | GitHub Container Registry | Docker Hub |
| --- | --- | --- |
| Monolith | `ghcr.io/make-ware/inventory-ware` | `dastron/inventory-ware` |
| Webapp | `ghcr.io/make-ware/inventory-ware-webapp` | `dastron/inventory-ware-webapp` |
| PocketBase | `ghcr.io/make-ware/inventory-ware-pocketbase` | `dastron/inventory-ware-pocketbase` |

Both registries carry the same tags: `latest`, the full version (`1.2.3`), the major/minor rollups (`1.2`, `1`), and a `sha-` tag for traceability. The examples below use GHCR; substitute the Docker Hub name to pull from there instead.

## Option 1: Monolithic Image

The monolithic image contains all services (Web Application, PocketBase, and Nginx) in a single container. This is the simplest method for getting started.

Run the following command in your terminal:

```bash
docker run -d \
  --name inventory-ware \
  -p 80:80 \
  -v data:/data \
  -e POCKETBASE_ADMIN_EMAIL=admin@example.com \
  -e POCKETBASE_ADMIN_PASSWORD=change-this-password \
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
-   **Auto-create** the PocketBase admin account with the provided credentials.
-   Persist all data (database and uploads) in a Docker volume named `data` mapped to `/data`.

## Option 2: Docker Compose

Docker Compose runs the Web Application and PocketBase in separate containers.

1.  Navigate to the `docker` directory where `docker-compose.yml` is located.
2.  Start the services:

```bash
docker compose up -d
```

3.  **Important:** You must manually create the first admin account by visiting the PocketBase Admin UI (see below).

To stop the services:
```bash
docker compose down
```

## Environment Variables

All variables are optional unless noted. For Docker Compose these can go in a
`.env` file next to `docker-compose.yml`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `POCKETBASE_ADMIN_EMAIL` | `admin@example.com` | Auto-created superuser (monolith only). |
| `POCKETBASE_ADMIN_PASSWORD` | `your-secure-password` | Superuser password. The superuser is **not** created while this is left at the default. |
| `POCKETBASE_URL` | `http://localhost:8090` | Internal address the webapp uses to reach PocketBase. |
| `NEXT_PUBLIC_POCKETBASE_URL` | `/` | Public address the browser uses. Baked in at image build time, so setting it at runtime on a prebuilt image has no effect. |
| `LOG_LEVEL` | `warn` | `warn`, `info`, `debug`, or `verbose`. |
| `GRACEFUL_SHUTDOWN_TIMEOUT` | `30` | Seconds to allow for connection draining. |
| `OPENAI_API_KEY` | — | OpenAI credential. Enables AI image analysis. |
| `GEMINI_API_KEY` | — | Google Gemini credential. `GOOGLE_GENERATIVE_AI_API_KEY` is also accepted. |
| `AI_PROVIDER` | auto-detected | `openai` or `google` (`gemini` is accepted). Only needed when both keys are set. |
| `AI_MODEL` | `gpt-5.4-2026-03-05` / `gemini-3.5-flash` | Model id for the active provider. An unusable value falls back to the default with a warning in the log. |
| `AI_BASE_URL` | — | Point at a compatible endpoint (proxy, Azure, local inference server). |

If exactly one AI provider key is present, that provider is selected
automatically. If both are present, OpenAI wins unless `AI_PROVIDER` says
otherwise. With no key at all the app runs normally with image analysis
disabled.

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

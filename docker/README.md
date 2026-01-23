# Self-Hosting Inventory Ware

This guide provides instructions for running Inventory Ware locally using Docker. Two methods are available: a single monolithic image or Docker Compose.

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
  ghcr.io/make-ware/inventory-ware:latest
```

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

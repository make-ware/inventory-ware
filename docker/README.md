# Inventory Ware Deployment Guide

This guide covers deploying Inventory Ware in production using Docker. Inventory Ware can be deployed in two ways:

1.  **Monolithic Container** - Single container with all services (PocketBase, Next.js, and Nginx) managed by Supervisor.
2.  **Docker Compose** - Separate containers for PocketBase and the Next.js webapp.

## Quick Start

### Prerequisites

- Docker 20.10+ and Docker Compose 2.0+
- Required environment variables (see Configuration section)

## Deployment Options

### Option 1: Monolithic Container

The monolithic container involves running all services in a single image. This is the simplest deployment option for small to medium installations.

#### Pull and Run

```bash
# Pull the latest image
docker pull ghcr.io/make-ware/inventory-ware:latest

# Run the container
docker run -d \
  --name inventory-ware \
  -p 8888:80 \
  -e POCKETBASE_ADMIN_EMAIL=admin@example.com \
  -e POCKETBASE_ADMIN_PASSWORD=your-secure-password \
  -v inventory-ware-pb-data:/app/pb/pb_data \
  ghcr.io/make-ware/inventory-ware:latest
```

The application will be available at:
- **Web Application**: http://localhost:8888
- **PocketBase API**: http://localhost:8888/api/
- **PocketBase Admin**: http://localhost:8888/_/

### Option 2: Docker Compose

Docker Compose deploys services in separate containers, providing better isolation.

#### Setup

1.  **Create an .env file** in the `docker/` directory:

```bash
cd docker
cat > .env <<EOF
# PocketBase Configuration
POCKETBASE_ADMIN_EMAIL=admin@example.com
POCKETBASE_ADMIN_PASSWORD=your-secure-password

# Application URLs
NEXT_PUBLIC_POCKETBASE_URL=http://localhost:8090

# Logging
LOG_LEVEL=warn
EOF
```

2.  **Start all services**:

```bash
docker compose up -d
```

The services will be available at:
- **Web Application**: http://localhost:3000
- **PocketBase API**: http://localhost:8090/api/
- **PocketBase Admin**: http://localhost:8090/_/

3.  **View logs**:

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f webapp
docker compose logs -f pocketbase
```

4.  **Stop services**:

```bash
docker compose down
```

## Image Registry

Inventory Ware images are published to GitHub Container Registry (ghcr.io).

### Image Names

The following images are available:

- `ghcr.io/make-ware/inventory-ware:latest` - Monolithic container
- `ghcr.io/make-ware/inventory-ware-pocketbase:latest` - PocketBase service only
- `ghcr.io/make-ware/inventory-ware-webapp:latest` - Next.js webapp only

## Configuration

### Required Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `POCKETBASE_ADMIN_EMAIL` | `admin@example.com` | Admin email for PocketBase superuser |
| `POCKETBASE_ADMIN_PASSWORD` | `your-secure-password` | Admin password (must be changed for auto-setup) |

### Optional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `warn` | Log level (debug, info, warn, error) |
| `NEXT_PUBLIC_POCKETBASE_URL` | `http://localhost:8090` | Public URL for PocketBase (used by browser) |
| `GRACEFUL_SHUTDOWN_TIMEOUT` | `30` | Seconds to wait before killing processes |

## Persistent Data

Docker volumes are used to persist data across container restarts.

### Monolithic Container

- `inventory-ware-pb-data` - PocketBase database and files.

### Docker Compose

- `pb_data` - PocketBase database and files.

To remove all data:

```bash
# Monolithic
docker rm -v inventory-ware
docker volume rm inventory-ware-pb-data

# Docker Compose
docker compose down -v
```

## Health Checks

Both deployment options include health checks:

### Monolithic Container

The container exposes a health check endpoint at `/health`.

```bash
curl http://localhost:8888/health
```

### Docker Compose

View health status:

```bash
docker compose ps
```

## Troubleshooting

### Logs

```bash
# Monolithic
docker logs -f inventory-ware

# Docker Compose
docker compose logs -f
```

### Common Issues

#### Container won't start
1.  Check logs for error messages.
2.  Verify environment variables are set correctly.
3.  Ensure ports are not already in use.

#### PocketBase admin not working
1.  Ensure `POCKETBASE_ADMIN_PASSWORD` is set to a non-default value.
2.  Access admin UI directly: http://localhost:8090/_/ or http://localhost:8888/_/.

## Production Recommendations

- **Security**: Always set `POCKETBASE_ADMIN_PASSWORD` to a strong, unique password.
- **SSL**: Use a reverse proxy (like Nginx, Caddy, or Traefik) to provide SSL/TLS termination.
- **Resource Limits**: Set CPU and memory limits to prevent resource exhaustion.
- **Backup**: Regularly backup the PocketBase data volume.

### Backup

Backup the PocketBase data volume:

```bash
docker run --rm \
  -v inventory-ware-pb-data:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/pb-data-$(date +%Y%m%d).tar.gz -C /data .
```

---

Happy self-hosting!

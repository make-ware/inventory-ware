#!/bin/sh
set -e

# Default environment variables
export PB_DATA_DIR="${PB_DATA_DIR:-/data/pb_data}"
export PB_MIGRATIONS_DIR="/app/pocketbase/pb_migrations"
export PB_HOOKS_DIR="/app/pocketbase/pb_hooks"
export LOG_LEVEL="${LOG_LEVEL:-info}"
export LOG_SERVER_NAME="${LOG_SERVER_NAME:-$(hostname 2>/dev/null || echo inventory-ware)}"
export TZ="${TZ:-UTC}"

# Create directories
mkdir -p "$PB_DATA_DIR"

{
    echo "DEBUG data=${PB_DATA_DIR} migrations=${PB_MIGRATIONS_DIR} hooks=${PB_HOOKS_DIR}"
} | /app/docker/log-prefix.sh startup INFO

# run-service.sh pipes PocketBase's output through the log filter and then
# hands it PID 1, so `docker stop` still reaches PocketBase directly.
exec /app/docker/run-service.sh pocketbase \
    /app/pocketbase/pocketbase serve \
    --http=0.0.0.0:8090 \
    --dir="$PB_DATA_DIR" \
    --migrationsDir="$PB_MIGRATIONS_DIR" \
    --hooksDir="$PB_HOOKS_DIR"

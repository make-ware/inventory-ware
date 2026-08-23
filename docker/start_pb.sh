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

# Ensure an administrable instance before serving. Without this, a compose
# deployment has no way to bootstrap an admin at all: PocketBase falls back to
# its first-run installer link, which is printed for 0.0.0.0:8090.
#
# pb-superuser.sh expects `log LEVEL message...`; the level word leads the line
# so the filter picks it up and applies the LOG_LEVEL threshold.
log() {
    level="$1"
    shift
    echo "$level $*" | /app/docker/log-prefix.sh startup INFO
}

PB_BIN=/app/pocketbase/pocketbase
PB_APP_USER=nextjs:nodejs
PB_LOG_SERVICE=startup
# shellcheck source=./pb-superuser.sh
. /app/docker/pb-superuser.sh

# run-service.sh pipes PocketBase's output through the log filter and then
# hands it PID 1, so `docker stop` still reaches PocketBase directly.
exec /app/docker/run-service.sh pocketbase \
    /app/pocketbase/pocketbase serve \
    --http=0.0.0.0:8090 \
    --dir="$PB_DATA_DIR" \
    --migrationsDir="$PB_MIGRATIONS_DIR" \
    --hooksDir="$PB_HOOKS_DIR"

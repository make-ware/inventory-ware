#!/bin/sh
set -e

# Default environment variables
export PB_DATA_DIR="${PB_DATA_DIR:-/data/pb_data}"
export PB_MIGRATIONS_DIR="/app/pocketbase/pb_migrations"
export PB_HOOKS_DIR="/app/pocketbase/pb_hooks"

# Create directories (attempt)
mkdir -p "$PB_DATA_DIR"

echo "Starting PocketBase..."
echo "  Data directory: $PB_DATA_DIR"
echo "  Migrations directory: $PB_MIGRATIONS_DIR"
echo "  Hooks directory: $PB_HOOKS_DIR"

# Start PocketBase with explicit migrations directory
exec /app/pocketbase/pocketbase serve --http=0.0.0.0:8090 --dir="$PB_DATA_DIR" --migrationsDir="$PB_MIGRATIONS_DIR" --hooksDir="$PB_HOOKS_DIR"

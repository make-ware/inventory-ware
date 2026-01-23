#!/bin/sh
set -e

# Default environment variables
export PB_DATA_DIR="${PB_DATA_DIR:-/data/pb_data}"

# Create directories (attempt)
mkdir -p "$PB_DATA_DIR"

echo "Starting PocketBase..."
echo "  Data directory: $PB_DATA_DIR"
echo "  Migrations directory: /app/pocketbase/pb_migrations"

# Start PocketBase with explicit migrations directory
exec /app/pocketbase/pocketbase serve --http=0.0.0.0:8090 --dir="$PB_DATA_DIR" --migrationsDir="/app/pocketbase/pb_migrations"

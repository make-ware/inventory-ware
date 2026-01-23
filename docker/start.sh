#!/bin/sh
set -e

# Only show startup messages if LOG_LEVEL is debug or verbose
if [ "${LOG_LEVEL}" = "debug" ] || [ "${LOG_LEVEL}" = "verbose" ]; then
  echo "=== Container Startup ==="
  echo ""
  echo "Setting environment variable defaults..."
fi

# PocketBase Configuration
export PB_DATA_DIR="${PB_DATA_DIR:-/data/pb_data}"
export PB_STORAGE_DIR="${PB_STORAGE_DIR:-/data/pb_storage}"
export PB_PUBLIC_DIR="${PB_PUBLIC_DIR:-/app/webapp/.next}"
# POCKETBASE_URL is for server-side code (bypasses nginx, connects directly)
export POCKETBASE_URL="${POCKETBASE_URL:-http://localhost:8090}"
export POCKETBASE_ADMIN_EMAIL="${POCKETBASE_ADMIN_EMAIL:-admin@example.com}"
export POCKETBASE_ADMIN_PASSWORD="${POCKETBASE_ADMIN_PASSWORD:-your-secure-password}"

# Container Behavior
export GRACEFUL_SHUTDOWN_TIMEOUT="${GRACEFUL_SHUTDOWN_TIMEOUT:-30}"

# Logging - Default to warn for production
export LOG_LEVEL="${LOG_LEVEL:-warn}"
export NODE_ENV="${NODE_ENV:-production}"

# =============================================================================
# Step 2: Create required directories with proper permissions
# =============================================================================
if [ "${LOG_LEVEL}" = "debug" ] || [ "${LOG_LEVEL}" = "verbose" ]; then
  echo "Creating required directories..."
fi

# Create PocketBase data directory
if [ ! -d "$PB_DATA_DIR" ]; then
    [ "${LOG_LEVEL}" = "debug" ] || [ "${LOG_LEVEL}" = "verbose" ] && echo "  Creating PB_DATA_DIR: $PB_DATA_DIR"
    mkdir -p "$PB_DATA_DIR"
fi

# Create PocketBase storage directory
if [ ! -d "$PB_STORAGE_DIR" ]; then
    [ "${LOG_LEVEL}" = "debug" ] || [ "${LOG_LEVEL}" = "verbose" ] && echo "  Creating PB_STORAGE_DIR: $PB_STORAGE_DIR"
    mkdir -p "$PB_STORAGE_DIR"
fi

# Create log directories
mkdir -p /var/log/supervisor
mkdir -p /var/log/nginx

# Ensure proper ownership for non-root user (nextjs:nodejs)
if [ "${LOG_LEVEL}" = "debug" ] || [ "${LOG_LEVEL}" = "verbose" ]; then
  echo "  Setting directory permissions..."
fi

# Set ownership for data directories
for dir in "$PB_DATA_DIR" "$PB_STORAGE_DIR"; do
    chown -R nextjs:nodejs "$dir" 2>/dev/null || {
      if [ "${LOG_LEVEL}" = "debug" ] || [ "${LOG_LEVEL}" = "verbose" ]; then
        echo "    Warning: Could not change ownership of $dir"
      fi
    }
    # Set appropriate permissions
    chmod -R 755 "$dir" 2>/dev/null || true
done

if [ "${LOG_LEVEL}" = "debug" ] || [ "${LOG_LEVEL}" = "verbose" ]; then
  echo ""
  echo "Directory setup complete:"
  echo "  - PB_DATA_DIR: $PB_DATA_DIR"
  echo "  - PB_STORAGE_DIR: $PB_STORAGE_DIR"
  echo "  - PB_PUBLIC_DIR: $PB_PUBLIC_DIR"
fi

# =============================================================================
# Step 3: Create PocketBase superuser
# =============================================================================
if [ "${LOG_LEVEL}" = "debug" ] || [ "${LOG_LEVEL}" = "verbose" ]; then
  echo ""
  echo "Creating PocketBase superuser..."
fi

# Only create superuser if password is not the default insecure one
if [ "$POCKETBASE_ADMIN_PASSWORD" != "your-secure-password" ]; then
    [ "${LOG_LEVEL}" = "debug" ] || [ "${LOG_LEVEL}" = "verbose" ] && echo "  Email: $POCKETBASE_ADMIN_EMAIL"
    [ "${LOG_LEVEL}" = "debug" ] || [ "${LOG_LEVEL}" = "verbose" ] && echo "  Creating superuser account..."
    
    # Run superuser upsert command
    if /app/pocketbase/pocketbase superuser upsert "$POCKETBASE_ADMIN_EMAIL" "$POCKETBASE_ADMIN_PASSWORD" --dir="$PB_DATA_DIR" 2>/dev/null; then
        [ "${LOG_LEVEL}" = "debug" ] || [ "${LOG_LEVEL}" = "verbose" ] && echo "  Superuser created successfully"
    else
        [ "${LOG_LEVEL}" = "debug" ] || [ "${LOG_LEVEL}" = "verbose" ] && echo "  Warning: Could not create superuser (this is normal if it already exists)"
    fi
else
    echo "Warning: Using default admin password - superuser creation skipped. Set POCKETBASE_ADMIN_PASSWORD to auto-create superuser." >&2
fi

# =============================================================================
# Step 4: Setup signal handlers for graceful shutdown
# =============================================================================
export GRACEFUL_SHUTDOWN_TIMEOUT="${GRACEFUL_SHUTDOWN_TIMEOUT:-30}"
[ "${LOG_LEVEL}" = "debug" ] || [ "${LOG_LEVEL}" = "verbose" ] && echo "" && echo "Graceful shutdown timeout: ${GRACEFUL_SHUTDOWN_TIMEOUT}s"

# =============================================================================
# Step 5: Start supervisord
# =============================================================================
if [ "${LOG_LEVEL}" = "debug" ] || [ "${LOG_LEVEL}" = "verbose" ]; then
  echo ""
  echo "Starting services with Supervisor..."
  echo "============================================"
  echo ""
fi

# Use exec to replace the shell process with supervisord
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf

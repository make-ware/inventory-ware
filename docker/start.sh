#!/bin/sh
set -e

# =============================================================================
# Logging setup
#
# Every line the container emits - from this script, supervisord, nginx,
# PocketBase and Next.js - is normalised to:
#
#   <server> [<service>] <ISO-8601 timestamp> <LEVEL> <message>
#
# Each supervised program writes into a pair of FIFOs (stdout and stderr) that
# have a log-prefix filter attached; supervisord's own output goes through one
# too. The filters are started here, before supervisord, because opening a FIFO
# for writing blocks until a reader is attached.
# =============================================================================
export LOG_LEVEL="${LOG_LEVEL:-info}"
# `hostname`, not $HOSTNAME: the image sets that variable to 0.0.0.0 for
# Next.js's listen address.
export LOG_SERVER_NAME="${LOG_SERVER_NAME:-$(hostname 2>/dev/null || echo inventory-ware)}"
# Timestamps are emitted as UTC, so make sure that is what the clock reports.
export TZ="${TZ:-UTC}"

LOG_FIFO_DIR=/var/run/log
LOG_SERVICES="pocketbase nextjs nginx"

log_rank() {
    case "$(echo "$1" | tr '[:upper:]' '[:lower:]')" in
        trace | verbose) echo 10 ;;
        debug) echo 20 ;;
        info) echo 30 ;;
        warn | warning) echo 40 ;;
        error) echo 50 ;;
        fatal | panic) echo 60 ;;
        *) echo 30 ;;
    esac
}

LOG_MIN_RANK="$(log_rank "$LOG_LEVEL")"

# Startup messages are formatted inline rather than piped: this script has to
# hand its stdout to supervisord at the end, so it cannot sit behind a filter.
log() {
    level="$1"
    shift
    [ "$(log_rank "$level")" -lt "$LOG_MIN_RANK" ] && return 0
    printf '%s [%s] %s %-5s %s\n' \
        "$LOG_SERVER_NAME" "startup" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$level" "$*"
    return 0
}

# Runs a command with its output relabelled as [startup], so third-party output
# (the PocketBase CLI) is formatted like everything else. The exit status is
# carried out of the pipeline by hand - POSIX sh reports only the filter's.
log_filtered() {
    status_file="$(mktemp)"
    { "$@" 2>&1; echo "$?" >"$status_file"; } | /app/docker/log-prefix.sh startup INFO
    status="$(cat "$status_file")"
    rm -f "$status_file"
    return "${status:-1}"
}

# =============================================================================
# Step 1: Environment defaults
# =============================================================================

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
export NODE_ENV="${NODE_ENV:-production}"

# PocketBase only prints its request and SQL logs to the console in dev mode,
# which is far too loud for anything but the most verbose setting. At `debug`
# the pb_hooks request logger covers requests without the SQL firehose.
if [ "${LOG_LEVEL}" = "verbose" ] || [ "${LOG_LEVEL}" = "trace" ]; then
    export PB_EXTRA_FLAGS="--dev"
else
    export PB_EXTRA_FLAGS=""
fi

log INFO "Inventory Ware starting (log level ${LOG_LEVEL}, node env ${NODE_ENV})"

# =============================================================================
# Step 2: Create required directories with proper permissions
# =============================================================================
for dir in "$PB_DATA_DIR" "$PB_STORAGE_DIR"; do
    if [ ! -d "$dir" ]; then
        log DEBUG "Creating $dir"
        mkdir -p "$dir"
    fi
done

mkdir -p /var/log/supervisor /var/log/nginx

for dir in "$PB_DATA_DIR" "$PB_STORAGE_DIR"; do
    chown -R nextjs:nodejs "$dir" 2>/dev/null ||
        log WARN "Could not change ownership of $dir - continuing"
    chmod -R 755 "$dir" 2>/dev/null || true
done

log DEBUG "Data directories: pb_data=${PB_DATA_DIR} pb_storage=${PB_STORAGE_DIR} public=${PB_PUBLIC_DIR}"

# =============================================================================
# Step 3: Create PocketBase superuser
# =============================================================================
if [ "$POCKETBASE_ADMIN_PASSWORD" != "your-secure-password" ]; then
    log INFO "Upserting PocketBase superuser ${POCKETBASE_ADMIN_EMAIL}"
    if ! log_filtered /app/pocketbase/pocketbase superuser upsert \
        "$POCKETBASE_ADMIN_EMAIL" "$POCKETBASE_ADMIN_PASSWORD" --dir="$PB_DATA_DIR"; then
        log WARN "Could not upsert superuser ${POCKETBASE_ADMIN_EMAIL} - continuing"
    fi

    # The upsert runs as root, so on a fresh volume it is what creates data.db -
    # owned by root, which the PocketBase service (running as nextjs) then finds
    # read-only and dies applying its first migration.
    chown -R nextjs:nodejs "$PB_DATA_DIR" 2>/dev/null ||
        log WARN "Could not reset ownership of ${PB_DATA_DIR} after superuser upsert"
else
    log WARN "POCKETBASE_ADMIN_PASSWORD is unset - skipping superuser creation. Set it to auto-create the admin account."
fi

# AI image analysis is optional; warn once rather than failing the container.
# No defaults are exported for AI_PROVIDER/AI_MODEL: an empty default would
# defeat provider auto-detection and the built-in per-provider model defaults.
if [ -z "${OPENAI_API_KEY}" ] && [ -z "${GEMINI_API_KEY}" ] && [ -z "${GOOGLE_GENERATIVE_AI_API_KEY}" ]; then
    log WARN "No AI provider key set (OPENAI_API_KEY or GEMINI_API_KEY) - image analysis is disabled and the AI routes will return 503 AI_NOT_CONFIGURED"
fi

# =============================================================================
# Step 4: Attach log filters
# =============================================================================
mkdir -p "$LOG_FIFO_DIR"

for service in $LOG_SERVICES; do
    for stream in out err; do
        fifo="$LOG_FIFO_DIR/$service.$stream"
        # A restarted container keeps its filesystem, so clear stale FIFOs.
        rm -f "$fifo"
        mkfifo -m 600 "$fifo"
    done

    # stdout defaults to INFO, stderr to ERROR; a line that carries its own
    # level (nginx's "[warn]", our own "ERROR ...") overrides the default.
    /app/docker/log-prefix.sh "$service" INFO <"$LOG_FIFO_DIR/$service.out" &
    /app/docker/log-prefix.sh "$service" ERROR <"$LOG_FIFO_DIR/$service.err" &
done

rm -f "$LOG_FIFO_DIR/supervisor.out"
mkfifo -m 600 "$LOG_FIFO_DIR/supervisor.out"
/app/docker/log-prefix.sh supervisor INFO <"$LOG_FIFO_DIR/supervisor.out" &

log INFO "Starting services (graceful shutdown timeout ${GRACEFUL_SHUTDOWN_TIMEOUT}s)"

# =============================================================================
# Step 5: Start supervisord
#
# exec keeps supervisord as PID 1 so it receives SIGTERM from `docker stop`
# directly. Its own output is redirected into the filter FIFO; the filters
# themselves keep writing to the container's real stdout, which they inherited
# from this script before the redirect.
# =============================================================================
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf \
    >"$LOG_FIFO_DIR/supervisor.out" 2>&1

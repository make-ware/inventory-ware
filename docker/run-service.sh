#!/bin/sh
# Runs a single-process image's service with its stdout and stderr piped through
# the log filter, so the split webapp/pocketbase images produce the same line
# format as the monolith. The monolith does not use this - there, supervisord
# writes each program's output into FIFOs that start.sh already has filters on.
#
# The wrapper exec()s into the service, so the service keeps PID 1: `docker stop`
# signals it directly and its exit status is the container's.
#
# Usage: run-service.sh <service-name> <command> [args...]
set -e

service="$1"
shift

if [ -z "$service" ] || [ $# -eq 0 ]; then
    echo "usage: run-service.sh <service-name> <command> [args...]" >&2
    exit 2
fi

export LOG_LEVEL="${LOG_LEVEL:-info}"
# `hostname`, not $HOSTNAME: the image sets that variable to the listen address.
export LOG_SERVER_NAME="${LOG_SERVER_NAME:-$(hostname 2>/dev/null || echo inventory-ware)}"

dir="$(mktemp -d)"
out="$dir/out"
err="$dir/err"

# 0666 because a service that drops privileges (nginx workers) may reopen its
# own stdout through /proc/self/fd, which re-checks permissions on the FIFO.
mkfifo -m 666 "$out" "$err"

# Readers first: opening a FIFO for writing blocks until a reader attaches.
/app/docker/log-prefix.sh "$service" INFO <"$out" &
/app/docker/log-prefix.sh "$service" ERROR <"$err" &

exec 3>"$out" 4>"$err"

# Both ends are open on fd 3/4 now, so the paths are no longer needed.
rm -f "$out" "$err"
rmdir "$dir" 2>/dev/null || true

exec "$@" >&3 2>&4 3>&- 4>&-

#!/bin/sh
# Pipes stdin through log-prefix.awk, tagged as one service.
#
# Usage: log-prefix.sh <service> [DEFAULT_LEVEL]
#
# DEFAULT_LEVEL is the level applied to lines that carry none of their own:
# INFO for a stdout stream, ERROR for a stderr stream.
#
# TERM/INT/QUIT are ignored so a filter attached to a service being shut down
# outlives it and still formats whatever that service prints on its way out. It
# exits on EOF, once the last writer closes. Ignored signal dispositions survive
# exec(), so awk inherits them.
trap '' TERM INT QUIT

exec awk \
    -v server="${LOG_SERVER_NAME:-server}" \
    -v service="${1:-app}" \
    -v level="${2:-INFO}" \
    -v threshold="${LOG_LEVEL:-info}" \
    -f /app/docker/log-prefix.awk

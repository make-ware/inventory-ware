# Normalises one log stream into the container's canonical line format:
#
#   <server> [<service>] <timestamp> <LEVEL> <message>
#
# Every process in the image writes through this filter (see run-service.sh),
# which is what makes nginx, PocketBase, Next.js and supervisord - four programs
# with four different log formats - come out looking like one application.
#
# Variables, all set with -v:
#   server     host label for the prefix (LOG_SERVER_NAME)
#   service    which process produced the line
#   level      level to assume for lines that carry none. stdout streams pass
#              INFO, stderr streams pass ERROR.
#   threshold  LOG_LEVEL; lines below it are dropped
#
# Written for busybox awk (alpine), so: no gawk extensions, no {n} regex
# intervals, and dynamic regexes are built as strings.

function canon(s,   u) {
    u = toupper(s)
    if (u == "VERBOSE" || u == "TRACE") return "TRACE"
    if (u == "DEBUG" || u == "DBG") return "DEBUG"
    if (u == "INFO" || u == "NOTICE" || u == "NOTE") return "INFO"
    if (u == "WARN" || u == "WARNING" || u == "WRN") return "WARN"
    if (u == "ERROR" || u == "ERR" || u == "CRIT" || u == "CRITICAL") return "ERROR"
    if (u == "ALERT" || u == "EMERG") return "ERROR"
    if (u == "FATAL" || u == "PANIC") return "FATAL"
    return ""
}

BEGIN {
    ESC = sprintf("%c", 27)
    ANSI = ESC "\\[[0-9;?]*[a-zA-Z]"

    rank["TRACE"] = 10
    rank["DEBUG"] = 20
    rank["INFO"]  = 30
    rank["WARN"]  = 40
    rank["ERROR"] = 50
    rank["FATAL"] = 60

    if (server == "") server = "server"
    if (service == "") service = "app"

    level = canon(level)
    if (level == "") level = "INFO"

    floor = canon(threshold)
    if (floor == "") floor = "INFO"
    min = rank[floor]

    # Level carried over to continuation lines (stack traces, wrapped detail).
    last = level
}

{
    line = $0
    sub(/\r$/, "", line)
    gsub(ANSI, "", line)

    # Already normalised by another filter (a wrapped service whose output is
    # relayed through a second stream) - pass it through rather than prefixing
    # it twice.
    if (index(line, server " [") == 1 &&
        match(substr(line, length(server) + 2), /^\[[A-Za-z0-9_.-]+\] [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[^ ]+ (TRACE|DEBUG|INFO|WARN|ERROR|FATAL) /)) {
        print line
        fflush()
        next
    }

    # Indented lines continue the record above them and inherit its level, so a
    # stack trace is not split across two levels (and not half-filtered out).
    cont = (line ~ /^[ \t]/)

    if (line ~ /^[ \t]*$/) next

    stamp = ""
    lvl = ""

    # Timestamps the sources emit, normalised to ISO-8601. Keeping the source's
    # own timestamp preserves sub-second precision and the real event time; only
    # lines without one get stamped with the arrival time.
    if (match(line, /^[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9][T ][0-9][0-9]:[0-9][0-9]:[0-9][0-9]([.,][0-9][0-9]*)?(Z|[+-][0-9][0-9]:?[0-9][0-9])?/)) {
        stamp = substr(line, 1, RLENGTH)
        line = substr(line, RLENGTH + 1)
        sub(/ /, "T", stamp)
        sub(/,/, ".", stamp)
        if (stamp !~ /(Z|[+-][0-9][0-9]:?[0-9][0-9])$/) stamp = stamp "Z"
    } else if (match(line, /^[0-9][0-9][0-9][0-9]\/[0-9][0-9]\/[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]/)) {
        # Go's standard logger: PocketBase and nginx both use it.
        stamp = substr(line, 1, RLENGTH)
        line = substr(line, RLENGTH + 1)
        gsub(/\//, "-", stamp)
        sub(/ /, "T", stamp)
        stamp = stamp "Z"
    }

    sub(/^[ \t]+/, "", line)
    if (line == "") next

    if (!cont) {
        if (match(line, /^\[(emerg|alert|crit|error|warn|notice|info|debug)\]/)) {
            # nginx error log: "[error] 23#23: *1 connect() failed ..."
            lvl = canon(substr(line, 2, RLENGTH - 2))
            line = substr(line, RLENGTH + 1)
        } else {
            n = index(line, " ")
            tok = (n ? substr(line, 1, n - 1) : line)
            sub(/[:\]]$/, "", tok)
            # Only an all-caps token is a level marker. Prose that merely starts
            # with "Error:" keeps its wording and takes the stream default.
            if (tok == toupper(tok) && canon(tok) != "") {
                lvl = canon(tok)
                line = (n ? substr(line, n + 1) : "")
            }
        }

        if (lvl == "") {
            if (line ~ /^\(node:[0-9]+\) /) lvl = "WARN"          # node runtime warnings
            else if (line ~ /^! /) lvl = "WARN"                   # corepack / yarn notices
            else if (line ~ /^[Ww]arning[:!]/) lvl = "WARN"
            else if (index(line, "⨯") > 0) lvl = "ERROR"          # Next.js error marker
            else if (index(line, "⚠") > 0) lvl = "WARN"           # Next.js warning marker
        }
    }

    sub(/^[ \t]+/, "", line)
    if (line == "") next

    if (lvl == "") lvl = (cont ? last : level)
    last = lvl

    if (rank[lvl] < min) next

    if (stamp == "") stamp = strftime("%Y-%m-%dT%H:%M:%SZ", systime(), 1)

    printf "%s [%s] %s %-5s %s\n", server, service, stamp, lvl, line
    fflush()
}

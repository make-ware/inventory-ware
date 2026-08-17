/**
 * Structured application logging.
 *
 * Lines are emitted as:
 *
 *   <ISO-8601 timestamp> <LEVEL> [<scope>] <message> key=value ...
 *
 * which is the shape `docker/log-prefix.awk` understands: in the container it
 * strips the timestamp and level back off and re-emits the line as
 * `<server> [nextjs] <timestamp> <LEVEL> <message>`, alongside nginx,
 * PocketBase and supervisord. Outside the container (yarn dev, tests) the line
 * still reads on its own.
 *
 * Deliberately dependency-free and free of `import 'server-only'`: the
 * `@/services` barrel is imported by 'use client' modules, so anything in that
 * graph has to build for the browser too.
 */

export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export type LogFields = Record<string, unknown>;

export interface Logger {
  trace(message: string, fields?: LogFields): void;
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
  /** A logger for a narrower scope, e.g. `createLogger('a').child('b')`. */
  child(scope: string): Logger;
}

const RANK: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

const isBrowser = typeof window !== 'undefined';

/** Accepts the container's `verbose` spelling as an alias for `trace`. */
export function normalizeLevel(
  value: string | undefined,
  fallback: LogLevel
): LogLevel {
  const level = (value ?? '').trim().toLowerCase();
  if (level === 'verbose') return 'trace';
  return (LOG_LEVELS as readonly string[]).includes(level)
    ? (level as LogLevel)
    : fallback;
}

function configuredLevel(): LogLevel {
  const env = typeof process !== 'undefined' ? process.env : undefined;
  // The browser never sees LOG_LEVEL (it is not NEXT_PUBLIC_), and info-level
  // chatter in a devtools console is noise, so the client starts at warn.
  const fallback: LogLevel = isBrowser ? 'warn' : 'info';
  return normalizeLevel(env?.LOG_LEVEL ?? env?.NEXT_PUBLIC_LOG_LEVEL, fallback);
}

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Error) return JSON.stringify(value.message);
  if (typeof value === 'string') {
    // Quote only when it would otherwise break key=value parsing.
    return /[\s"=]/.test(value) ? JSON.stringify(value) : value;
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function formatFields(fields: LogFields | undefined): string {
  if (!fields) return '';
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => ` ${key}=${formatValue(value)}`)
    .join('');
}

/**
 * Stack traces of any Error in the fields, indented. The log filter treats
 * indented lines as a continuation of the record above, so a trace keeps the
 * level of the message it belongs to instead of being split off or filtered.
 */
function formatStacks(fields: LogFields | undefined): string {
  if (!fields) return '';
  return Object.values(fields)
    .filter((value): value is Error => value instanceof Error)
    .map((error) =>
      error.stack ? `\n  ${error.stack.split('\n').join('\n  ')}` : ''
    )
    .join('');
}

function emit(
  level: LogLevel,
  scope: string,
  message: string,
  fields?: LogFields
): void {
  if (RANK[level] < RANK[configuredLevel()]) return;

  const line =
    `${new Date().toISOString()} ${level.toUpperCase()} [${scope}] ${message}` +
    formatFields(fields) +
    formatStacks(fields);

  // Routed so that warnings and errors land on stderr, which is what the
  // container's log filter defaults those streams to.
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/**
 * The human-readable part of an unknown thrown value. Use it instead of passing
 * the error itself when the failure is expected and routine (a rejected
 * request, say) - passing an Error attaches its stack, which is noise when
 * nothing is actually broken.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}

export function createLogger(scope: string): Logger {
  return {
    trace: (message, fields) => emit('trace', scope, message, fields),
    debug: (message, fields) => emit('debug', scope, message, fields),
    info: (message, fields) => emit('info', scope, message, fields),
    warn: (message, fields) => emit('warn', scope, message, fields),
    error: (message, fields) => emit('error', scope, message, fields),
    child: (childScope) => createLogger(`${scope}/${childScope}`),
  };
}

export const logger = createLogger('app');

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createLogger, normalizeLevel } from '@/lib/logger';

/**
 * The line shape asserted here is a contract with docker/log-prefix.awk, which
 * parses the timestamp and level back off in the container. Changing the format
 * means changing that filter too.
 */
const LINE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z (TRACE|DEBUG|INFO|WARN|ERROR) \[[^\]]+\] /;

describe('logger', () => {
  const original = process.env.LOG_LEVEL;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.LOG_LEVEL = 'info';
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (original === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = original;
  });

  it('emits timestamp, level, scope and message', () => {
    createLogger('api-next/process-image').info('image processed');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const line = logSpy.mock.calls[0][0] as string;
    expect(line).toMatch(LINE);
    expect(line).toContain('INFO [api-next/process-image] image processed');
  });

  it('renders fields as key=value, quoting only what needs it', () => {
    createLogger('inventory').info('image processed', {
      imageId: 'abc123',
      durationMs: 812,
      ok: true,
      note: 'two words',
      skipped: undefined,
    });

    const line = logSpy.mock.calls[0][0] as string;
    expect(line).toContain('imageId=abc123');
    expect(line).toContain('durationMs=812');
    expect(line).toContain('ok=true');
    expect(line).toContain('note="two words"');
    expect(line).not.toContain('skipped=');
  });

  it('routes warn and error to the stderr consoles', () => {
    const log = createLogger('scope');
    log.warn('careful');
    log.error('broken');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('drops levels below LOG_LEVEL', () => {
    process.env.LOG_LEVEL = 'warn';
    const log = createLogger('scope');

    log.debug('quiet');
    log.info('quiet');
    log.warn('loud');

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('logs debug once LOG_LEVEL allows it', () => {
    process.env.LOG_LEVEL = 'debug';
    createLogger('scope').debug('detail');

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls[0][0]).toContain('DEBUG [scope] detail');
  });

  it('appends error stacks as indented continuation lines', () => {
    const err = new Error('boom');
    createLogger('scope').error('failed', { err });

    const line = errorSpy.mock.calls[0][0] as string;
    // The message is inline; the stack follows, indented so the container's log
    // filter keeps it attached to this record at the same level.
    expect(line).toContain('err="boom"');
    expect(line).toContain('\n  Error: boom');
    for (const stackLine of line.split('\n').slice(1)) {
      expect(stackLine.startsWith('  ')).toBe(true);
    }
  });

  it('serializes non-Error field values', () => {
    createLogger('scope').error('failed', { err: { code: 42 } });

    expect(errorSpy.mock.calls[0][0]).toContain('err={"code":42}');
  });

  it('namespaces child loggers', () => {
    createLogger('parent').child('child').info('hello');

    expect(logSpy.mock.calls[0][0]).toContain('[parent/child]');
  });

  it('treats the container "verbose" spelling as trace', () => {
    expect(normalizeLevel('verbose', 'info')).toBe('trace');
    expect(normalizeLevel('WARN', 'info')).toBe('warn');
    expect(normalizeLevel('nonsense', 'info')).toBe('info');
    expect(normalizeLevel(undefined, 'warn')).toBe('warn');
  });
});

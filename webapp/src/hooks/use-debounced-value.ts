'use client';

import * as React from 'react';

/**
 * Return `value` after it has stopped changing for `delayMs`.
 *
 * Trailing-edge debounce — used both for typeahead (one request per pause,
 * not per keystroke) and for TanStack Query keys (every distinct key is a
 * distinct cache entry/request). `delayMs <= 0` passes through with no timer
 * so tests that don't care about debouncing don't need fake timers.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    if (delayMs <= 0) {
      setDebounced(value);
      return;
    }
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return delayMs <= 0 ? value : debounced;
}

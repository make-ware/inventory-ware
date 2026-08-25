import * as React from 'react';

/**
 * Return `value` after it has stopped changing for `delayMs`.
 *
 * Used to keep a typeahead from issuing one request per keystroke. A
 * `delayMs <= 0` passes the value straight through with no timer, which keeps
 * tests that don't care about debouncing free of fake timers.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
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

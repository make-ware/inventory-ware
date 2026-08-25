'use client';

import { useEffect, useState } from 'react';

/**
 * Trailing-edge debounce for a rapidly changing value.
 *
 * Used to keep keystrokes out of TanStack Query keys: every distinct key is a
 * distinct cache entry and a distinct request, so feeding the raw search box
 * value in would fire (and cache) one PocketBase list request per character.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

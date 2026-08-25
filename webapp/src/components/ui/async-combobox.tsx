'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

/**
 * One page of results.
 *
 * Declared structurally rather than importing PocketBase's `ListResult` so
 * `components/ui/` stays free of data-layer imports; a `ListResult<T>`
 * satisfies it as-is.
 */
export interface AsyncComboboxPage<T> {
  items: T[];
  page: number;
  totalPages: number;
  totalItems: number;
}

export interface AsyncComboboxProps<T> {
  /** The selected option's value, or `''`/undefined for no selection. */
  value?: string;
  /**
   * Label for the current selection.
   *
   * Caller-owned, because the selected record may not be in any page this
   * component has loaded (or in any page at all, once a filter changes).
   */
  selectedLabel?: string;
  onChange: (value: string, item: T | null) => void;
  /**
   * Fetch one page of results. Owns its own `perPage`, sort and filters.
   *
   * Its identity is *not* a refetch trigger — it is read from a ref, so an
   * inline arrow function is fine. Use `queryKey` to signal that its captured
   * filters changed.
   */
  fetchPage: (query: string, page: number) => Promise<AsyncComboboxPage<T>>;
  /** Change this when `fetchPage`'s filters change, to force a refetch. */
  queryKey?: string;
  /** Change this to hard-reset the query and reload from page 1. */
  resetToken?: string | number;
  getOptionValue: (item: T) => string;
  getOptionLabel: (item: T) => string;
  /** Optional secondary line under the label. */
  getOptionDescription?: (item: T) => string | undefined;
  /** Full control over an option's contents, replacing label/description. */
  renderOption?: (item: T) => React.ReactNode;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  /** Debounce before a typed query is sent. `0` disables the timer. */
  debounceMs?: number;
  className?: string;
  disabled?: boolean;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'false' | 'true' | 'grammar' | 'spelling';
}

type Status = 'idle' | 'loading' | 'loadingMore' | 'ready' | 'error';

/**
 * A typeahead whose options come from the server, one page at a time.
 *
 * Use this for anything backed by a collection that grows with the user's
 * inventory (items, containers); `Combobox` remains the right widget for a
 * small static vocabulary. Typing issues a debounced query, and scrolling to
 * the bottom of the list loads the next page — with a keyboard-reachable
 * "Load more" row as the fallback when `IntersectionObserver` is unavailable.
 *
 * There is deliberately no `allowCreate`: this picks an existing record, and a
 * free-typed value would be a dangling foreign key. There is also no `perPage`
 * — page size belongs to `fetchPage`, next to the filters and sort it already
 * owns.
 *
 * See docs/DROPDOWNS.md for when to reach for this and how to wire one up.
 */
export function AsyncCombobox<T>({
  value,
  selectedLabel,
  onChange,
  fetchPage,
  queryKey,
  resetToken,
  getOptionValue,
  getOptionLabel,
  getOptionDescription,
  renderOption,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No results found',
  debounceMs = 300,
  className,
  disabled = false,
  ...props
}: AsyncComboboxProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [items, setItems] = React.useState<T[]>([]);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(0);
  const [status, setStatus] = React.useState<Status>('idle');

  // Radix unmounts the popover contents on close, so the list and sentinel
  // nodes have to be state: a ref would not retrigger the observer effect when
  // they reappear.
  const [listEl, setListEl] = React.useState<HTMLDivElement | null>(null);
  const [sentinelEl, setSentinelEl] = React.useState<HTMLDivElement | null>(
    null
  );

  const debouncedQuery = useDebouncedValue(query, debounceMs);
  const isStale = query !== debouncedQuery;

  // Callbacks live in refs so they never become effect dependencies: callers
  // pass inline arrows, which would otherwise refetch on every render. This
  // effect is declared first on purpose - effects run in declaration order, so
  // the refs are current before anything below reads them.
  const fetchRef = React.useRef(fetchPage);
  const optionValueRef = React.useRef(getOptionValue);
  React.useEffect(() => {
    fetchRef.current = fetchPage;
    optionValueRef.current = getOptionValue;
  });

  // Monotonic request id. `pb.autoCancellation(false)` means nothing aborts in
  // flight, so dropping out-of-order responses is the only stale-guard.
  const seqRef = React.useRef(0);
  // Set after a failed page load, so a still-intersecting sentinel does not
  // retry on every layout tick.
  const blockedRef = React.useRef(false);
  const inFlightRef = React.useRef(false);

  const appendUnique = React.useCallback((previous: T[], incoming: T[]) => {
    const seen = new Set(previous.map((item) => optionValueRef.current(item)));
    const added = incoming.filter((item) => {
      const key = optionValueRef.current(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return added.length > 0 ? [...previous, ...added] : previous;
  }, []);

  // Load page 1 whenever the popover opens or the effective query changes.
  React.useEffect(() => {
    if (!open) return;

    const seq = ++seqRef.current;
    blockedRef.current = false;
    inFlightRef.current = true;
    setStatus('loading');
    setItems([]);
    setPage(1);
    setTotalPages(0);

    fetchRef
      .current(debouncedQuery, 1)
      .then((result) => {
        if (seqRef.current !== seq) return;
        inFlightRef.current = false;
        setItems(appendUnique([], result.items));
        setPage(result.page ?? 1);
        setTotalPages(result.totalPages ?? 0);
        setStatus('ready');
      })
      .catch(() => {
        if (seqRef.current !== seq) return;
        inFlightRef.current = false;
        blockedRef.current = true;
        setStatus('error');
      });
  }, [open, debouncedQuery, queryKey, resetToken, appendUnique]);

  // Closing discards everything, including any response still in flight. All
  // this state lives in the always-mounted parent, so a late resolve cannot
  // touch an unmounted tree.
  React.useEffect(() => {
    if (open) return;
    seqRef.current++;
    blockedRef.current = false;
    inFlightRef.current = false;
    setQuery('');
    setItems([]);
    setPage(1);
    setTotalPages(0);
    setStatus('idle');
  }, [open]);

  const requestPage = React.useCallback(
    (next: number) => {
      if (inFlightRef.current || blockedRef.current) return;

      const seq = ++seqRef.current;
      inFlightRef.current = true;
      setStatus('loadingMore');

      fetchRef
        .current(debouncedQuery, next)
        .then((result) => {
          if (seqRef.current !== seq) return;
          inFlightRef.current = false;
          setItems((previous) => appendUnique(previous, result.items));
          setPage(next);
          // An empty page means the collection shrank under us; clamp so the
          // sentinel cannot spin forever asking for pages that no longer exist.
          setTotalPages(
            result.items.length === 0 ? next : (result.totalPages ?? next)
          );
          setStatus('ready');
        })
        .catch(() => {
          if (seqRef.current !== seq) return;
          inFlightRef.current = false;
          blockedRef.current = true;
          setStatus('error');
        });
    },
    [debouncedQuery, appendUnique]
  );

  const hasMore = page < totalPages;
  const canAutoLoad = status === 'ready' && hasMore && !isStale;

  React.useEffect(() => {
    if (!listEl || !sentinelEl || !canAutoLoad) return;

    // Read off `window` inside the effect so a test mock (or a browser without
    // it) is picked up here rather than at module load.
    const Observer =
      typeof window === 'undefined' ? undefined : window.IntersectionObserver;
    if (!Observer) return;

    const observer = new Observer(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          requestPage(page + 1);
        }
      },
      { root: listEl, rootMargin: '0px 0px 96px 0px' }
    );
    observer.observe(sentinelEl);
    return () => observer.disconnect();
  }, [listEl, sentinelEl, canAutoLoad, page, requestPage]);

  const handleSelect = (item: T) => {
    onChange(optionValueRef.current(item), item);
    setOpen(false);
  };

  const handleRetry = () => {
    blockedRef.current = false;
    requestPage(page + 1);
  };

  const isSearching = status === 'loading' || isStale;
  const showEmpty = !isSearching && status === 'ready' && items.length === 0;
  const showLoadFailed =
    !isSearching && status === 'error' && items.length === 0;

  // The footer stays mounted for as long as there are options: cmdk moves its
  // highlight to the first item when the highlighted one unmounts, and scrolls
  // it into view, so removing this row on the last page would yank the list
  // back to the top. `disabled` keeps it out of arrow navigation except when
  // it is actually actionable.
  const footer =
    status === 'loadingMore'
      ? { label: 'Loading...', disabled: true, onSelect: () => {} }
      : status === 'error'
        ? { label: 'Retry', disabled: false, onSelect: handleRetry }
        : hasMore
          ? {
              label: 'Load more',
              disabled: false,
              onSelect: () => requestPage(page + 1),
            }
          : { label: 'End of results', disabled: true, onSelect: () => {} };

  const triggerLabel = value ? (selectedLabel ?? value) : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between font-normal', className)}
          disabled={disabled}
          {...props}
        >
          <span className={cn('truncate', !value && 'text-muted-foreground')}>
            {triggerLabel}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) p-0"
      >
        {/* Filtering happens on the server; cmdk must not re-filter or reorder
            the pages it is handed. */}
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList ref={setListEl}>
            {/* Deliberately not CommandEmpty: with `shouldFilter={false}` cmdk
                renders it whenever zero items are mounted, so it would flash
                on every load. */}
            {isSearching && (
              <div
                role="status"
                className="text-muted-foreground flex items-center justify-center gap-2 py-6 text-sm"
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching...
              </div>
            )}
            {showEmpty && (
              <div className="text-muted-foreground py-6 text-center text-sm">
                {emptyMessage}
              </div>
            )}
            {showLoadFailed && (
              <div className="py-6 text-center text-sm">
                <p className="text-muted-foreground">Could not load results.</p>
                <button
                  type="button"
                  className="mt-2 text-sm underline underline-offset-4"
                  onClick={() => {
                    blockedRef.current = false;
                    requestPage(1);
                  }}
                >
                  Retry
                </button>
              </div>
            )}
            {items.length > 0 && (
              <CommandGroup>
                {items.map((item) => {
                  const optionValue = getOptionValue(item);
                  const description = getOptionDescription?.(item);
                  return (
                    <CommandItem
                      key={optionValue}
                      value={optionValue}
                      onSelect={() => handleSelect(item)}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4 shrink-0',
                          value === optionValue ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      {renderOption ? (
                        renderOption(item)
                      ) : (
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">
                            {getOptionLabel(item)}
                          </span>
                          {description && (
                            <span className="text-muted-foreground block truncate text-xs">
                              {description}
                            </span>
                          )}
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
            {/* Plain div, not a CommandItem: the sentinel must not join arrow
                navigation. */}
            <div ref={setSentinelEl} aria-hidden="true" className="h-px" />
            {items.length > 0 && (
              <CommandItem
                value="__async_combobox_footer__"
                disabled={footer.disabled}
                onSelect={footer.onSelect}
                className="text-muted-foreground justify-center text-xs"
              >
                {status === 'loadingMore' && (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                )}
                {footer.label}
              </CommandItem>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

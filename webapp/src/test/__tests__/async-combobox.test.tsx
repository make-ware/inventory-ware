import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  AsyncCombobox,
  type AsyncComboboxPage,
} from '@/components/ui/async-combobox';

interface Row {
  id: string;
  label: string;
}

type FetchPage = (
  query: string,
  page: number
) => Promise<AsyncComboboxPage<Row>>;

// cmdk + Radix need these; happy-dom ships none of them.
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class MockPointerEvent extends Event {
  button: number;
  ctrlKey: boolean;
  pointerType: string;

  constructor(type: string, props: PointerEventInit = {}) {
    super(type, props);
    this.button = props.button || 0;
    this.ctrlKey = props.ctrlKey || false;
    this.pointerType = props.pointerType || 'mouse';
  }
}

/**
 * Records every observer the component creates so a test can drive the
 * sentinel by hand — happy-dom has no layout, so nothing ever intersects.
 */
class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  callback: IntersectionObserverCallback;
  targets: Element[] = [];

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }

  observe(target: Element) {
    this.targets.push(target);
  }
  unobserve() {}
  disconnect() {
    this.targets = [];
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

/** Fire the newest observer as if its sentinel scrolled into view. */
function triggerSentinel() {
  const observer = MockIntersectionObserver.instances.at(-1);
  if (!observer) throw new Error('no IntersectionObserver was created');
  observer.callback(
    [{ isIntersecting: true } as IntersectionObserverEntry],
    observer as unknown as IntersectionObserver
  );
}

function page(
  items: Row[],
  overrides: Partial<AsyncComboboxPage<Row>> = {}
): AsyncComboboxPage<Row> {
  return {
    items,
    page: 1,
    totalPages: 1,
    totalItems: items.length,
    ...overrides,
  };
}

function rows(prefix: string, count: number, from = 1): Row[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}${from + index}`,
    label: `${prefix} ${from + index}`,
  }));
}

function renderCombobox(
  props: Partial<React.ComponentProps<typeof AsyncCombobox<Row>>> = {}
) {
  const fetchPage = (props.fetchPage ??
    vi.fn(async () => page(rows('Item', 2)))) as Mock<FetchPage>;
  const onChange = props.onChange ?? vi.fn();
  const utils = render(
    <AsyncCombobox<Row>
      onChange={onChange}
      fetchPage={fetchPage}
      getOptionValue={(item) => item.id}
      getOptionLabel={(item) => item.label}
      placeholder="Select an item..."
      // No timer by default; the debounce has its own test.
      debounceMs={0}
      {...props}
    />
  );
  return { ...utils, fetchPage, onChange };
}

const openCombobox = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('combobox'));
};

describe('AsyncCombobox', () => {
  beforeAll(() => {
    global.ResizeObserver = ResizeObserver;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.PointerEvent = MockPointerEvent as any;
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  });

  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    global.IntersectionObserver = MockIntersectionObserver as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.IntersectionObserver = MockIntersectionObserver as any;
  });

  it('does not fetch anything until it is opened', () => {
    const { fetchPage } = renderCombobox();

    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('fetches the first page when opened', async () => {
    const user = userEvent.setup();
    const { fetchPage } = renderCombobox();

    await openCombobox(user);

    await waitFor(() => expect(fetchPage).toHaveBeenCalledWith('', 1));
    expect(await screen.findByText('Item 1')).toBeInTheDocument();
  });

  it('sends the typed query to the server', async () => {
    const user = userEvent.setup();
    const { fetchPage } = renderCombobox();

    await openCombobox(user);
    await user.type(screen.getByPlaceholderText('Search...'), 'drill');

    await waitFor(() => expect(fetchPage).toHaveBeenCalledWith('drill', 1));
  });

  it('renders whatever the server returned, without re-filtering it', async () => {
    const user = userEvent.setup();
    // The label does not contain the query: a client-side filter would hide it.
    const fetchPage = vi.fn(async () =>
      page([{ id: 'i1', label: 'Cordless screwdriver' }])
    );
    renderCombobox({ fetchPage });

    await openCombobox(user);
    await user.type(screen.getByPlaceholderText('Search...'), 'drill');

    expect(await screen.findByText('Cordless screwdriver')).toBeInTheDocument();
  });

  it('collapses rapid typing into a single request', async () => {
    // `delay: null` dispatches every keystroke without yielding, so all five
    // land inside one debounce window on real timers. (Fake timers would
    // deadlock here: Radix's popover open path awaits real ones.)
    const user = userEvent.setup({ delay: null });
    const fetchPage = vi.fn(async () => page(rows('Item', 1)));
    renderCombobox({ fetchPage, debounceMs: 300 });

    await openCombobox(user);
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(1));
    fetchPage.mockClear();

    await user.type(screen.getByPlaceholderText('Search...'), 'drill');

    await waitFor(() => expect(fetchPage).toHaveBeenCalledWith('drill', 1));
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('drops a stale response that resolves after a newer one', async () => {
    const user = userEvent.setup();
    let resolveFirst: (value: AsyncComboboxPage<Row>) => void = () => {};
    const fetchPage = vi
      .fn<FetchPage>()
      .mockImplementationOnce(
        () =>
          new Promise<AsyncComboboxPage<Row>>((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockImplementationOnce(async () =>
        page([{ id: 'fresh', label: 'Fresh result' }])
      );
    renderCombobox({ fetchPage });

    await openCombobox(user);
    await user.type(screen.getByPlaceholderText('Search...'), 'd');
    expect(await screen.findByText('Fresh result')).toBeInTheDocument();

    // The first (now superseded) request answers last.
    resolveFirst(page([{ id: 'stale', label: 'Stale result' }]));

    await waitFor(() =>
      expect(screen.queryByText('Stale result')).not.toBeInTheDocument()
    );
    expect(screen.getByText('Fresh result')).toBeInTheDocument();
  });

  it('appends the next page when the sentinel comes into view', async () => {
    const user = userEvent.setup();
    const fetchPage = vi.fn(async (_query: string, pageNumber: number) =>
      page(rows('Item', 2, pageNumber === 1 ? 1 : 3), {
        page: pageNumber,
        totalPages: 2,
        totalItems: 4,
      })
    );
    renderCombobox({ fetchPage });

    await openCombobox(user);
    expect(await screen.findByText('Item 1')).toBeInTheDocument();

    triggerSentinel();

    expect(await screen.findByText('Item 3')).toBeInTheDocument();
    // Page 1 is kept, not replaced.
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(fetchPage).toHaveBeenCalledWith('', 2);
  });

  it('stops fetching once the last page is loaded', async () => {
    const user = userEvent.setup();
    const fetchPage = vi.fn(async () =>
      page(rows('Item', 2), { page: 1, totalPages: 1 })
    );
    renderCombobox({ fetchPage });

    await openCombobox(user);
    expect(await screen.findByText('Item 1')).toBeInTheDocument();
    expect(await screen.findByText('End of results')).toBeInTheDocument();

    // No observer is created at all when there is nothing left to load.
    expect(MockIntersectionObserver.instances).toHaveLength(0);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('renders an item returned on two pages only once', async () => {
    const user = userEvent.setup();
    const duplicate = { id: 'dup', label: 'Duplicate item' };
    const fetchPage = vi.fn(async (_query: string, pageNumber: number) =>
      page([duplicate], { page: pageNumber, totalPages: 2, totalItems: 2 })
    );
    renderCombobox({ fetchPage });

    await openCombobox(user);
    expect(await screen.findByText('Duplicate item')).toBeInTheDocument();

    triggerSentinel();

    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2));
    expect(screen.getAllByText('Duplicate item')).toHaveLength(1);
  });

  it('shows the empty message when there are no results', async () => {
    const user = userEvent.setup();
    const fetchPage = vi.fn(async () =>
      page([], { page: 1, totalPages: 0, totalItems: 0 })
    );
    renderCombobox({ fetchPage, emptyMessage: 'No unassigned items' });

    await openCombobox(user);

    expect(await screen.findByText('No unassigned items')).toBeInTheDocument();
  });

  it('keeps loaded pages on failure, offers Retry, and stops auto-loading', async () => {
    const user = userEvent.setup();
    const fetchPage = vi
      .fn<FetchPage>()
      .mockImplementationOnce(async () =>
        page(rows('Item', 2), { page: 1, totalPages: 3, totalItems: 6 })
      )
      .mockImplementationOnce(async () => {
        throw new Error('network down');
      });
    renderCombobox({ fetchPage });

    await openCombobox(user);
    expect(await screen.findByText('Item 1')).toBeInTheDocument();

    triggerSentinel();

    expect(await screen.findByText('Retry')).toBeInTheDocument();
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(fetchPage).toHaveBeenCalledTimes(2);

    // A sentinel that is still on screen must not hammer the server.
    triggerSentinel();
    await waitFor(() => expect(fetchPage).toHaveBeenCalledTimes(2));
  });

  it('reports the selection and closes on select', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const fetchPage = vi.fn(async () => page(rows('Item', 2)));
    renderCombobox({ fetchPage, onChange });

    await openCombobox(user);
    await user.click(await screen.findByText('Item 2'));

    expect(onChange).toHaveBeenCalledWith(
      'Item2',
      expect.objectContaining({ id: 'Item2' })
    );
    await waitFor(() =>
      expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument()
    );
  });

  it('selects the highlighted option with the keyboard', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderCombobox({ onChange });

    await openCombobox(user);
    await screen.findByText('Item 1');
    await user.keyboard('{ArrowDown}{Enter}');

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(onChange.mock.calls[0][0]).toMatch(/^Item/);
  });

  it('shows the caller-supplied label for a selection not present in any page', async () => {
    renderCombobox({ value: 'far-away-id', selectedLabel: 'Cordless drill' });

    expect(screen.getByRole('combobox')).toHaveTextContent('Cordless drill');
  });

  it('clears the query and refetches when reopened', async () => {
    const user = userEvent.setup();
    const { fetchPage } = renderCombobox();

    await openCombobox(user);
    await user.type(screen.getByPlaceholderText('Search...'), 'drill');
    await waitFor(() => expect(fetchPage).toHaveBeenCalledWith('drill', 1));

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument()
    );
    fetchPage.mockClear();

    await openCombobox(user);

    await waitFor(() => expect(fetchPage).toHaveBeenCalledWith('', 1));
    expect(screen.getByPlaceholderText('Search...')).toHaveValue('');
  });

  it('refetches from page 1 when queryKey changes', async () => {
    const user = userEvent.setup();
    const fetchPage = vi.fn(async (_query: string, pageNumber: number) =>
      page(rows('Item', 2), { page: pageNumber, totalPages: 2, totalItems: 4 })
    );
    const { rerender } = renderCombobox({ fetchPage, queryKey: 'unassigned' });

    await openCombobox(user);
    await screen.findByText('Item 1');
    triggerSentinel();
    await waitFor(() => expect(fetchPage).toHaveBeenCalledWith('', 2));
    fetchPage.mockClear();

    rerender(
      <AsyncCombobox<Row>
        onChange={vi.fn()}
        fetchPage={fetchPage}
        getOptionValue={(item) => item.id}
        getOptionLabel={(item) => item.label}
        placeholder="Select an item..."
        debounceMs={0}
        queryKey="assigned"
      />
    );

    await waitFor(() => expect(fetchPage).toHaveBeenCalledWith('', 1));
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('still loads more via the footer when IntersectionObserver is missing', async () => {
    // @ts-expect-error - simulating an environment without the API
    delete window.IntersectionObserver;
    // @ts-expect-error - simulating an environment without the API
    delete global.IntersectionObserver;

    const user = userEvent.setup();
    const fetchPage = vi.fn(async (_query: string, pageNumber: number) =>
      page(rows('Item', 2, pageNumber === 1 ? 1 : 3), {
        page: pageNumber,
        totalPages: 2,
        totalItems: 4,
      })
    );
    renderCombobox({ fetchPage });

    await openCombobox(user);
    await user.click(await screen.findByText('Load more'));

    expect(await screen.findByText('Item 3')).toBeInTheDocument();
    expect(fetchPage).toHaveBeenCalledWith('', 2);
  });
});

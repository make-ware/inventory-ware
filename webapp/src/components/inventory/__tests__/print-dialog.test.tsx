import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  beforeEach,
  afterEach,
} from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Container, Item } from '@project/shared';
import { PrintDialog } from '../print-dialog';
import type { PrintSource } from '@/lib/print-sources';

const getList = vi.fn();
const getOne = vi.fn();

vi.mock('@/lib/pocketbase-client', () => ({
  default: {
    authStore: { token: 'mock-token' },
    collection: () => ({ getList, getOne }),
    files: { getURL: () => 'http://localhost:8090/file.png' },
  },
}));

// Radix Select needs these in happy-dom.
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

const win = {
  close: vi.fn(),
  focus: vi.fn(),
  document: { open: vi.fn(), write: vi.fn(), close: vi.fn() },
};

function makeItem(id: string): Item {
  return {
    id,
    itemLabel: `Item ${id}`,
    itemType: 'drill',
    categoryFunctional: 'tools',
    categorySpecific: 'power-tools',
    created: '2026-01-01T00:00:00Z',
    updated: '2026-01-01T00:00:00Z',
    UserRef: 'u1',
  } as Item;
}

function makeContainer(id: string): Container {
  return {
    id,
    containerLabel: `Container ${id}`,
    containerNotes: '',
    created: '2026-01-01T00:00:00Z',
    updated: '2026-01-01T00:00:00Z',
    UserRef: 'u1',
  } as Container;
}

function itemSource(
  records: Item[] | (() => Promise<Item[]>),
  extra: Partial<PrintSource> = {}
): PrintSource {
  return {
    entity: 'item',
    title: 'Selected items',
    load: typeof records === 'function' ? records : async () => records,
    ...extra,
  } as PrintSource;
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderDialog(source: PrintSource, onOpenChange = vi.fn()) {
  const view = render(
    <PrintDialog open onOpenChange={onOpenChange} source={source} />,
    { wrapper }
  );
  return { ...view, onOpenChange };
}

function openSelect(name: RegExp) {
  fireEvent.pointerDown(screen.getByRole('combobox', { name }), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  });
}

function choose(name: RegExp, option: RegExp) {
  openSelect(name);
  fireEvent.click(screen.getByRole('option', { name: option }));
}

/** The last document written into the print window. */
function writtenHtml() {
  return win.document.write.mock.calls.at(-1)?.[0] as string;
}

function labelResponse(id: string) {
  return {
    ok: true,
    json: async () => ({ svg: `<svg data-id="${id}"></svg>` }),
  };
}

function printButton() {
  return screen.getByRole('button', { name: /^print( \[\d+\])?$/i });
}

function row(name: string) {
  return screen.getByRole('checkbox', { name });
}

async function rowsLoaded(name: string) {
  await waitFor(() => expect(row(name)).toBeVisible());
}

describe('PrintDialog', () => {
  const fetchMock = vi.fn();

  beforeAll(() => {
    global.ResizeObserver = ResizeObserver;
    global.PointerEvent = MockPointerEvent as unknown as typeof PointerEvent;
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  });

  beforeEach(() => {
    getOne.mockReset();
    getList.mockReset();
    getList.mockResolvedValue({
      page: 1,
      perPage: 100,
      totalItems: 0,
      totalPages: 0,
      items: [],
    });
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (_url: string, init: RequestInit) =>
      labelResponse(JSON.parse(init.body as string).targetId)
    );
    vi.stubGlobal('fetch', fetchMock);
    win.close.mockReset();
    win.document.write.mockReset();
    vi.spyOn(window, 'open').mockReturnValue(win as unknown as Window);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('offers every record checked, with the count', async () => {
    renderDialog(itemSource([makeItem('a'), makeItem('b'), makeItem('c')]));

    expect(screen.getByTestId('print-list-loading')).toBeInTheDocument();
    await rowsLoaded('Item a');

    for (const id of ['a', 'b', 'c']) {
      expect(row(`Item ${id}`)).toHaveAttribute('aria-checked', 'true');
    }
    expect(screen.getByText('3 of 3 selected')).toBeVisible();
    expect(printButton()).toHaveTextContent('Print [3]');
    expect(printButton()).toBeEnabled();
    await waitFor(() =>
      expect(screen.getByText('+2 more pages')).toBeVisible()
    );
  });

  it('unchecking a record drops it from the count and the print', async () => {
    const { onOpenChange } = renderDialog(
      itemSource([makeItem('a'), makeItem('b'), makeItem('c')])
    );
    await rowsLoaded('Item b');

    fireEvent.click(row('Item b'));

    expect(row('Item b')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('2 of 3 selected')).toBeVisible();
    expect(printButton()).toHaveTextContent('Print [2]');
    await waitFor(() => expect(screen.getByText('+1 more page')).toBeVisible());

    fireEvent.click(printButton());

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    const html = writtenHtml();
    expect(html.match(/class="page"/g)).toHaveLength(2);
    expect(html).toContain('Item a');
    expect(html).toContain('Item c');
    expect(html).not.toContain('Item b');
    expect(html).toContain('<title>Selected items</title>');
    expect(html).toContain('<dt>Items</dt><dd>2</dd>');
  });

  it('the header checkbox clears and restores the whole list', async () => {
    renderDialog(itemSource([makeItem('a'), makeItem('b')]));
    await rowsLoaded('Item a');
    const all = screen.getByRole('checkbox', { name: 'Select all items' });
    expect(all).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(all);

    expect(screen.getByText('0 of 2 selected')).toBeVisible();
    expect(printButton()).toHaveTextContent('Print');
    expect(printButton()).toBeDisabled();
    expect(screen.getByText('Nothing selected')).toBeVisible();
    expect(row('Item a')).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(row('Item a'));
    expect(all).toHaveAttribute('aria-checked', 'mixed');
    expect(screen.getByText('1 of 2 selected')).toBeVisible();

    fireEvent.click(all);
    expect(screen.getByText('2 of 2 selected')).toBeVisible();
    expect(printButton()).toBeEnabled();
  });

  it('says so when the source has nothing', async () => {
    renderDialog(itemSource([]));

    await waitFor(() =>
      expect(screen.getByText('No items to print')).toBeVisible()
    );
    expect(screen.getByText('0 of 0 selected')).toBeVisible();
    expect(screen.getByText('Nothing to print')).toBeVisible();
    expect(printButton()).toBeDisabled();
  });

  it('offers a retry when the source fails', async () => {
    const load = vi
      .fn<() => Promise<Item[]>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([makeItem('a')]);
    renderDialog(itemSource(load));

    await waitFor(() =>
      expect(screen.getByText('Couldn’t load items')).toBeVisible()
    );
    expect(printButton()).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /retry/i }));

    await rowsLoaded('Item a');
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.getByText('1 of 1 selected')).toBeVisible();
  });

  it('shows Format only for labels', async () => {
    renderDialog(itemSource([makeItem('a')]));
    await rowsLoaded('Item a');

    expect(screen.queryByRole('combobox', { name: /format/i })).toBeNull();
    choose(/what/i, /^labels$/i);
    expect(screen.getByRole('combobox', { name: /format/i })).toHaveTextContent(
      'Shipping 4×6 in'
    );
    choose(/what/i, /summary/i);
    expect(screen.queryByRole('combobox', { name: /format/i })).toBeNull();
  });

  it('prints one label per checked record, for the source’s entity, as a single job', async () => {
    const { onOpenChange } = renderDialog({
      entity: 'container',
      load: async () => [
        makeContainer('a'),
        makeContainer('b'),
        makeContainer('c'),
      ],
    });
    await rowsLoaded('Container a');
    choose(/what/i, /^labels$/i);

    // The preview renders the first checked target's label.
    await waitFor(() =>
      expect(screen.getByTestId('label-preview').innerHTML).toContain(
        'data-id="a"'
      )
    );
    expect(screen.getByText('+2 more labels')).toBeVisible();

    fireEvent.click(row('Container a'));
    await waitFor(() =>
      expect(screen.getByTestId('label-preview').innerHTML).toContain(
        'data-id="b"'
      )
    );
    expect(screen.getByText('+1 more label')).toBeVisible();
    fetchMock.mockClear();

    fireEvent.click(printButton());

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [index, id] of ['b', 'c'].entries()) {
      const [url, init] = fetchMock.mock.calls[index];
      expect(url).toBe('/api-next/labels/generate');
      expect(init.headers.Authorization).toBe('Bearer mock-token');
      expect(JSON.parse(init.body)).toEqual({
        targetId: id,
        targetType: 'container',
        format: 'shipping-4x6',
      });
    }
    const html = writtenHtml();
    expect(html.match(/class="label"/g)).toHaveLength(2);
    expect(html).toContain('size: 4in 6in');
  });

  it('stops at the first failed label and closes the window', async () => {
    const { onOpenChange } = renderDialog(
      itemSource([makeItem('a'), makeItem('b'), makeItem('c')])
    );
    await rowsLoaded('Item a');
    choose(/what/i, /^labels$/i);
    await waitFor(() =>
      expect(screen.getByTestId('label-preview')).toBeVisible()
    );

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(labelResponse('a')).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'boom' }),
    });

    fireEvent.click(printButton());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Failed to generate label (500): boom'
      )
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(win.close).toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('reports a blocked pop-up', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    renderDialog(itemSource([makeItem('a')]));
    await rowsLoaded('Item a');
    choose(/what/i, /^labels$/i);

    fireEvent.click(printButton());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/Pop-up blocked/)
      )
    );
  });

  it('re-runs the source and forgets its choices when reopened', async () => {
    const load = vi.fn(async () => [makeItem('a'), makeItem('b')]);
    const source = itemSource(load);
    const { rerender } = renderDialog(source);
    await rowsLoaded('Item a');
    fireEvent.click(row('Item b'));
    choose(/what/i, /^labels$/i);
    expect(screen.getByText('1 of 2 selected')).toBeVisible();

    rerender(
      <PrintDialog open={false} onOpenChange={vi.fn()} source={source} />
    );
    rerender(<PrintDialog open onOpenChange={vi.fn()} source={source} />);

    await rowsLoaded('Item b');
    expect(load).toHaveBeenCalledTimes(2);
    expect(screen.getByText('2 of 2 selected')).toBeVisible();
    expect(screen.queryByRole('combobox', { name: /format/i })).toBeNull();
  });
});

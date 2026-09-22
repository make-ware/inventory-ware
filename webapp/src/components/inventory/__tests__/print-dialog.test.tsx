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
import { PrintDialog } from '../print-dialog';
import type { ExportFilteredOptions } from '@/hooks/use-item-pdf-export';

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

function makeItem(id: string) {
  return {
    id,
    itemLabel: `Item ${id}`,
    itemType: 'drill',
    categoryFunctional: 'tools',
    categorySpecific: 'power-tools',
    created: '2026-01-01T00:00:00Z',
    updated: '2026-01-01T00:00:00Z',
    UserRef: 'u1',
  };
}

const filteredQuery: ExportFilteredOptions = {
  userId: 'u1',
  q: '',
  filters: {},
  sort: '-created',
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderDialog(selectedIds: string[], onOpenChange = vi.fn()) {
  render(
    <PrintDialog
      open
      onOpenChange={onOpenChange}
      entity="items"
      selectedIds={selectedIds}
      filteredQuery={filteredQuery}
    />,
    { wrapper }
  );
  return { onOpenChange };
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
  return screen.getByRole('button', { name: /^print$/i });
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
    getOne.mockImplementation(async (id: string) => makeItem(id));
    getList.mockReset();
    getList.mockResolvedValue({
      page: 1,
      perPage: 1,
      totalItems: 4,
      totalPages: 4,
      items: [makeItem('f1')],
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

  it('preselects the selection when there is one', async () => {
    renderDialog(['a', 'b']);

    expect(
      screen.getByRole('combobox', { name: /applies to/i })
    ).toHaveTextContent('Selected (2)');
    expect(printButton()).toBeEnabled();
    await waitFor(() => expect(screen.getByText('+1 more page')).toBeVisible());
  });

  it('falls back to the filtered set, with Selected disabled, when nothing is selected', async () => {
    renderDialog([]);

    expect(
      screen.getByRole('combobox', { name: /applies to/i })
    ).toHaveTextContent('Filtered set');
    expect(printButton()).toBeEnabled();

    openSelect(/applies to/i);
    expect(
      screen.getByRole('option', { name: 'Selected (0)' })
    ).toHaveAttribute('aria-disabled', 'true');
    await waitFor(() =>
      expect(screen.getByText('+3 more pages')).toBeVisible()
    );
  });

  it('disables Print with a hint when Selected is chosen with nothing selected', async () => {
    const { rerender } = render(
      <PrintDialog
        open
        onOpenChange={vi.fn()}
        entity="items"
        selectedIds={['a']}
        filteredQuery={filteredQuery}
      />,
      { wrapper }
    );
    // The selection is cleared while the dialog is open on "Selected".
    rerender(
      <PrintDialog
        open
        onOpenChange={vi.fn()}
        entity="items"
        selectedIds={[]}
        filteredQuery={filteredQuery}
      />
    );

    expect(printButton()).toBeDisabled();
    expect(screen.getByText('Select items first')).toBeVisible();
  });

  it('shows Format only for labels', async () => {
    renderDialog(['a']);

    expect(screen.queryByRole('combobox', { name: /format/i })).toBeNull();
    choose(/what/i, /^labels$/i);
    expect(screen.getByRole('combobox', { name: /format/i })).toHaveTextContent(
      'Shipping 4×6 in'
    );
    choose(/what/i, /summary/i);
    expect(screen.queryByRole('combobox', { name: /format/i })).toBeNull();
  });

  it('prints one label per selected item as a single job', async () => {
    const { onOpenChange } = renderDialog(['a', 'b', 'c']);
    choose(/what/i, /^labels$/i);

    // The preview renders the first target's label.
    await waitFor(() =>
      expect(screen.getByTestId('label-preview').innerHTML).toContain(
        'data-id="a"'
      )
    );
    expect(screen.getByText('+2 more labels')).toBeVisible();
    fetchMock.mockClear();

    fireEvent.click(printButton());

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const [index, id] of ['a', 'b', 'c'].entries()) {
      const [url, init] = fetchMock.mock.calls[index];
      expect(url).toBe('/api-next/labels/generate');
      expect(init.headers.Authorization).toBe('Bearer mock-token');
      expect(JSON.parse(init.body)).toEqual({
        targetId: id,
        targetType: 'item',
        format: 'shipping-4x6',
      });
    }
    const html = writtenHtml();
    expect(html.match(/class="label"/g)).toHaveLength(3);
    expect(html).toContain('size: 4in 6in');
  });

  it('stops at the first failed label and closes the window', async () => {
    const { onOpenChange } = renderDialog(['a', 'b', 'c']);
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
    renderDialog(['a']);
    choose(/what/i, /^labels$/i);

    fireEvent.click(printButton());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/Pop-up blocked/)
      )
    );
  });

  it('prints a summary page per selected item', async () => {
    const { onOpenChange } = renderDialog(['a', 'b']);

    fireEvent.click(printButton());

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(getOne).toHaveBeenCalledWith('a', expect.anything());
    expect(getOne).toHaveBeenCalledWith('b', expect.anything());
    const html = writtenHtml();
    expect(html.match(/class="item-page"/g)).toHaveLength(2);
    expect(html).toContain('Selected items (2)');
  });
});

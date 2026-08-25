import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateLabel } from '../label-generator';
import { estimateTextWidth } from '../svg-text';
import type { TypedPocketBase } from '@project/shared';

const FIXED_LABEL_ID = 'testlabelid1234';

const mockItemGetById = vi.fn();
const mockContainerGetById = vi.fn();
const mockLabelCreate = vi.fn();

vi.mock('qrcode', () => ({
  default: {
    toString: vi.fn(
      async () => '<svg xmlns="http://www.w3.org/2000/svg">QR</svg>'
    ),
  },
}));

vi.mock('@project/shared', () => ({
  ItemMutator: class {
    getById = mockItemGetById;
  },
  ContainerMutator: class {
    getById = mockContainerGetById;
  },
  LabelMutator: class {
    create = mockLabelCreate;
  },
  generateLabelId: () => FIXED_LABEL_ID,
}));

const pb = {} as TypedPocketBase;

/** Extract every tspan with its attributes and content. */
function tspans(
  svg: string
): { x: number; y: number; textLength?: number; content: string }[] {
  return Array.from(
    svg.matchAll(/<tspan ([^>]*)>([^<]*)<\/tspan>/g),
    ([, attrs, content]) => {
      const attr = (name: string): string | undefined =>
        attrs.match(new RegExp(`${name}="([^"]*)"`))?.[1];
      return {
        x: Number(attr('x')),
        y: Number(attr('y')),
        textLength: attr('textLength') ? Number(attr('textLength')) : undefined,
        content,
      };
    }
  );
}

describe('generateLabel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockItemGetById.mockResolvedValue({
      id: 'item0123456789a',
      itemLabel: '',
      itemName: 'Small Cylindrical Connector Piece Yellow Duplo-Style',
    });
    mockContainerGetById.mockResolvedValue({
      id: 'cont0123456789a',
      containerLabel: 'Garage shelf',
    });
    mockLabelCreate.mockImplementation(async (input) => ({ ...input }));
  });

  describe('shipping-4x6', () => {
    it('keeps a long name inside the frame across at most two clamped lines', async () => {
      const { svg } = await generateLabel({
        targetId: 'item0123456789a',
        targetType: 'item',
        format: 'shipping-4x6',
        pb,
      });

      const nameLines = tspans(svg).filter((t) => t.y === 355 || t.y === 381);
      expect(nameLines.length).toBeGreaterThanOrEqual(1);
      expect(nameLines.length).toBeLessThanOrEqual(2);
      for (const line of nameLines) {
        expect(line.x).toBe(200);
        const fits =
          estimateTextWidth(line.content, 20, true) <= 360 ||
          line.textLength === 360;
        expect(fits, `"${line.content}" must fit 360 or be clamped`).toBe(true);
      }
      // Every tspan sits inside the border rect (10..390 x 10..590).
      for (const t of tspans(svg)) {
        expect(t.x).toBeGreaterThanOrEqual(10);
        expect(t.x).toBeLessThanOrEqual(390);
        expect(t.y).toBeGreaterThanOrEqual(10);
        expect(t.y).toBeLessThanOrEqual(590);
      }
    });

    it('keeps layout positions identical for short and very long names', async () => {
      const render = async (name: string) => {
        mockItemGetById.mockResolvedValue({
          id: 'item0123456789a',
          itemName: name,
        });
        const { svg } = await generateLabel({
          targetId: 'item0123456789a',
          targetType: 'item',
          format: 'shipping-4x6',
          pb,
        });
        return tspans(svg);
      };

      const short = await render('Bolt');
      const long = await render('word '.repeat(40).trim());

      // First name line, sub-text line, and Label ID line stay at fixed slots.
      const ys = (ts: ReturnType<typeof tspans>) => [
        ts[0].y,
        ...ts.filter((t) => t.y >= 400).map((t) => t.y),
      ];
      expect(ys(long)).toEqual(ys(short));
      expect(short.some((t) => t.y === 410)).toBe(true);
      expect(short.some((t) => t.y === 550)).toBe(true);
    });
  });

  describe('address-30x100', () => {
    it('renders one ellipsized name line starting at x=120', async () => {
      const { svg } = await generateLabel({
        targetId: 'item0123456789a',
        targetType: 'item',
        format: 'address-30x100',
        pb,
      });

      const nameLines = tspans(svg).filter((t) => t.y === 40);
      expect(nameLines).toHaveLength(1);
      const [name] = nameLines;
      expect(name.x).toBe(120);
      expect(name.content.endsWith('…')).toBe(true);
      const fits =
        estimateTextWidth(name.content, 24, true) <= 270 ||
        name.textLength === 270;
      expect(fits).toBe(true);
    });

    it('handles emoji names without emitting lone surrogates', async () => {
      mockItemGetById.mockResolvedValue({
        id: 'item0123456789a',
        itemName: '📦'.repeat(30),
      });
      const { svg } = await generateLabel({
        targetId: 'item0123456789a',
        targetType: 'item',
        format: 'address-30x100',
        pb,
      });
      expect(svg).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
      expect(svg).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    });
  });

  it('escapes XML metacharacters in names', async () => {
    mockItemGetById.mockResolvedValue({
      id: 'item0123456789a',
      itemName: 'A & B <C>',
    });
    const { svg } = await generateLabel({
      targetId: 'item0123456789a',
      targetType: 'item',
      format: 'shipping-4x6',
      pb,
    });
    expect(svg).toContain('A &amp; B &lt;C&gt;');
    expect(svg).not.toContain('<C>');
  });

  it('returns the bare QR svg for qr-only', async () => {
    const { svg } = await generateLabel({
      targetId: 'cont0123456789a',
      targetType: 'container',
      format: 'qr-only',
      pb,
    });
    expect(svg).toBe('<svg xmlns="http://www.w3.org/2000/svg">QR</svg>');
  });

  it('stores the rendered SVG on the label record with the embedded id', async () => {
    const result = await generateLabel({
      targetId: 'item0123456789a',
      targetType: 'item',
      format: 'shipping-4x6',
      pb,
    });

    expect(mockLabelCreate).toHaveBeenCalledTimes(1);
    const input = mockLabelCreate.mock.calls[0][0];
    expect(input.id).toBe(FIXED_LABEL_ID);
    expect(input.data).toBe(result.svg);
    expect(input.format).toBe('shipping-4x6');
    expect(input.ItemRef).toBe('item0123456789a');
    expect(input.ContainerRef).toBeUndefined();
    expect(result.labelId).toBe(FIXED_LABEL_ID);
    expect(result.svg).toContain(`Label ID: ${FIXED_LABEL_ID}`);
  });

  it('links ContainerRef for container targets', async () => {
    await generateLabel({
      targetId: 'cont0123456789a',
      targetType: 'container',
      format: 'address-30x100',
      pb,
    });
    const input = mockLabelCreate.mock.calls[0][0];
    expect(input.ContainerRef).toBe('cont0123456789a');
    expect(input.ItemRef).toBeUndefined();
  });
});

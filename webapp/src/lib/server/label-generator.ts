import QRCode from 'qrcode';
import type { TypedPocketBase } from '@project/shared';
import {
  ItemMutator,
  ContainerMutator,
  LabelMutator,
  generateLabelId,
} from '@project/shared';
import { escapeXml, fitTextLines, renderTextElement } from './svg-text';

interface GenerateLabelOptions {
  targetId: string;
  targetType: 'item' | 'container';
  format: string;
  pb: TypedPocketBase;
}

interface GenerateLabelResult {
  svg: string;
  labelId: string;
}

export async function generateLabel({
  targetId,
  targetType,
  format,
  pb,
}: GenerateLabelOptions): Promise<GenerateLabelResult> {
  // 1. Fetch target data
  const itemMutator = new ItemMutator(pb);
  const containerMutator = new ContainerMutator(pb);

  let rawLabelText = '';
  let subText = '';
  if (targetType === 'item') {
    const item = await itemMutator.getById(targetId);
    if (!item) throw new Error('Item not found');
    rawLabelText = item.itemLabel || item.itemName || 'Item';
    subText = item.id;
  } else {
    const container = await containerMutator.getById(targetId);
    if (!container) throw new Error('Container not found');
    rawLabelText = container.containerLabel || 'Container';
    subText = container.id;
  }

  // 2. Pre-generate the record id. Labels are immutable (updateRule: null),
  // and the rendered SVG embeds its own record id, so the id must exist
  // before rendering and the record is created afterwards in one shot.
  const labelId = generateLabelId();

  // 3. Generate QR Code
  // The QR code content will point to the webapp URL for this object
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const qrContent = `${appUrl}/inventory/${targetType}s/${targetId}`;

  const qrSvg = await QRCode.toString(qrContent, {
    type: 'svg',
    margin: 1,
    width: 200,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  });

  // 4. Generate full label SVG based on format.
  // Every text run goes through fitTextLines/renderTextElement, which wrap,
  // ellipsize and hard-clamp (SVG textLength) so no input string can escape
  // the fixed viewBox.
  let fullSvg = '';

  if (format === 'shipping-4x6') {
    // 4" x 6" label. viewBox 0 0 400 600; border rect spans 10..390 x 10..590.
    const nameText = renderTextElement(
      fitTextLines(rawLabelText, {
        maxWidth: 360,
        fontSize: 20,
        bold: true,
        maxLines: 2,
      }),
      {
        x: 200,
        yPositions: [355, 381],
        fontSize: 20,
        bold: true,
        anchor: 'middle',
      }
    );
    const subTextEl = renderTextElement(
      fitTextLines(subText, { maxWidth: 360, fontSize: 14 }),
      {
        x: 200,
        yPositions: [410],
        fontSize: 14,
        anchor: 'middle',
        fill: '#666',
      }
    );
    const labelIdEl = renderTextElement(
      fitTextLines(`Label ID: ${labelId}`, { maxWidth: 360, fontSize: 12 }),
      { x: 200, yPositions: [550], fontSize: 12, anchor: 'middle' }
    );
    fullSvg = `
       <svg viewBox="0 0 400 600" xmlns="http://www.w3.org/2000/svg" style="background: white;">
         <rect x="10" y="10" width="380" height="580" fill="none" stroke="black" stroke-width="2"/>
         <text x="200" y="50" font-family="Arial, sans-serif" font-size="24" text-anchor="middle" font-weight="bold">INVENTORY LABEL</text>
         <text x="200" y="90" font-family="Arial, sans-serif" font-size="18" text-anchor="middle">${escapeXml(targetType.toUpperCase())}</text>

         <g transform="translate(100, 120)">
           ${qrSvg.replace('<svg', '<svg width="200" height="200"')}
         </g>

         ${nameText}
         ${subTextEl}
         ${labelIdEl}
       </svg>
     `;
  } else if (format === 'address-30x100') {
    // 30mm x 100mm. viewBox 0 0 400 120; QR occupies 10..110, text starts at
    // x=120 with a 10-unit right margin (maxWidth 270).
    const nameText = renderTextElement(
      fitTextLines(rawLabelText, { maxWidth: 270, fontSize: 24, bold: true }),
      { x: 120, yPositions: [40], fontSize: 24, bold: true }
    );
    const subTextEl = renderTextElement(
      fitTextLines(subText, { maxWidth: 270, fontSize: 16 }),
      { x: 120, yPositions: [70], fontSize: 16, fill: '#666' }
    );
    const labelIdEl = renderTextElement(
      fitTextLines(`ID: ${labelId}`, { maxWidth: 270, fontSize: 10 }),
      { x: 120, yPositions: [100], fontSize: 10 }
    );
    fullSvg = `
       <svg viewBox="0 0 400 120" xmlns="http://www.w3.org/2000/svg" style="background: white;">
         <g transform="translate(10, 10)">
           ${qrSvg.replace('<svg', '<svg width="100" height="100"')}
         </g>
         ${nameText}
         ${subTextEl}
         ${labelIdEl}
       </svg>
     `;
  } else {
    // QR Only
    fullSvg = qrSvg;
  }

  // 5. Create the Label record last, storing the rendered SVG. A failure here
  // propagates to the route's 500 handler with no record written.
  const labelMutator = new LabelMutator(pb);
  const labelRecord = await labelMutator.create({
    id: labelId,
    ItemRef: targetType === 'item' ? targetId : undefined,
    ContainerRef: targetType === 'container' ? targetId : undefined,
    format: format,
    data: fullSvg,
  });

  return {
    svg: fullSvg,
    labelId: labelRecord.id,
  };
}

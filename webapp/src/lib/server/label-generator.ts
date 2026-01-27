import QRCode from 'qrcode';
import type { TypedPocketBase } from '@project/shared';
import { ItemMutator, ContainerMutator } from '@project/shared';

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

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

export async function generateLabel({ targetId, targetType, format, pb }: GenerateLabelOptions): Promise<GenerateLabelResult> {
  // 1. Fetch target data
  const itemMutator = new ItemMutator(pb);
  const containerMutator = new ContainerMutator(pb);
  let labelText = '';
  let subText = '';

  let rawLabelText = '';
  if (targetType === 'item') {
    const item = await itemMutator.getById(targetId);
    if (!item) throw new Error('Item not found');
    rawLabelText = item.itemLabel || item.itemName || 'Item';
    subText = escapeXml(item.id);
  } else {
    const container = await containerMutator.getById(targetId);
    if (!container) throw new Error('Container not found');
    rawLabelText = container.containerLabel || 'Container';
    subText = escapeXml(container.id);
  }
  labelText = escapeXml(rawLabelText);

  // 2. Create Label record
  const labelRecord = await pb.collection('Labels').create({
    type: targetType,
    item: targetType === 'item' ? targetId : undefined,
    container: targetType === 'container' ? targetId : undefined,
    format: format,
    data: { generated: new Date().toISOString() }
  });

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
      light: '#ffffff'
    }
  });

  // 4. Generate full label SVG based on format
  // This is a simple template engine
  let fullSvg = '';

  if (format === 'shipping-4x6') {
     // 4" x 6" label (approx 384x576 px at 96dpi, or use mm)
     // We'll use a viewBox for scaling
     fullSvg = `
       <svg viewBox="0 0 400 600" xmlns="http://www.w3.org/2000/svg" style="background: white;">
         <rect x="10" y="10" width="380" height="580" fill="none" stroke="black" stroke-width="2"/>
         <text x="200" y="50" font-family="Arial, sans-serif" font-size="24" text-anchor="middle" font-weight="bold">INVENTORY LABEL</text>
         <text x="200" y="90" font-family="Arial, sans-serif" font-size="18" text-anchor="middle">${targetType.toUpperCase()}</text>

         <g transform="translate(100, 120)">
           ${qrSvg.replace('<svg', '<svg width="200" height="200"')}
         </g>

         <text x="200" y="360" font-family="Arial, sans-serif" font-size="20" text-anchor="middle" font-weight="bold">${labelText}</text>
         <text x="200" y="390" font-family="Arial, sans-serif" font-size="14" text-anchor="middle" fill="#666">${subText}</text>
         <text x="200" y="550" font-family="Arial, sans-serif" font-size="12" text-anchor="middle">Label ID: ${labelRecord.id}</text>
       </svg>
     `;
  } else if (format === 'address-30x100') {
     // 30mm x 100mm
     // Truncate before escaping to avoid cutting entities
     const shortLabel = escapeXml(rawLabelText.substring(0, 15));
     fullSvg = `
       <svg viewBox="0 0 400 120" xmlns="http://www.w3.org/2000/svg" style="background: white;">
         <g transform="translate(10, 10)">
           ${qrSvg.replace('<svg', '<svg width="100" height="100"')}
         </g>
         <text x="120" y="40" font-family="Arial, sans-serif" font-size="24" font-weight="bold">${shortLabel}</text>
         <text x="120" y="70" font-family="Arial, sans-serif" font-size="16" fill="#666">${subText}</text>
         <text x="120" y="100" font-family="Arial, sans-serif" font-size="10">ID: ${labelRecord.id}</text>
       </svg>
     `;
  } else {
    // QR Only
    fullSvg = qrSvg;
  }

  return {
    svg: fullSvg,
    labelId: labelRecord.id
  };
}

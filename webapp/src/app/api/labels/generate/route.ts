import { NextRequest, NextResponse } from 'next/server';
import { createServerPocketBaseClient, authenticateAsUser } from '@/lib/pocketbase-server';
import { generateLabel } from '@/lib/server/label-generator';
import { z } from 'zod';

const requestSchema = z.object({
  targetId: z.string(),
  targetType: z.enum(['item', 'container']),
  format: z.string(),
});

export async function POST(req: NextRequest) {
  const pb = createServerPocketBaseClient();

  try {
    await authenticateAsUser(pb, req);
  } catch (e) {
    console.error('Authentication failed in label generator:', e);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { targetId, targetType, format } = requestSchema.parse(body);

    const result = await generateLabel({
      targetId,
      targetType,
      format,
      pb
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Label generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

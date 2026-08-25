import { NextRequest, NextResponse } from 'next/server';
import {
  createServerPocketBaseClient,
  authenticateAsUser,
} from '@/lib/pocketbase-server';
import { generateLabel } from '@/lib/server/label-generator';
import { createLogger, errorMessage } from '@/lib/logger';
import { z } from 'zod';

const log = createLogger('api-next/labels/generate');

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
    log.warn('authentication failed', { reason: errorMessage(e) });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { targetId, targetType, format } = requestSchema.parse(body);

    const result = await generateLabel({
      targetId,
      targetType,
      format,
      pb,
    });

    log.info('label generated', { targetId, targetType, format });

    return NextResponse.json(result);
  } catch (error) {
    log.error('label generation failed', { err: error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

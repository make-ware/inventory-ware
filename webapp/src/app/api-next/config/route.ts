import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const isAIEnabled = !!process.env.OPENAI_API_KEY;

  return NextResponse.json({
    isAIEnabled,
  });
}

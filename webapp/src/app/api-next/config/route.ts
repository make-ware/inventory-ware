import { NextResponse } from 'next/server';
import { getAIConfig } from '@/services/ai-config';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = getAIConfig();

  // `isAIEnabled` stays top-level and keeps its meaning for existing clients.
  // Deriving it from the resolver rather than from OPENAI_API_KEY is what lets
  // a Gemini-only deployment report AI as available.
  // The API key and base URL are deliberately never exposed: this route is
  // unauthenticated, and a proxy base URL can embed credentials.
  return NextResponse.json({
    isAIEnabled: config.configured,
    provider: config.provider,
    model: config.model,
  });
}

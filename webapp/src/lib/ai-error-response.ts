import { NextResponse } from 'next/server';
import { AIConfigError } from '@/services/ai-config';

/**
 * Map an AI configuration failure to an HTTP response.
 *
 * Returns null for anything else so callers fall through to their existing
 * error handling.
 *
 * 503 rather than 500: the request is well-formed and the server is healthy,
 * but an optional feature has not been configured by the operator.
 */
export function aiConfigErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof AIConfigError)) return null;

  return NextResponse.json(
    { error: error.message, code: error.code },
    { status: 503 }
  );
}

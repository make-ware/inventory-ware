import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const {
  createInventoryService,
  authenticateAsUser,
  createServerPocketBaseClient,
} = vi.hoisted(() => ({
  createInventoryService: vi.fn(),
  authenticateAsUser: vi.fn(),
  createServerPocketBaseClient: vi.fn(),
}));

vi.mock('@/services/inventory', () => ({ createInventoryService }));
vi.mock('@/lib/pocketbase-server', () => ({
  createServerPocketBaseClient,
  authenticateAsUser,
}));

import { NextRequest } from 'next/server';
import { AIConfigError, resetAIConfigCache } from '@/services/ai-config';

const AI_ENV_VARS = [
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'OPENAI_MODEL',
  'OPENAI_BASE_URL',
  'AI_PROVIDER',
  'AI_MODEL',
  'AI_BASE_URL',
];

beforeEach(() => {
  vi.clearAllMocks();
  resetAIConfigCache();
  for (const key of AI_ENV_VARS) vi.stubEnv(key, '');
  createServerPocketBaseClient.mockReturnValue({
    authStore: { record: { id: 'user-1' }, token: 't' },
  });
  authenticateAsUser.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetAIConfigCache();
});

const analyzeRequest = () =>
  new NextRequest('http://localhost:3000/api-next/analyze-image', {
    method: 'POST',
    body: JSON.stringify({ imageId: 'img-1' }),
    headers: { 'content-type': 'application/json' },
  });

describe('AI route error mapping', () => {
  it('returns 503 with a machine-readable code when the provider is unconfigured', async () => {
    createInventoryService.mockReturnValue({
      processExistingImage: vi
        .fn()
        .mockRejectedValue(new AIConfigError('google')),
    });
    const { POST } = await import('@/app/api-next/analyze-image/route');

    const response = await POST(analyzeRequest());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.code).toBe('AI_NOT_CONFIGURED');
    expect(body.error).toContain('GEMINI_API_KEY');
    expect(typeof body.error).toBe('string');
  });

  it('still returns 500 for unrelated failures', async () => {
    createInventoryService.mockReturnValue({
      processExistingImage: vi
        .fn()
        .mockRejectedValue(new Error('disk on fire')),
    });
    const { POST } = await import('@/app/api-next/analyze-image/route');

    const response = await POST(analyzeRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe('disk on fire');
    expect(body.code).toBeUndefined();
  });
});

describe('GET /api-next/config', () => {
  async function getConfig() {
    vi.resetModules();
    const { GET } = await import('@/app/api-next/config/route');
    return (await GET()).json();
  }

  it('reports AI as enabled for a Gemini-only deployment', async () => {
    // Previously hardcoded to !!OPENAI_API_KEY, which disabled the UI toggle
    // for anyone running Gemini.
    vi.stubEnv('GEMINI_API_KEY', 'g-test');

    const body = await getConfig();

    expect(body.isAIEnabled).toBe(true);
    expect(body.provider).toBe('google');
  });

  it('reports AI as enabled for a legacy OpenAI deployment', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');

    const body = await getConfig();

    expect(body.isAIEnabled).toBe(true);
    expect(body.provider).toBe('openai');
  });

  it('reports AI as disabled when no key is configured', async () => {
    const body = await getConfig();

    expect(body.isAIEnabled).toBe(false);
  });

  it('never leaks the API key or base URL', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-super-secret');
    vi.stubEnv('AI_BASE_URL', 'https://user:pass@proxy.local/v1');

    const body = await getConfig();

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('sk-super-secret');
    expect(serialized).not.toContain('proxy.local');
  });
});

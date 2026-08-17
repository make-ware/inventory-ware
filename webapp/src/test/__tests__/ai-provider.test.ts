import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { openaiModelFactory, googleModelFactory, createOpenAI, createGoogle } =
  vi.hoisted(() => {
    const openaiModelFactory = vi.fn((id: string) => ({
      vendor: 'openai',
      modelId: id,
    }));
    const googleModelFactory = vi.fn((id: string) => ({
      vendor: 'google',
      modelId: id,
    }));
    type Settings = { apiKey: string; baseURL?: string };
    return {
      openaiModelFactory,
      googleModelFactory,
      createOpenAI: vi.fn((_settings: Settings) => openaiModelFactory),
      createGoogle: vi.fn((_settings: Settings) => googleModelFactory),
    };
  });

vi.mock('@ai-sdk/openai', () => ({ createOpenAI }));
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: createGoogle }));

import {
  getLanguageModel,
  resetLanguageModelCache,
} from '@/services/ai-provider';
import {
  resetAIConfigCache,
  AIConfigError,
  DEFAULT_MODELS,
} from '@/services/ai-config';

/** Both module-level memos must be cleared for env changes to take effect. */
function reset() {
  resetLanguageModelCache();
  resetAIConfigCache();
  vi.clearAllMocks();
}

beforeEach(() => {
  reset();
  // The real env may carry a key from the developer's shell; start from nothing.
  vi.stubEnv('OPENAI_API_KEY', '');
  vi.stubEnv('GEMINI_API_KEY', '');
  vi.stubEnv('GOOGLE_GENERATIVE_AI_API_KEY', '');
  vi.stubEnv('OPENAI_MODEL', '');
  vi.stubEnv('OPENAI_BASE_URL', '');
  vi.stubEnv('AI_PROVIDER', '');
  vi.stubEnv('AI_MODEL', '');
  vi.stubEnv('AI_BASE_URL', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  reset();
});

describe('getLanguageModel', () => {
  it('builds an OpenAI client and never touches the Google SDK', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');

    const model = getLanguageModel();

    expect(createOpenAI).toHaveBeenCalledOnce();
    expect(createGoogle).not.toHaveBeenCalled();
    expect(model).toMatchObject({
      vendor: 'openai',
      modelId: DEFAULT_MODELS.openai,
    });
  });

  it('builds a Google client when a Gemini key is the only one present', () => {
    vi.stubEnv('GEMINI_API_KEY', 'g-test');

    const model = getLanguageModel();

    expect(createGoogle).toHaveBeenCalledOnce();
    expect(createOpenAI).not.toHaveBeenCalled();
    expect(model).toMatchObject({
      vendor: 'google',
      modelId: DEFAULT_MODELS.google,
    });
  });

  it('omits baseURL entirely rather than passing undefined', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');

    getLanguageModel();

    const settings = createOpenAI.mock.calls[0][0];
    expect(settings).toEqual({ apiKey: 'sk-test' });
    expect('baseURL' in settings).toBe(false);
  });

  it('passes a configured base URL through to the client', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');
    vi.stubEnv('AI_BASE_URL', 'https://proxy.local/v1');

    getLanguageModel();

    expect(createOpenAI).toHaveBeenCalledWith({
      apiKey: 'sk-test',
      baseURL: 'https://proxy.local/v1',
    });
  });

  it('passes the resolved model id to the client factory', () => {
    vi.stubEnv('GEMINI_API_KEY', 'g-test');
    vi.stubEnv('AI_MODEL', 'gemini-2.5-pro');

    getLanguageModel();

    expect(googleModelFactory).toHaveBeenCalledWith('gemini-2.5-pro');
  });

  it('constructs the client once across repeated calls', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test');

    getLanguageModel();
    getLanguageModel();
    getLanguageModel();

    expect(createOpenAI).toHaveBeenCalledOnce();
    expect(openaiModelFactory).toHaveBeenCalledOnce();
  });

  it('throws AIConfigError and builds no client when no key is configured', () => {
    expect(() => getLanguageModel()).toThrow(AIConfigError);
    expect(createOpenAI).not.toHaveBeenCalled();
    expect(createGoogle).not.toHaveBeenCalled();
  });

  it('reports the provider the operator selected in the error', () => {
    vi.stubEnv('AI_PROVIDER', 'gemini');

    expect(() => getLanguageModel()).toThrow(/GEMINI_API_KEY/);
  });
});

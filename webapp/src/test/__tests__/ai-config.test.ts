import { describe, it, expect } from 'vitest';
import {
  resolveAIConfig,
  DEFAULT_MODELS,
  AIConfigError,
} from '@/services/ai-config';

/**
 * `resolveAIConfig` is pure and takes the env as an argument, so these tests
 * never touch `process.env`.
 */
const env = (vars: Record<string, string>): NodeJS.ProcessEnv =>
  vars as NodeJS.ProcessEnv;

describe('resolveAIConfig', () => {
  describe('backward compatibility', () => {
    it('keeps an OPENAI_API_KEY-only deployment working unchanged', () => {
      const config = resolveAIConfig(env({ OPENAI_API_KEY: 'sk-test' }));

      expect(config.configured).toBe(true);
      expect(config.provider).toBe('openai');
      expect(config.model).toBe(DEFAULT_MODELS.openai);
      expect(config.warnings).toEqual([]);
    });

    it('still honours the legacy OPENAI_MODEL', () => {
      const config = resolveAIConfig(
        env({ OPENAI_API_KEY: 'sk-test', OPENAI_MODEL: 'gpt-4o' })
      );

      expect(config.model).toBe('gpt-4o');
      expect(config.warnings).toEqual([]);
    });

    it('still honours the legacy OPENAI_BASE_URL', () => {
      const config = resolveAIConfig(
        env({ OPENAI_API_KEY: 'sk-test', OPENAI_BASE_URL: 'https://proxy/v1' })
      );

      expect(config.configured && config.baseURL).toBe('https://proxy/v1');
    });

    it('prefers AI_MODEL over the legacy OPENAI_MODEL', () => {
      const config = resolveAIConfig(
        env({
          OPENAI_API_KEY: 'sk-test',
          OPENAI_MODEL: 'gpt-4o',
          AI_MODEL: 'gpt-5-mini',
        })
      );

      expect(config.model).toBe('gpt-5-mini');
    });
  });

  describe('provider selection', () => {
    it('auto-detects google when only a Gemini key is present', () => {
      const config = resolveAIConfig(env({ GEMINI_API_KEY: 'g-test' }));

      expect(config.provider).toBe('google');
      expect(config.model).toBe(DEFAULT_MODELS.google);
      expect(config.configured).toBe(true);
      expect(config.warnings).toEqual([]);
    });

    it('accepts GOOGLE_GENERATIVE_AI_API_KEY as an equal alias', () => {
      const config = resolveAIConfig(
        env({ GOOGLE_GENERATIVE_AI_API_KEY: 'g-test' })
      );

      expect(config.provider).toBe('google');
      expect(config.configured && config.apiKey).toBe('g-test');
    });

    it('prefers openai when both keys are present, so adding a Gemini key never silently switches provider', () => {
      const config = resolveAIConfig(
        env({ OPENAI_API_KEY: 'sk-test', GEMINI_API_KEY: 'g-test' })
      );

      expect(config.provider).toBe('openai');
    });

    it('treats "gemini" as an alias for google, case- and space-insensitively', () => {
      for (const value of ['gemini', 'GEMINI', ' Google ']) {
        const config = resolveAIConfig(
          env({ AI_PROVIDER: value, GEMINI_API_KEY: 'g-test' })
        );
        expect(config.provider).toBe('google');
      }
    });

    it('warns and falls back to auto-detection on an unrecognised AI_PROVIDER', () => {
      const config = resolveAIConfig(
        env({ AI_PROVIDER: 'llama', GEMINI_API_KEY: 'g-test' })
      );

      expect(config.provider).toBe('google');
      expect(config.warnings.join(' ')).toContain('AI_PROVIDER');
    });

    it('does not fall back across providers when the chosen one has no key', () => {
      const config = resolveAIConfig(
        env({ AI_PROVIDER: 'google', OPENAI_API_KEY: 'sk-test' })
      );

      expect(config.provider).toBe('google');
      expect(config.configured).toBe(false);
    });
  });

  describe('model fallback', () => {
    it('falls back to the provider default and warns on a model id containing whitespace', () => {
      const config = resolveAIConfig(
        env({ OPENAI_API_KEY: 'sk-test', AI_MODEL: 'my custom model' })
      );

      expect(config.model).toBe(DEFAULT_MODELS.openai);
      expect(config.warnings.join(' ')).toContain('my custom model');
    });

    it('treats a blank AI_MODEL as unset without warning, since compose passthroughs expand to empty', () => {
      const config = resolveAIConfig(
        env({ OPENAI_API_KEY: 'sk-test', AI_MODEL: '   ' })
      );

      expect(config.model).toBe(DEFAULT_MODELS.openai);
      expect(config.warnings).toEqual([]);
    });

    it('passes an unrecognised-but-well-formed model id through verbatim without warning', () => {
      // We deliberately do not keep a catalogue of valid model ids: any such
      // list would go stale and reject models the user legitimately has.
      const config = resolveAIConfig(
        env({ OPENAI_API_KEY: 'sk-test', AI_MODEL: 'totally-made-up-v9' })
      );

      expect(config.model).toBe('totally-made-up-v9');
      expect(config.warnings).toEqual([]);
    });

    it('warns but still uses a model id that looks like another vendor’s', () => {
      const config = resolveAIConfig(
        env({ AI_PROVIDER: 'google', GEMINI_API_KEY: 'g', AI_MODEL: 'gpt-4o' })
      );

      expect(config.model).toBe('gpt-4o');
      expect(config.warnings.join(' ')).toContain('gpt-4o');
    });

    it('suppresses the foreign-model warning when a proxy base URL is set', () => {
      const config = resolveAIConfig(
        env({
          AI_PROVIDER: 'google',
          GEMINI_API_KEY: 'g',
          AI_MODEL: 'gpt-4o',
          AI_BASE_URL: 'https://litellm.local/v1',
        })
      );

      expect(config.model).toBe('gpt-4o');
      expect(config.warnings).toEqual([]);
    });

    it('warns that OPENAI_MODEL is ignored under a non-OpenAI provider', () => {
      const config = resolveAIConfig(
        env({ GEMINI_API_KEY: 'g', OPENAI_MODEL: 'gpt-4o' })
      );

      expect(config.model).toBe(DEFAULT_MODELS.google);
      expect(config.warnings.join(' ')).toContain('OPENAI_MODEL');
    });
  });

  describe('base URL', () => {
    it('prefers AI_BASE_URL over the legacy OPENAI_BASE_URL', () => {
      const config = resolveAIConfig(
        env({
          OPENAI_API_KEY: 'sk-test',
          AI_BASE_URL: 'https://new/v1',
          OPENAI_BASE_URL: 'https://old/v1',
        })
      );

      expect(config.configured && config.baseURL).toBe('https://new/v1');
    });

    it('ignores OPENAI_BASE_URL under the google provider', () => {
      const config = resolveAIConfig(
        env({ GEMINI_API_KEY: 'g', OPENAI_BASE_URL: 'https://old/v1' })
      );

      expect(config.configured && config.baseURL).toBeUndefined();
    });

    it('omits baseURL entirely when unset', () => {
      const config = resolveAIConfig(env({ OPENAI_API_KEY: 'sk-test' }));

      expect(config.configured && 'baseURL' in config).toBe(false);
    });
  });

  describe('missing credentials', () => {
    it('reports unconfigured with a deterministic provider when nothing is set', () => {
      const config = resolveAIConfig(env({}));

      expect(config.configured).toBe(false);
      expect(config.provider).toBe('openai');
      expect(!config.configured && config.reason).toBe('missing_api_key');
      // A missing key is an error surfaced by the routes, not a warning.
      expect(config.warnings).toEqual([]);
    });

    it('treats a blank key as absent', () => {
      const config = resolveAIConfig(env({ OPENAI_API_KEY: '   ' }));

      expect(config.configured).toBe(false);
    });
  });
});

describe('AIConfigError', () => {
  it('names the credential the operator actually needs to set', () => {
    expect(new AIConfigError('google').message).toContain('GEMINI_API_KEY');
    expect(new AIConfigError('openai').message).toContain('OPENAI_API_KEY');
  });

  it('carries a stable machine-readable code', () => {
    expect(new AIConfigError('openai').code).toBe('AI_NOT_CONFIGURED');
  });
});

import type { LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { AIConfigError, getAIConfig } from './ai-config';

/**
 * Vendor client construction. This is the only module that imports a provider
 * SDK — the AI SDK abstracts the call itself, so nothing beyond building the
 * client differs between providers.
 *
 * Note: no `import 'server-only'` guard here, deliberately. The `@/services`
 * barrel re-exports `createAIAnalysisService`, and four 'use client' modules
 * import that barrel, so a server-only marker anywhere in this import graph
 * would break the client build. `getLanguageModel` is only ever reached from
 * route handlers, which run server-side.
 */

let cachedModel: LanguageModel | null = null;

/**
 * Resolve the language model to use for image analysis.
 *
 * @throws {AIConfigError} when no usable API key is configured.
 */
export function getLanguageModel(): LanguageModel {
  if (cachedModel) return cachedModel;

  const config = getAIConfig();

  if (!config.configured) {
    throw new AIConfigError(config.provider);
  }

  const { apiKey, baseURL, model } = config;
  // Omit baseURL entirely when unset so each SDK applies its own default.
  const settings = { apiKey, ...(baseURL ? { baseURL } : {}) };

  const client =
    config.provider === 'google'
      ? createGoogleGenerativeAI(settings)
      : createOpenAI(settings);

  cachedModel = client(model);
  return cachedModel;
}

/** Test seam: drop the memoized client so the next call rebuilds it. */
export function resetLanguageModelCache(): void {
  cachedModel = null;
}

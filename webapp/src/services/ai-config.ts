/**
 * Resolution of the AI provider / model / credential configuration.
 *
 * This module is intentionally pure: `resolveAIConfig` takes an env record as
 * an argument so it can be unit-tested without mutating `process.env`. No
 * vendor SDKs are imported here — see `ai-provider.ts` for client construction.
 */

/**
 * Providers supported for image analysis.
 *
 * Exported as a const tuple (the convention used by `IMAGE_TYPES` in
 * `@project/shared`) so callers can validate against the same list instead of
 * redeclaring it and drifting.
 */
export const AI_PROVIDERS = ['openai', 'google'] as const;

export type AIProvider = (typeof AI_PROVIDERS)[number];

/**
 * Model used when the operator has not chosen one, or chose an unusable value.
 * Both are current, generally-available, vision-capable ids.
 */
export const DEFAULT_MODELS: Record<AIProvider, string> = {
  openai: 'gpt-5.4-2026-03-05',
  google: 'gemini-3.5-flash',
};

/**
 * Human-readable name of the credential env var for each provider, used in
 * error messages so operators are told exactly what to set.
 */
export const API_KEY_VARS: Record<AIProvider, string> = {
  openai: 'OPENAI_API_KEY',
  google: 'GEMINI_API_KEY',
};

/** Accepted spellings of a provider, normalised to the canonical name. */
const PROVIDER_ALIASES: Record<string, AIProvider> = {
  openai: 'openai',
  google: 'google',
  gemini: 'google',
};

interface BaseConfig {
  provider: AIProvider;
  model: string;
  /** Non-fatal misconfiguration notes, logged once per process by getAIConfig. */
  warnings: string[];
}

export type ResolvedAIConfig =
  | (BaseConfig & { configured: true; apiKey: string; baseURL?: string })
  | (BaseConfig & { configured: false; reason: 'missing_api_key' });

/**
 * Raised when an AI code path runs without a usable credential. Routes map this
 * to a 503 rather than letting it surface as an opaque 500.
 */
export class AIConfigError extends Error {
  readonly code = 'AI_NOT_CONFIGURED';
  readonly provider: AIProvider;

  constructor(provider: AIProvider) {
    super(
      `AI analysis is not configured: ${API_KEY_VARS[provider]} is not set. ` +
        `Add it to .env at the project root (or set AI_PROVIDER to a provider ` +
        `you do have a key for) and restart the server.`
    );
    this.name = 'AIConfigError';
    this.provider = provider;
  }
}

/** Trimmed value, or undefined when unset/blank. */
function read(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

function resolveApiKey(
  env: NodeJS.ProcessEnv,
  provider: AIProvider
): string | undefined {
  if (provider === 'openai') return read(env, 'OPENAI_API_KEY');
  // GOOGLE_GENERATIVE_AI_API_KEY is the name the AI SDK reads natively; accept
  // it as an equal alias so existing Google tooling works unchanged.
  return (
    read(env, 'GEMINI_API_KEY') ?? read(env, 'GOOGLE_GENERATIVE_AI_API_KEY')
  );
}

/**
 * Pick the provider. An explicit AI_PROVIDER wins; otherwise infer it from
 * whichever credential is present. Defaults to openai so that the resulting
 * error message is deterministic when nothing at all is configured.
 */
function resolveProvider(
  env: NodeJS.ProcessEnv,
  warnings: string[]
): AIProvider {
  const requested = read(env, 'AI_PROVIDER')?.toLowerCase();

  if (requested) {
    const match = PROVIDER_ALIASES[requested];
    if (match) return match;
    warnings.push(
      `AI_PROVIDER="${requested}" is not a recognised provider ` +
        `(expected one of: ${AI_PROVIDERS.join(', ')}). ` +
        `Falling back to auto-detection from the available API keys.`
    );
  }

  const hasOpenAI = !!resolveApiKey(env, 'openai');
  const hasGoogle = !!resolveApiKey(env, 'google');

  // Both keys present is ambiguous; prefer openai so that adding a Gemini key
  // to an existing deployment never silently switches providers.
  if (hasOpenAI) return 'openai';
  if (hasGoogle) return 'google';
  return 'openai';
}

/**
 * Model ids are free-form strings and new ones ship constantly, so validating
 * against an allowlist would go stale and reject valid configurations. Check
 * the shape only: a usable id contains no whitespace. (Blank values are treated
 * as unset before reaching here.)
 */
function isUsableModelId(model: string): boolean {
  return !/\s/.test(model);
}

/** Heuristic: does this id look like it belongs to a different vendor? */
function looksForeign(model: string, provider: AIProvider): boolean {
  const id = model.toLowerCase();
  return provider === 'openai'
    ? id.startsWith('gemini-')
    : id.startsWith('gpt-') || /^o\d/.test(id);
}

function resolveModel(
  env: NodeJS.ProcessEnv,
  provider: AIProvider,
  hasBaseUrlOverride: boolean,
  warnings: string[]
): string {
  const fallback = DEFAULT_MODELS[provider];

  // OPENAI_MODEL predates AI_MODEL and stays supported, but only for the
  // provider it was ever meaningful for.
  const legacy = provider === 'openai' ? read(env, 'OPENAI_MODEL') : undefined;

  if (provider !== 'openai' && read(env, 'OPENAI_MODEL')) {
    warnings.push(
      `OPENAI_MODEL is set but the active provider is ${provider}; it is being ` +
        `ignored. Use AI_MODEL to set the model for a non-OpenAI provider.`
    );
  }

  // A blank value counts as unset rather than as a misconfiguration: docker
  // compose `${AI_MODEL}` passthroughs expand to an empty string whenever the
  // operator has not set the variable, and that must not produce a warning.
  const raw = read(env, 'AI_MODEL') ?? legacy;

  if (raw === undefined) return fallback;

  if (!isUsableModelId(raw)) {
    warnings.push(
      `Ignoring unusable model id "${raw}" — falling back to ${fallback}.`
    );
    return fallback;
  }

  // Suppressed when a base URL override is set: a compatible proxy (LiteLLM,
  // OpenRouter, a local server) legitimately serves another vendor's model ids
  // over this provider's wire protocol, and warning there is just noise.
  if (!hasBaseUrlOverride && looksForeign(raw, provider)) {
    warnings.push(
      `Model "${raw}" does not look like a ${provider} model id. ` +
        `Using it anyway — set AI_PROVIDER if you meant a different provider.`
    );
  }

  return raw;
}

function resolveBaseURL(
  env: NodeJS.ProcessEnv,
  provider: AIProvider
): string | undefined {
  return (
    read(env, 'AI_BASE_URL') ??
    (provider === 'openai' ? read(env, 'OPENAI_BASE_URL') : undefined)
  );
}

/**
 * Resolve the effective AI configuration from an env record.
 *
 * Misconfiguration is tiered: an unusable model id degrades to the provider
 * default with a warning, while a missing credential is reported as
 * unconfigured so callers can fail loudly rather than analysing with a provider
 * the operator did not choose.
 */
export function resolveAIConfig(env: NodeJS.ProcessEnv): ResolvedAIConfig {
  const warnings: string[] = [];
  const provider = resolveProvider(env, warnings);
  const baseURL = resolveBaseURL(env, provider);
  const model = resolveModel(env, provider, !!baseURL, warnings);
  const apiKey = resolveApiKey(env, provider);

  if (!apiKey) {
    return {
      configured: false,
      provider,
      model,
      reason: 'missing_api_key',
      warnings,
    };
  }

  return {
    configured: true,
    provider,
    model,
    apiKey,
    warnings,
    ...(baseURL ? { baseURL } : {}),
  };
}

let cached: ResolvedAIConfig | null = null;

/**
 * Process-wide memoized configuration. Warnings are logged once, not on every
 * analysed image.
 */
export function getAIConfig(): ResolvedAIConfig {
  if (!cached) {
    cached = resolveAIConfig(process.env);
    for (const warning of cached.warnings) {
      console.warn(`[ai-config] ${warning}`);
    }
  }
  return cached;
}

/** Test seam: drop the memoized config so the next call re-reads process.env. */
export function resetAIConfigCache(): void {
  cached = null;
}

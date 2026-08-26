/**
 * One name for the post-login destination, and one place that decides whether
 * a destination is safe to send a browser to.
 *
 * The value travels three hops — the guard that builds the login URL, the
 * login/signup pages that read it back, and the forms that navigate once the
 * credentials land — so the spelling and the validation live here rather than
 * being restated at each hop. `redirect` is the older spelling that some links
 * still carry: it is read, never written.
 */

export const RETURN_URL_PARAM = 'returnUrl';
export const LEGACY_RETURN_URL_PARAM = 'redirect';
export const DEFAULT_RETURN_URL = '/';

/** The subset of `URLSearchParams` that it and Next's readonly version share. */
interface ReadableSearchParams {
  get(name: string): string | null;
}

// Control characters are the usual way a scheme gets smuggled past a
// startsWith check — browsers strip them before parsing the URL.
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

/**
 * A return URL is attacker-supplied — it arrives in a query string anyone can
 * put behind a link — so only a path on this origin is ever handed back.
 *
 * Rejected: absolute URLs (`https://evil.example`), protocol-relative
 * `//evil.example` and the `/\evil.example` spelling browsers normalise to it,
 * and anything not rooted at `/` — which a still-encoded value also fails,
 * that being the intended outcome; see the note on decoding below.
 */
export function sanitizeReturnUrl(
  raw: string | null | undefined,
  fallback: string = DEFAULT_RETURN_URL
): string {
  if (!raw) return fallback;

  // Deliberately not decoded: both callers hand over an already-decoded value
  // (`URLSearchParams.get` decodes, and `buildLoginUrl` composes a live
  // `location`), so a second pass would eat one layer of escaping and corrupt
  // any destination whose own query string contains a percent sequence.
  const candidate = raw.trim();

  if (!candidate.startsWith('/')) return fallback;
  if (candidate.startsWith('//') || candidate.startsWith('/\\'))
    return fallback;
  if (CONTROL_CHARACTERS.test(candidate)) return fallback;

  return candidate;
}

/** Reads the destination out of a query string, canonical name first. */
export function readReturnUrl(
  params: ReadableSearchParams | null | undefined,
  fallback: string = DEFAULT_RETURN_URL
): string {
  const raw =
    params?.get(RETURN_URL_PARAM) ?? params?.get(LEGACY_RETURN_URL_PARAM);
  return sanitizeReturnUrl(raw, fallback);
}

/**
 * The login URL a guard sends an unauthenticated visitor to. `destination`
 * should carry its query string, so a visitor bounced off
 * `/inventory/items?q=drill&page=2` lands back on that exact list.
 */
export function buildLoginUrl(
  destination: string,
  loginPath: string = '/login'
): string {
  const safe = sanitizeReturnUrl(destination);
  // Nothing worth preserving — the login page already defaults here.
  if (safe === DEFAULT_RETURN_URL) return loginPath;
  return `${loginPath}?${RETURN_URL_PARAM}=${encodeURIComponent(safe)}`;
}

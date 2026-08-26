/**
 * The post-login destination is attacker-supplied — it rides in a query string
 * anyone can put behind a link — so the rules that decide what is safe to
 * navigate to are pinned here rather than left to each call site.
 */

import { describe, it, expect } from 'vitest';
import {
  buildLoginUrl,
  readReturnUrl,
  sanitizeReturnUrl,
  RETURN_URL_PARAM,
  LEGACY_RETURN_URL_PARAM,
} from '@/lib/auth/return-url';

describe('sanitizeReturnUrl', () => {
  it('keeps same-origin paths, query string and all', () => {
    const paths = [
      '/inventory/items',
      '/inventory/items?q=drill&page=2&sort=-created',
      '/inventory/containers/abc123/edit',
      '/profile',
      '/inventory/images/xyz/wizard?step=2',
    ];

    for (const path of paths) {
      expect(sanitizeReturnUrl(path)).toBe(path);
    }
  });

  it('refuses anything that would leave this origin', () => {
    const hostile = [
      'https://evil.example/phish',
      'http://evil.example',
      '//evil.example',
      '/\\evil.example',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'inventory/items', // not rooted — resolves relative to /login
      '/inventory\u0000/items', // control characters browsers strip
      '\u0001/inventory/items',
      '%2f%2fevil.example', // encoded, so not rooted at `/`
      '%2Finventory%2Fitems',
    ];

    for (const value of hostile) {
      expect(sanitizeReturnUrl(value)).toBe('/');
    }
  });

  it('falls back when there is no value', () => {
    expect(sanitizeReturnUrl(null)).toBe('/');
    expect(sanitizeReturnUrl(undefined)).toBe('/');
    expect(sanitizeReturnUrl('')).toBe('/');
    expect(sanitizeReturnUrl(null, '/inventory/items')).toBe(
      '/inventory/items'
    );
  });
});

describe('readReturnUrl', () => {
  it('reads the canonical param', () => {
    const params = new URLSearchParams({
      [RETURN_URL_PARAM]: '/inventory/items?page=3',
    });
    expect(readReturnUrl(params)).toBe('/inventory/items?page=3');
  });

  it('still honours the legacy `redirect` spelling', () => {
    const params = new URLSearchParams({
      [LEGACY_RETURN_URL_PARAM]: '/profile',
    });
    expect(readReturnUrl(params)).toBe('/profile');
  });

  it('prefers the canonical param when both are present', () => {
    const params = new URLSearchParams({
      [RETURN_URL_PARAM]: '/inventory/items',
      [LEGACY_RETURN_URL_PARAM]: '/profile',
    });
    expect(readReturnUrl(params)).toBe('/inventory/items');
  });

  it('sanitizes what it reads', () => {
    const params = new URLSearchParams({
      [RETURN_URL_PARAM]: 'https://evil.example',
    });
    expect(readReturnUrl(params)).toBe('/');
  });
});

describe('buildLoginUrl', () => {
  it('attaches the destination under the canonical param', () => {
    expect(buildLoginUrl('/inventory/items?q=drill')).toBe(
      `/login?${RETURN_URL_PARAM}=${encodeURIComponent('/inventory/items?q=drill')}`
    );
  });

  it('omits the param when the destination is already the default', () => {
    expect(buildLoginUrl('/')).toBe('/login');
  });

  it('drops an off-origin destination instead of forwarding it', () => {
    expect(buildLoginUrl('https://evil.example')).toBe('/login');
  });

  it('honours a custom login path', () => {
    expect(buildLoginUrl('/profile', '/auth/signin')).toBe(
      `/auth/signin?${RETURN_URL_PARAM}=${encodeURIComponent('/profile')}`
    );
  });

  it('round-trips through readReturnUrl', () => {
    const destination = '/inventory/containers/abc?tab=items&q=a%20b';
    const loginUrl = buildLoginUrl(destination);
    const params = new URLSearchParams(loginUrl.split('?')[1]);
    expect(readReturnUrl(params)).toBe(destination);
  });
});

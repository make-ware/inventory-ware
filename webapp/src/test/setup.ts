import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import { expect } from 'vitest';
import React from 'react';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Mock environment variables
process.env.NEXT_PUBLIC_POCKETBASE_URL = 'http://localhost:8090';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

// Mock Next.js Image component
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // Extract Next.js-specific props that shouldn't be passed to DOM
    const {
      fill,
      unoptimized,
      priority,
      quality,
      sizes,
      loader,
      placeholder,
      blurDataURL,
      ...domProps
    } = props;

    // If fill is true, add appropriate styles to make image fill container
    const style = fill
      ? {
          ...(typeof props.style === 'object' ? props.style : {}),
          position: 'absolute',
          height: '100%',
          width: '100%',
          inset: 0,
        }
      : props.style;

    return React.createElement('img', { ...domProps, style });
  },
}));

// Mock Next.js Link component
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children?: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => {
    return React.createElement('a', { href, ...props }, children);
  },
}));

// Mock sonner (toast library)
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

// Cleanup after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

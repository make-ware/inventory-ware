import { vi } from 'vitest';
import type { User } from '@project/shared';

/**
 * Mock PocketBase AuthStore
 */
export class MockAuthStore {
  isValid = false;
  model: User | null = null;
  private listeners: Array<(token: string | null, model: User | null) => void> =
    [];

  onChange(callback: (token: string | null, model: User | null) => void) {
    this.listeners.push(callback);
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  clear() {
    this.isValid = false;
    this.model = null;
    this.notifyListeners(null, null);
  }

  setAuth(token: string, model: User) {
    this.isValid = true;
    this.model = model;
    this.notifyListeners(token, model);
  }

  private notifyListeners(token: string | null, model: User | null) {
    this.listeners.forEach((listener) => listener(token, model));
  }
}

/**
 * Mock PocketBase Collection
 */
export function createMockCollection() {
  const mockCollection = {
    authWithPassword: vi.fn(),
    create: vi.fn(),
    getFullList: vi.fn(),
    getFirstListItem: vi.fn(),
    getOne: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  return mockCollection;
}

/**
 * Mock PocketBase client instance
 */
export function createMockPocketBase(authStore?: MockAuthStore) {
  const store = authStore || new MockAuthStore();
  const mockCollection = createMockCollection();

  const mockPb = {
    authStore: store,
    collection: vi.fn(() => mockCollection),
    autoCancellation: vi.fn(),
    cancelAllRequests: vi.fn(),
    cancelRequest: vi.fn(),
    buildUrl: vi.fn(),
    send: vi.fn(),
  };

  return { mockPb, mockCollection, authStore: store };
}

/**
 * Create mock auth helpers
 */
export function createMockAuthHelpers(
  mockCollection: ReturnType<typeof createMockCollection>
) {
  return {
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    getCurrentUser: vi.fn(),
    isAuthenticated: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
  };
}

/**
 * Create a mock user for testing
 */
export function createMockUser(overrides?: Partial<User>): User {
  const id = overrides?.id || `user_${Math.random().toString(36).substring(7)}`;
  const email =
    overrides?.email ||
    `test${Math.random().toString(36).substring(7)}@example.com`;

  return {
    id,
    email,
    name: overrides?.name || 'Test User',
    created: overrides?.created || new Date().toISOString(),
    updated: overrides?.updated || new Date().toISOString(),
    ...overrides,
  } as User;
}

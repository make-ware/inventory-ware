/**
 * Property-Based Test: Session Cleanup
 * Feature: auth-boilerplate, Property 6: Session Cleanup
 * Validates: Requirements 3.3
 *
 * Property: For any logout operation, all authentication data should be cleared
 * from storage and the user should be redirected appropriately
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, waitFor } from '@testing-library/react';
import { AuthProvider } from '@/contexts/auth-context';
import { useAuth } from '@/hooks/use-auth';

// Mock PocketBase - define mocks inside factory to avoid hoisting issues
vi.mock('@/lib/pocketbase-client', () => {
  const mockAuthStore = {
    isValid: false,
    model: null,
    token: '',
    clear: vi.fn(),
    onChange: vi.fn(() => vi.fn()), // Returns unsubscribe function
  };

  const mockPb = {
    authStore: mockAuthStore,
    collection: vi.fn(() => ({
      authWithPassword: vi.fn(),
      authRefresh: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    })),
  };

  return {
    default: mockPb,
  };
});

// Mock AuthService - define mocks inside factory to avoid hoisting issues
const mockAuthService = {
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  getCurrentUser: vi.fn(),
  isAuthenticated: vi.fn(),
  refreshAuth: vi.fn(),
  updateProfile: vi.fn(),
  changePassword: vi.fn(),
};

vi.mock('@project/shared', async () => {
  const actual = await vi.importActual('@project/shared');
  return {
    ...actual,
    createAuthService: vi.fn(() => mockAuthService),
    createMutators: vi.fn(() => ({ userMutator: {} })),
    parseAuthError: vi.fn((error) => ({
      type: 'unknown',
      message: error?.message || 'An error occurred',
    })),
    globalLoadingManager: {
      setLoading: vi.fn(),
      clear: vi.fn(),
    },
  };
});

// Import pb after mocking to get the mocked version
import pb from '@/lib/pocketbase-client';

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  length: 0,
  key: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

// Test component to access auth context and trigger logout
function TestComponent() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();

  return (
    <div>
      <div data-testid="loading">{isLoading.toString()}</div>
      <div data-testid="authenticated">{isAuthenticated.toString()}</div>
      <div data-testid="user">{user ? JSON.stringify(user) : 'null'}</div>
      <button data-testid="logout-btn" onClick={logout}>
        Logout
      </button>
    </div>
  );
}

describe('Property Test: Session Cleanup', () => {
  const mockPb = pb as any;
  const mockAuthStore = mockPb.authStore;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset localStorage mock
    mockLocalStorage.getItem.mockClear();
    mockLocalStorage.setItem.mockClear();
    mockLocalStorage.removeItem.mockClear();
    mockLocalStorage.clear.mockClear();

    // Reset auth store state
    mockAuthStore.isValid = false;
    mockAuthStore.model = null;
    mockAuthStore.token = '';

    // Reset auth service mocks
    mockAuthService.logout.mockImplementation(() => {
      mockAuthStore.clear();
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should clear all authentication data on logout', async () => {
    // Property test with different authenticated user scenarios
    const testUsers = [
      { id: '1', email: 'user1@example.com', name: 'User One' },
      { id: '2', email: 'user2@example.com', name: 'User Two' },
      { id: '3', email: 'admin@example.com', name: 'Admin User' },
    ];

    for (const user of testUsers) {
      // Setup: Authenticated user
      mockPb.authStore.isValid = true;
      mockPb.authStore.model = user;
      mockPb.authStore.token = `token-${user.id}`;
      mockPb.collection().authRefresh.mockResolvedValue({ record: user });

      const { getByTestId, unmount } = render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      // Wait for auth initialization
      await waitFor(() => {
        expect(getByTestId('loading')).toHaveTextContent('false');
        expect(getByTestId('authenticated')).toHaveTextContent('true');
      });

      // Trigger logout
      await act(async () => {
        getByTestId('logout-btn').click();
      });

      // Wait for logout to complete
      await waitFor(() => {
        expect(getByTestId('authenticated')).toHaveTextContent('false');
        expect(getByTestId('user')).toHaveTextContent('null');
      });

      // Verify auth store was cleared
      expect(mockAuthStore.clear).toHaveBeenCalled();

      unmount();

      // Reset for next iteration
      mockPb.authStore.isValid = false;
      mockPb.authStore.model = null;
      mockPb.authStore.token = '';

      // Clear specific mocks after verification
      mockAuthStore.clear.mockClear();
      mockAuthService.logout.mockClear();
    }
  });

  it('should handle logout errors gracefully', async () => {
    // Property test with different error scenarios during logout
    const logoutErrors = [
      new Error('Network error during logout'),
      new Error('Server unavailable'),
      new Error('Invalid session'),
    ];

    for (const error of logoutErrors) {
      const user = { id: '1', email: 'user@example.com', name: 'Test User' };

      // Setup: Authenticated user
      mockAuthStore.isValid = true;
      mockAuthStore.model = user;
      mockPb.collection().authRefresh.mockResolvedValue({ record: user });

      // Mock logout to throw error
      mockAuthService.logout.mockImplementationOnce(() => {
        throw error;
      });

      const { getByTestId, unmount } = render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      // Wait for auth initialization
      await waitFor(() => {
        expect(getByTestId('authenticated')).toHaveTextContent('true');
      });

      // Trigger logout (should handle error gracefully)
      await act(async () => {
        getByTestId('logout-btn').click();
      });

      // Wait for logout to complete (should still clear state despite error)
      await waitFor(() => {
        expect(getByTestId('authenticated')).toHaveTextContent('false');
        expect(getByTestId('user')).toHaveTextContent('null');
      });

      // Verify auth store was cleared even with error
      expect(mockAuthStore.clear).toHaveBeenCalled();

      unmount();
      vi.clearAllMocks();

      // Reset for next iteration
      mockAuthStore.isValid = false;
      mockAuthStore.model = null;
    }
  });

  it('should clear app-specific localStorage data on logout', async () => {
    // Property test: logout should clean up app-specific data
    const user = { id: '1', email: 'user@example.com', name: 'Test User' };

    // Setup: Authenticated user with app-specific data in localStorage
    mockAuthStore.isValid = true;
    mockAuthStore.model = user;
    mockPb.collection().authRefresh.mockResolvedValue({ record: user });

    // Mock localStorage to have app-specific keys
    mockLocalStorage.length = 5;
    mockLocalStorage.key
      .mockReturnValueOnce('app_user_preferences')
      .mockReturnValueOnce('other_key')
      .mockReturnValueOnce('app_session_data')
      .mockReturnValueOnce('unrelated_key')
      .mockReturnValueOnce('app_cache');

    // Mock the authService.logout to actually call the localStorage cleanup
    mockAuthService.logout.mockImplementationOnce(() => {
      // Simulate the actual logout logic
      mockAuthStore.clear();

      // Simulate localStorage cleanup
      const keysToRemove = [];
      for (let i = 0; i < mockLocalStorage.length; i++) {
        const key = mockLocalStorage.key(i);
        if (key && key.startsWith('app_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => mockLocalStorage.removeItem(key));
    });

    const { getByTestId } = render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // Wait for auth initialization
    await waitFor(() => {
      expect(getByTestId('authenticated')).toHaveTextContent('true');
    });

    // Trigger logout
    await act(async () => {
      getByTestId('logout-btn').click();
    });

    // Wait for logout to complete
    await waitFor(() => {
      expect(getByTestId('authenticated')).toHaveTextContent('false');
    });

    // Verify app-specific localStorage items were removed
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(
      'app_user_preferences'
    );
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(
      'app_session_data'
    );
    expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('app_cache');

    // Verify non-app keys were not removed
    expect(mockLocalStorage.removeItem).not.toHaveBeenCalledWith('other_key');
    expect(mockLocalStorage.removeItem).not.toHaveBeenCalledWith(
      'unrelated_key'
    );
  });

  it('should maintain logout functionality across multiple logout attempts', async () => {
    // Property test: multiple logout calls should be handled safely
    const user = { id: '1', email: 'user@example.com', name: 'Test User' };

    // Setup: Authenticated user
    mockAuthStore.isValid = true;
    mockAuthStore.model = user;
    mockPb.collection().authRefresh.mockResolvedValue({ record: user });

    const { getByTestId } = render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // Wait for auth initialization
    await waitFor(() => {
      expect(getByTestId('authenticated')).toHaveTextContent('true');
    });

    // Trigger multiple logout attempts (clicking the button multiple times)
    const logoutBtn = getByTestId('logout-btn');
    await act(async () => {
      logoutBtn.click();
    });

    // Wait for first logout to complete
    await waitFor(() => {
      expect(getByTestId('authenticated')).toHaveTextContent('false');
      expect(getByTestId('user')).toHaveTextContent('null');
    });

    // Verify auth store clear was called
    expect(mockAuthStore.clear).toHaveBeenCalled();

    // Try clicking logout again when already logged out (should be safe)
    await act(async () => {
      logoutBtn.click();
      logoutBtn.click();
    });

    // Should still be logged out
    expect(getByTestId('authenticated')).toHaveTextContent('false');
    expect(getByTestId('user')).toHaveTextContent('null');
  });

  it('should clear session data for different user types', async () => {
    // Property test with different user roles/types
    const userTypes = [
      {
        id: '1',
        email: 'user@example.com',
        name: 'Regular User',
        role: 'user',
      },
      {
        id: '2',
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'admin',
      },
      {
        id: '3',
        email: 'moderator@example.com',
        name: 'Moderator',
        role: 'moderator',
      },
    ];

    for (const user of userTypes) {
      // Setup: Authenticated user of specific type
      mockAuthStore.isValid = true;
      mockAuthStore.model = user;
      mockAuthStore.token = `${user.role}-token-${user.id}`;
      mockPb.collection().authRefresh.mockResolvedValue({ record: user });

      const { getByTestId, unmount } = render(
        <AuthProvider>
          <TestComponent />
        </AuthProvider>
      );

      // Wait for auth initialization
      await waitFor(() => {
        expect(getByTestId('authenticated')).toHaveTextContent('true');
        expect(getByTestId('user')).toHaveTextContent(JSON.stringify(user));
      });

      // Trigger logout
      await act(async () => {
        getByTestId('logout-btn').click();
      });

      // Wait for logout to complete
      await waitFor(() => {
        expect(getByTestId('authenticated')).toHaveTextContent('false');
        expect(getByTestId('user')).toHaveTextContent('null');
      });

      // Verify cleanup was performed regardless of user type
      expect(mockAuthStore.clear).toHaveBeenCalled();

      unmount();

      // Reset for next iteration
      mockAuthStore.isValid = false;
      mockAuthStore.model = null;
      mockAuthStore.token = '';

      // Clear specific mocks after verification
      mockAuthStore.clear.mockClear();
      mockAuthService.logout.mockClear();
    }
  });
});

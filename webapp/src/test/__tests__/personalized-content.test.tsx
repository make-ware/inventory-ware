import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuthContext } from '@/contexts/auth-context';
import Home from '@/app/page';

// Mock Next.js Image to avoid priority prop warning in tests
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    onLoad,
    className,
    style,
    fill,
    ...rest
  }: {
    src: string;
    alt: string;
    onLoad?: React.ReactEventHandler<HTMLImageElement>;
    className?: string;
    style?: React.CSSProperties;
    fill?: boolean;
    [key: string]: unknown;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      onLoad={onLoad}
      className={className}
      style={fill ? { position: 'absolute', inset: 0, ...style } : style}
    />
  ),
}));

// Property test generator for user data
function generateRandomUser() {
  const id = Math.random().toString(36).substring(7);
  const names = [
    'Alice',
    'Bob',
    'Charlie',
    'Diana',
    'Eve',
    'Frank',
    'Grace',
    'Henry',
  ];
  const domains = ['example.com', 'test.org', 'demo.net', 'sample.io'];

  const name =
    names[Math.floor(Math.random() * names.length)] +
    Math.random().toString(36).substring(2, 5);
  const email = `${name.toLowerCase()}@${domains[Math.floor(Math.random() * domains.length)]}`;

  return {
    id,
    name,
    email,
    password: 'password123',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    collectionId: 'users',
    collectionName: 'users',
    expand: {},
  };
}

// Mock auth context provider for testing
function MockAuthProvider({
  children,
  user,
  isAuthenticated = false,
  isLoading = false,
}: {
  children: React.ReactNode;
  user?: any;
  isAuthenticated?: boolean;
  isLoading?: boolean;
}) {
  const mockValue = {
    userId: user?.id || null,
    user: user || null,
    isLoading,
    isAuthenticated,
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
  };

  return (
    <AuthContext.Provider value={mockValue}>{children}</AuthContext.Provider>
  );
}

describe('Personalized Content Property Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Property 11: Personalized Content
   * For any authenticated user, personalized content (such as welcome messages with their name)
   * should be displayed correctly
   * Validates: Requirements 5.2
   */
  it('Property 11: Personalized Content - should display user name in welcome message', () => {
    // Test with multiple random users to ensure property holds universally
    const testUsers = Array.from({ length: 5 }, generateRandomUser);

    for (const testUser of testUsers) {
      const { unmount } = render(
        <MockAuthProvider user={testUser} isAuthenticated={true}>
          <Home />
        </MockAuthProvider>
      );

      // Verify personalized welcome message contains user's name
      const welcomeMessage = screen.getByText(
        new RegExp(`Welcome back, ${testUser.name}!`, 'i')
      );
      expect(welcomeMessage).toBeInTheDocument();

      // Verify the welcome message is personalized and not generic
      expect(welcomeMessage.textContent).toContain(testUser.name);
      expect(welcomeMessage.textContent).not.toContain('Welcome back, !'); // No empty name

      unmount();
    }
  });

  it('Property 11: Personalized Content - should display email when name is not available', () => {
    // Test users without names
    const testUsers = Array.from({ length: 3 }, () => {
      const user = generateRandomUser();
      return { ...user, name: '' }; // Remove name
    });

    for (const testUser of testUsers) {
      const { unmount } = render(
        <MockAuthProvider user={testUser} isAuthenticated={true}>
          <Home />
        </MockAuthProvider>
      );

      // Should fall back to email when name is not available
      const welcomeMessage = screen.getByText(
        new RegExp(`Welcome back, ${testUser.email}!`, 'i')
      );
      expect(welcomeMessage).toBeInTheDocument();
      expect(welcomeMessage.textContent).toContain(testUser.email);

      unmount();
    }
  });

  it('Property 11: Personalized Content - should display personalized welcome message', () => {
    const testUsers = Array.from({ length: 3 }, generateRandomUser);

    for (const testUser of testUsers) {
      const { unmount } = render(
        <MockAuthProvider user={testUser} isAuthenticated={true}>
          <Home />
        </MockAuthProvider>
      );

      // Verify personalized welcome message is displayed
      const welcomeMessage = screen.getByText(
        new RegExp(`Welcome back, ${testUser.name || testUser.email}!`, 'i')
      );
      expect(welcomeMessage).toBeInTheDocument();

      unmount();
    }
  });

  it('Property 11: Personalized Content - should not display personalized content for unauthenticated users', () => {
    const testUser = generateRandomUser();

    render(
      <MockAuthProvider user={null} isAuthenticated={false}>
        <Home />
      </MockAuthProvider>
    );

    // Should not display personalized welcome message
    expect(
      screen.queryByText(new RegExp(`Welcome back, ${testUser.name}!`, 'i'))
    ).not.toBeInTheDocument();

    // Should display generic welcome content instead
    expect(screen.getByText(/Inventory Ware/i)).toBeInTheDocument();
    // There may be multiple "Get Started" buttons, so use getAllByText
    const getStartedButtons = screen.getAllByText(/Get Started/i);
    expect(getStartedButtons.length).toBeGreaterThan(0);
  });

  it('Property 11: Personalized Content - should handle special characters in names', () => {
    // Test users with special characters in names
    const specialUsers = [
      { ...generateRandomUser(), name: 'José María' },
      { ...generateRandomUser(), name: '李小明' },
      { ...generateRandomUser(), name: 'Müller-Schmidt' },
      { ...generateRandomUser(), name: "O'Connor" },
    ];

    for (const testUser of specialUsers) {
      const { unmount } = render(
        <MockAuthProvider user={testUser} isAuthenticated={true}>
          <Home />
        </MockAuthProvider>
      );

      // Verify special characters are handled correctly in welcome message
      const welcomeMessage = screen.getByText(
        new RegExp(
          `Welcome back, ${testUser.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}!`,
          'i'
        )
      );
      expect(welcomeMessage).toBeInTheDocument();
      expect(welcomeMessage.textContent).toContain(testUser.name);

      unmount();
    }
  });

  it('Property 11: Personalized Content - should handle very long names gracefully', () => {
    // Test users with very long names
    const longNameUser = {
      ...generateRandomUser(),
      name: 'Bartholomew Maximilian Alexander Montgomery-Fitzpatrick III',
    };

    render(
      <MockAuthProvider user={longNameUser} isAuthenticated={true}>
        <Home />
      </MockAuthProvider>
    );

    // Should still display the full name in welcome message
    const welcomeMessage = screen.getByText(
      new RegExp(`Welcome back, ${longNameUser.name}!`, 'i')
    );
    expect(welcomeMessage).toBeInTheDocument();
    expect(welcomeMessage.textContent).toContain(longNameUser.name);
  });

  it('Property 11: Personalized Content - should maintain personalization consistency across components', () => {
    const testUser = generateRandomUser();

    render(
      <MockAuthProvider user={testUser} isAuthenticated={true}>
        <Home />
      </MockAuthProvider>
    );

    // Check that the welcome message contains the user's name or email
    const welcomeMessage = screen.getByText(
      new RegExp(`Welcome back, ${testUser.name || testUser.email}!`, 'i')
    );
    expect(welcomeMessage).toBeInTheDocument();

    // Verify the welcome message contains the correct user information
    if (testUser.name) {
      expect(welcomeMessage.textContent).toContain(testUser.name);
    } else {
      expect(welcomeMessage.textContent).toContain(testUser.email);
    }
  });
});

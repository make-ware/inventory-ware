'use client';

import { useAuth } from '@/hooks/use-auth';
import type { User } from '@project/shared';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  ArrowRight,
  Shield,
  Database,
  Zap,
  Users,
  FileText,
  Settings,
} from 'lucide-react';
import Link from 'next/link';

export default function Home() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (isAuthenticated && user) {
    return <AuthenticatedView user={user} />;
  }

  return <UnauthenticatedView />;
}

function AuthenticatedView({ user }: { user: User }) {
  return (
    <div className="container py-8">
      {/* Welcome Section */}
      <div className="mb-12">
        <h1 className="text-4xl font-bold text-foreground mb-4">
          Welcome back, {user.name || user.email}! 👋
        </h1>
        <p className="text-xl text-muted-foreground">
          You&apos;re successfully authenticated and ready to explore the
          features.
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Profile Settings
            </CardTitle>
            <CardDescription>
              Update your profile information and preferences
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/profile">
              <Button className="w-full">
                Manage Profile
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Documentation
            </CardTitle>
            <CardDescription>
              Learn about the features and capabilities
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full">
              View Docs
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Community
            </CardTitle>
            <CardDescription>
              Connect with other users and get support
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full">
              Join Community
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* User Info */}
      <Card>
        <CardHeader>
          <CardTitle>Your Account</CardTitle>
          <CardDescription>Account information and status</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Email:</span>
            <span className="text-sm text-muted-foreground">{user.email}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Name:</span>
            <span className="text-sm text-muted-foreground">
              {user.name || 'Not set'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Status:</span>
            <Badge variant="default">Active</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function UnauthenticatedView() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      {/* Hero Section */}
      <div className="container py-16">
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-6xl font-bold text-foreground mb-6">
            Inventory Ware
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            A modern inventory management system that combines Next.js frontend
            with PocketBase backend, designed for rapid development with
            built-in authentication and real-time features.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/signup">
              <Button size="lg" className="text-lg px-8 py-6">
                Get Started
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg" className="text-lg px-8 py-6">
                Sign In
              </Button>
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
          <FeatureCard
            icon={<Shield className="h-8 w-8" />}
            title="Built-in Authentication"
            description="Multi-provider authentication with PocketBase, including email/password, OAuth, and more."
          />
          <FeatureCard
            icon={<Database className="h-8 w-8" />}
            title="Type-safe Database"
            description="End-to-end type safety from database to UI with Zod validation and TypeScript."
          />
          <FeatureCard
            icon={<Zap className="h-8 w-8" />}
            title="Real-time Features"
            description="WebSocket support for live updates, notifications, and real-time collaboration."
          />
          <FeatureCard
            icon={<Users className="h-8 w-8" />}
            title="User Management"
            description="Complete user management system with profiles, roles, and permissions."
          />
          <FeatureCard
            icon={<FileText className="h-8 w-8" />}
            title="File Storage"
            description="Built-in file upload and management with automatic optimization and CDN."
          />
          <FeatureCard
            icon={<Settings className="h-8 w-8" />}
            title="Admin Dashboard"
            description="Web-based database and user management with intuitive admin interface."
          />
        </div>

        {/* CTA Section */}
        <div className="text-center">
          <Card className="max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="text-2xl">
                Ready to build something amazing?
              </CardTitle>
              <CardDescription className="text-lg">
                Join thousands of developers who are building modern web
                applications with our template.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/signup">
                  <Button size="lg" className="w-full sm:w-auto">
                    Create Account
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto"
                >
                  View Documentation
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-center gap-3 mb-2">
          <div className="text-primary">{icon}</div>
          <CardTitle className="text-xl">{title}</CardTitle>
        </div>
        <CardDescription className="text-base leading-relaxed">
          {description}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

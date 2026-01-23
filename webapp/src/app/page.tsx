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
import {
  ArrowRight,
  Package,
  Box,
  Image as ImageIcon,
  Settings,
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

export default function Home() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      <div className="container py-16">
        {/* Hero Section */}
        <div className="text-center mb-16">
          <div className="flex justify-center mb-8">
            <Image
              src="/inventory-ware.png"
              alt="Inventory Ware Logo"
              width={160}
              height={160}
              className="mx-auto"
              priority
            />
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-foreground mb-6">
            {isAuthenticated && user
              ? `Welcome back, ${user.name || user.email}! 👋`
              : 'Inventory Ware'}
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            A simple to use inventory management app. Track your items, organize
            containers, and manage images with ease.
          </p>
          {!isAuthenticated && (
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/signup">
                <Button size="lg" className="text-lg px-8 py-6">
                  Get Started
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link href="/login">
                <Button
                  variant="outline"
                  size="lg"
                  className="text-lg px-8 py-6"
                >
                  Sign In
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* Quick Actions for Authenticated Users */}
        {isAuthenticated && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  View Inventory
                </CardTitle>
                <CardDescription>
                  Browse and manage all your inventory items and containers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/inventory">
                  <Button className="w-full">
                    Go to Inventory
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Manage Images
                </CardTitle>
                <CardDescription>
                  View and organize all your inventory images
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/inventory/images">
                  <Button variant="outline" className="w-full">
                    View Images
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>

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
                  <Button variant="outline" className="w-full">
                    Manage Profile
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          <FeatureCard
            icon={<Package className="h-8 w-8" />}
            title="Item Management"
            description="Easily add, edit, and organize your inventory items with detailed information and metadata."
          />
          <FeatureCard
            icon={<Box className="h-8 w-8" />}
            title="Container Organization"
            description="Group items into containers for better organization and tracking of your inventory."
          />
          <FeatureCard
            icon={<ImageIcon className="h-8 w-8" />}
            title="Image Management"
            description="Upload and manage images for your items and containers. Visual inventory tracking made simple."
          />
        </div>

        {/* CTA Section - Only for Unauthenticated Users */}
        {!isAuthenticated && (
          <div className="text-center">
            <Card className="max-w-2xl mx-auto">
              <CardHeader>
                <CardTitle className="text-2xl">
                  Ready to organize your inventory?
                </CardTitle>
                <CardDescription className="text-lg">
                  Start managing your items, containers, and images today.
                  It&apos;s simple, fast, and free to get started.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <Link href="/signup">
                    <Button size="lg" className="w-full sm:w-auto">
                      Create Account
                    </Button>
                  </Link>
                  <Link href="/login">
                    <Button
                      variant="outline"
                      size="lg"
                      className="w-full sm:w-auto"
                    >
                      Sign In
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
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

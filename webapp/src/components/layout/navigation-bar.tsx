'use client';

import React from 'react';
import Link from 'next/link';
import { Menu, LogOut, Settings } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Image from 'next/image';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ModeToggle } from '@/components/mode-toggle';
import { cn } from '@/lib/utils';

interface NavigationBarProps {
  className?: string;
}

export function NavigationBar({ className }: NavigationBarProps) {
  const { user, isAuthenticated, logout, isLoading } = useAuth();

  // Helper function to get user initials for avatar fallback
  const getUserInitials = (name?: string, email?: string) => {
    if (name) {
      return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    if (email) {
      return email[0].toUpperCase();
    }
    return 'U';
  };

  const handleLogout = () => {
    logout();
  };

  // Navigation links for authenticated users
  const authenticatedLinks = [
    { href: '/inventory', label: 'Inventory' },
    { href: '/inventory/images', label: 'Images' },
    { href: '/profile', label: 'Profile', icon: Settings },
  ];

  // Navigation links for unauthenticated users
  const unauthenticatedLinks = [
    { href: '/login', label: 'Login' },
    { href: '/signup', label: 'Sign Up' },
  ];

  return (
    <header
      className={cn(
        'border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60',
        className
      )}
    >
      <div className="container flex h-14 items-center gap-2">
        {/* Logo/Brand */}
        <div className="flex min-w-0 flex-1 md:mr-4 md:flex-none">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-2 md:mr-6"
            aria-label="Inventory Ware home"
          >
            <Image
              src="/inventory-ware.png"
              alt=""
              width={48}
              height={48}
              className="h-8 w-8 shrink-0 md:h-12 md:w-12"
            />
            <span className="truncate text-base font-bold sm:text-xl">
              Inventory Ware
            </span>
          </Link>
        </div>

        {/* Desktop Navigation — breakpoints are CSS-driven so the correct nav
            paints on the first frame instead of swapping in after hydration. */}
        <div className="flex items-center justify-end gap-2 md:flex-1">
          <div className="hidden md:mr-auto md:block">
            <nav className="flex items-center space-x-6">
              <Link
                href="/inventory"
                className="text-sm font-medium transition-colors hover:text-primary"
              >
                Inventory
              </Link>
            </nav>
          </div>

          {/* Desktop Auth Navigation */}
          <nav className="hidden items-center gap-2 md:flex">
            <ModeToggle />
            {isLoading ? (
              <div className="h-8 w-20 animate-pulse bg-muted rounded" />
            ) : isAuthenticated ? (
              <div className="flex items-center gap-4">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      className="relative h-8 w-8 rounded-full"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={user?.avatar}
                          alt={user?.name || user?.email}
                        />
                        <AvatarFallback>
                          {getUserInitials(user?.name, user?.email)}
                        </AvatarFallback>
                      </Avatar>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56" align="end" forceMount>
                    <DropdownMenuLabel className="font-normal">
                      <div className="flex flex-col space-y-1">
                        <p className="text-sm font-medium leading-none">
                          {user?.name || 'User'}
                        </p>
                        <p className="text-xs leading-none text-muted-foreground">
                          {user?.email}
                        </p>
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {authenticatedLinks.map((link) => (
                      <DropdownMenuItem key={link.href} asChild>
                        <Link href={link.href} className="flex items-center">
                          {link.icon && <link.icon className="mr-2 h-4 w-4" />}
                          <span>{link.label}</span>
                        </Link>
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleLogout}>
                      <LogOut className="mr-2 h-4 w-4" />
                      <span>Log out</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="ghost" asChild>
                  <Link href="/login">Login</Link>
                </Button>
                <Button asChild>
                  <Link href="/signup">Sign Up</Link>
                </Button>
              </div>
            )}
          </nav>

          {/* Mobile Navigation */}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 hover:bg-transparent focus-visible:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 md:hidden"
              >
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle Menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[85vw] max-w-sm overflow-y-auto"
            >
              <SheetHeader>
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col space-y-4 p-4">
                <div className="flex justify-end">
                  <ModeToggle />
                </div>
                {isAuthenticated ? (
                  <>
                    <div className="flex items-center space-x-4 pb-4 border-b">
                      <Avatar className="h-12 w-12">
                        <AvatarImage
                          src={user?.avatar}
                          alt={user?.name || user?.email}
                        />
                        <AvatarFallback>
                          {getUserInitials(user?.name, user?.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <p className="text-sm font-medium">
                          {user?.name || 'User'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {user?.email}
                        </p>
                      </div>
                    </div>
                    {authenticatedLinks.map((link) => (
                      <Button
                        key={link.href}
                        variant="ghost"
                        className="justify-start"
                        asChild
                      >
                        <Link href={link.href}>
                          {link.icon && <link.icon className="mr-2 h-4 w-4" />}
                          {link.label}
                        </Link>
                      </Button>
                    ))}
                    <Button
                      variant="ghost"
                      className="justify-start"
                      onClick={handleLogout}
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Log out
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" className="justify-start" asChild>
                      <Link href="/inventory">Inventory</Link>
                    </Button>
                    <Button variant="ghost" className="justify-start" asChild>
                      <Link href="/inventory/images">Images</Link>
                    </Button>
                    {unauthenticatedLinks.map((link) => (
                      <Button
                        key={link.href}
                        variant="ghost"
                        className="justify-start"
                        asChild
                      >
                        <Link href={link.href}>{link.label}</Link>
                      </Button>
                    ))}
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

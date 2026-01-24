'use client';

import { ReactNode, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { InventoryProvider } from '@/contexts/inventory-context';
import { cn } from '@/lib/utils';
import { Package, Box, Image as ImageIcon } from 'lucide-react';

interface InventoryLayoutProps {
  children: ReactNode;
}

function InventoryNavigation() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get('tab');

  const navItems = [
    {
      href: '/inventory?tab=items',
      label: 'Items',
      icon: Package,
      isActive:
        pathname?.startsWith('/inventory/items') ||
        (pathname === '/inventory' && (currentTab === 'items' || !currentTab)),
    },
    {
      href: '/inventory?tab=containers',
      label: 'Containers',
      icon: Box,
      isActive:
        pathname?.startsWith('/inventory/containers') ||
        (pathname === '/inventory' && currentTab === 'containers'),
    },
    {
      href: '/inventory/images',
      label: 'Images',
      icon: ImageIcon,
      isActive: pathname?.startsWith('/inventory/images'),
    },
  ];

  return (
    <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container">
        <nav className="flex items-center space-x-3 sm:space-x-6 py-3 sm:py-4 overflow-x-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center space-x-2 text-xs sm:text-sm font-medium transition-colors hover:text-primary whitespace-nowrap',
                  item.isActive ? 'text-primary' : 'text-muted-foreground'
                )}
              >
                <Icon className="h-3 w-3 sm:h-4 sm:w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

export default function InventoryLayout({ children }: InventoryLayoutProps) {
  return (
    <InventoryProvider>
      <div className="min-h-screen bg-background">
        <Suspense fallback={<div className="h-14 border-b bg-background" />}>
          <InventoryNavigation />
        </Suspense>
        {/* Main content */}
        <div className="container py-4 sm:py-6">{children}</div>
      </div>
    </InventoryProvider>
  );
}

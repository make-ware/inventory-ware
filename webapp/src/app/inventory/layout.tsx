'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { InventoryProvider } from '@/contexts/inventory-context';
import { cn } from '@/lib/utils';
import { Package, Box } from 'lucide-react';

interface InventoryLayoutProps {
  children: ReactNode;
}

export default function InventoryLayout({ children }: InventoryLayoutProps) {
  const pathname = usePathname();

  const navItems = [
    {
      href: '/inventory',
      label: 'All',
      icon: Package,
      isActive: pathname === '/inventory',
    },
    {
      href: '/inventory/items',
      label: 'Items',
      icon: Package,
      isActive: pathname?.startsWith('/inventory/items'),
    },
    {
      href: '/inventory/containers',
      label: 'Containers',
      icon: Box,
      isActive: pathname?.startsWith('/inventory/containers'),
    },
  ];

  return (
    <InventoryProvider>
      <div className="min-h-screen bg-background">
        {/* Sub-navigation */}
        <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container">
            <nav className="flex items-center space-x-6 py-4">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center space-x-2 text-sm font-medium transition-colors hover:text-primary',
                      item.isActive ? 'text-primary' : 'text-muted-foreground'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Main content */}
        <div className="container py-6">{children}</div>
      </div>
    </InventoryProvider>
  );
}

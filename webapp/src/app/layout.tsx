import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/contexts/auth-context';
import { UploadProvider } from '@/contexts/upload-context';
import { NavigationBar } from '@/components/layout/navigation-bar';
import { UploadTracker } from '@/components/inventory/upload-tracker';
import { Toaster } from '@/components/ui/sonner';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Inventory Ware',
  description: 'A modern inventory management system with authentication',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          <UploadProvider>
            <NavigationBar />
            <main className="min-h-screen">{children}</main>
            <UploadTracker />
            <Toaster />
          </UploadProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

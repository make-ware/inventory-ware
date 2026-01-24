'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

function InventoryRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'containers') {
      router.replace('/inventory/containers');
    } else {
      router.replace('/inventory/items');
    }
  }, [router, searchParams]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export default function InventoryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <InventoryRedirect />
    </Suspense>
  );
}

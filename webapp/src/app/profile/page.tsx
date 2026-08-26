'use client';

import { useAuth } from '@/hooks/use-auth';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { ProfileForm } from '@/components/auth/profile-form';
import { Skeleton } from '@/components/ui/skeleton';

function ProfileSkeleton() {
  return (
    <div className="container py-8 max-w-2xl">
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    </div>
  );
}

function ProfileContent() {
  const { user } = useAuth();

  // ProtectedRoute has already settled `isLoading` and `isAuthenticated`; this
  // only covers the window where the record itself has not landed yet.
  if (!user) {
    return <ProfileSkeleton />;
  }

  return (
    <div className="container py-8 max-w-2xl">
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
          <p className="text-gray-600">
            Manage your account settings and preferences.
          </p>
        </div>

        <ProfileForm />
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <ProtectedRoute fallback={<ProfileSkeleton />}>
      <ProfileContent />
    </ProtectedRoute>
  );
}

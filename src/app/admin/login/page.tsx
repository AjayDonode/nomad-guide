
'use client';

import { Suspense } from 'react';
import LoginPage from '@/app/login/page';
import { Loader2 } from 'lucide-react';

export default function AdminLoginPage() {
  return (
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    }>
      <LoginPage />
    </Suspense>
  );
}

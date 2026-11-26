'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SignInForm } from '../../components/auth/SignInForm';
import { useSessionSync } from '../../context/SessionSyncContext';

export default function SignInPage() {
  const router = useRouter();
  const { sessionSnapshot } = useSessionSync();

  useEffect(() => {
    if (sessionSnapshot.state === 'signedIn') {
      router.replace('/');
    }
  }, [sessionSnapshot.state, router]);

  return (
    <div className="min-h-[calc(100vh-140px)] flex items-center justify-center py-8 px-4">
      <SignInForm onSuccess={() => router.replace('/')} />
    </div>
  );
}

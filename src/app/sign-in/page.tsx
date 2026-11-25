'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { SignInForm } from '../../components/auth/SignInForm';

export default function SignInPage() {
  const router = useRouter();

  return (
    <div className="min-h-[calc(100vh-140px)] flex items-center justify-center py-8 px-4">
      <SignInForm onSuccess={() => router.push('/')} />
    </div>
  );
}

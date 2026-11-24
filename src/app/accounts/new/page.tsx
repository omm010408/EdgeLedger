'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { AddAccountForm } from '@/components/accounts/AddAccountForm';

export default function NewAccountPage() {
  const router = useRouter();

  return (
    <div className="w-full">
      <AddAccountForm
        isModal={false}
        onCancel={() => router.push('/accounts')}
        onSuccess={() => router.push('/accounts')}
      />
    </div>
  );
}

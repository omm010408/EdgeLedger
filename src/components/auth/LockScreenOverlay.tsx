'use client';

import React from 'react';
import { useSessionSync } from '../../context/SessionSyncContext';
import { SignInForm } from './SignInForm';

export const LockScreenOverlay: React.FC = () => {
  const { sessionSnapshot } = useSessionSync();

  if (sessionSnapshot.state !== 'locked') return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Session locked"
    >
      <SignInForm mode="resume" />
    </div>
  );
};

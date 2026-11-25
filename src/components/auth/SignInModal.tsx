'use client';

import React from 'react';
import { useSessionSync } from '../../context/SessionSyncContext';
import { SignInForm } from './SignInForm';

export const SignInModal: React.FC = () => {
  const { isSignInModalOpen, closeSignInModal } = useSessionSync();

  if (!isSignInModalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Sign in"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSignInModal();
      }}
    >
      <SignInForm onSuccess={closeSignInModal} onCancel={closeSignInModal} />
    </div>
  );
};

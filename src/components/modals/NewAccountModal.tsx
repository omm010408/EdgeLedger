'use client';

import React, { useEffect } from 'react';
import { AddAccountForm } from '../accounts/AddAccountForm';

interface NewAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const NewAccountModal: React.FC<NewAccountModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  useEffect(() => {
    if (isOpen) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 md:p-6 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-6xl max-h-[94vh] overflow-y-auto rounded-[32px] border border-[var(--line)] bg-[var(--tile)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <AddAccountForm
          isModal={true}
          onCancel={onClose}
          onSuccess={() => {
            if (onSuccess) onSuccess();
            onClose();
          }}
        />
      </div>
    </div>
  );
};

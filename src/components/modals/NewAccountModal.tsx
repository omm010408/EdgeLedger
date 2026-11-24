'use client';

import React from 'react';
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
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md p-4 sm:p-6 md:p-8 flex justify-center items-start pt-6 sm:pt-10 pb-16"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-6xl">
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

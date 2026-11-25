'use client';

import React, { useState, useEffect } from 'react';
import { Trash2, Check } from 'lucide-react';

interface DeleteConfirmButtonProps {
  onConfirm: () => void;
  variant?: 'icon' | 'pill' | 'button';
  label?: string;
  confirmLabel?: string;
  title?: string;
  ariaLabel?: string;
  className?: string;
  size?: number;
}

/**
 * Two-step inline delete button that prevents accidental deletion without
 * disrupting UI flow with native browser confirm dialogs.
 */
export const DeleteConfirmButton: React.FC<DeleteConfirmButtonProps> = ({
  onConfirm,
  variant = 'icon',
  label = 'Delete',
  confirmLabel = 'Confirm?',
  title = 'Delete item',
  ariaLabel,
  className = '',
  size = 14,
}) => {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(timer);
  }, [confirming]);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    onConfirm();
  };

  if (variant === 'button') {
    return (
      <button
        type="button"
        onClick={handleClick}
        onBlur={() => setConfirming(false)}
        title={confirming ? 'Click again to confirm deletion' : title}
        aria-label={confirming ? confirmLabel : ariaLabel || title}
        className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer border ${
          confirming
            ? 'bg-[var(--tw-loss)] text-white border-[var(--tw-loss)] shadow-sm'
            : 'bg-transparent text-[var(--tw-loss)] border-[var(--tw-loss)]/40 hover:bg-[var(--tw-loss)]/15'
        } ${className}`}
      >
        {confirming ? <Check size={size} /> : <Trash2 size={size} />}
        <span>{confirming ? confirmLabel : label}</span>
      </button>
    );
  }

  if (variant === 'pill') {
    return (
      <button
        type="button"
        onClick={handleClick}
        onBlur={() => setConfirming(false)}
        title={confirming ? 'Click again to confirm deletion' : title}
        aria-label={confirming ? confirmLabel : ariaLabel || title}
        className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer border ${
          confirming
            ? 'bg-[var(--tw-loss)] text-white border-[var(--tw-loss)] shadow-sm'
            : 'bg-[var(--tw-pill)] text-[var(--tw-ink-2)] border-[var(--tw-line)] hover:text-[var(--tw-loss)] hover:border-[var(--tw-loss)]/60'
        } ${className}`}
      >
        {confirming ? <Check size={size - 1} /> : <Trash2 size={size - 1} />}
        <span>{confirming ? confirmLabel : label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onBlur={() => setConfirming(false)}
      title={confirming ? 'Click again to confirm deletion' : title}
      aria-label={ariaLabel || title}
      className={`inline-flex items-center justify-center transition-all cursor-pointer ${
        confirming
          ? 'px-2 h-7 rounded-full bg-[var(--tw-loss)] text-white text-[10px] font-bold gap-1 shadow-sm'
          : 'p-1.5 rounded-full text-[var(--tw-ink-3)] hover:text-[var(--tw-loss)] hover:bg-[var(--tw-loss)]/10'
      } ${className}`}
    >
      {confirming ? (
        <>
          <Check size={size - 1} />
          <span>{confirmLabel}</span>
        </>
      ) : (
        <Trash2 size={size} />
      )}
    </button>
  );
};

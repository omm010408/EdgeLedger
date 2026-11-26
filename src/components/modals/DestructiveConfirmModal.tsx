'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';

export interface DestructiveConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  entityName: string;
  confirmPhrase: string;
  confirmButtonLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Vercel-inspired two-step typed confirmation modal for irreversible
 * destructive actions such as deleting a trading account or strategy.
 */
export const DestructiveConfirmModal: React.FC<DestructiveConfirmModalProps> = ({
  isOpen,
  title,
  description,
  entityName,
  confirmPhrase,
  confirmButtonLabel,
  onConfirm,
  onClose,
}) => {
  const [nameInput, setNameInput] = useState('');
  const [phraseInput, setPhraseInput] = useState('');
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setNameInput('');
    setPhraseInput('');
    const frame = requestAnimationFrame(() => {
      firstInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen, entityName, confirmPhrase]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isNameMatch = nameInput.trim() === entityName.trim();
  const isPhraseMatch =
    phraseInput.trim().toLowerCase() === confirmPhrase.trim().toLowerCase();
  const canConfirm = isNameMatch && isPhraseMatch;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canConfirm) return;
    onConfirm();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="destructive-confirm-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        noValidate
        className="w-full max-w-[460px] rounded-[24px] border border-[var(--tw-line-strong)] bg-[var(--tw-tile)] text-[var(--tw-ink)] p-6 shadow-2xl space-y-5"
      >
        <div className="flex items-start justify-between gap-3">
          <h2
            id="destructive-confirm-title"
            className="text-[20px] font-bold tracking-tight m-0 text-[var(--tw-ink)]"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close confirmation dialog"
            className="w-8 h-8 rounded-full flex items-center justify-center border border-[var(--tw-line)] text-[var(--tw-ink-2)] hover:text-[var(--tw-ink)] hover:bg-[var(--tw-pill)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <p className="text-[14px] leading-relaxed m-0 text-[var(--tw-ink-2)]">
          {description}
        </p>

        <div className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="destructive-confirm-name"
              className="block text-[13px] text-[var(--tw-ink-2)]"
            >
              To confirm, type{' '}
              <strong className="font-semibold text-[var(--tw-ink)]">
                &ldquo;{entityName}&rdquo;
              </strong>
            </label>
            <input
              ref={firstInputRef}
              id="destructive-confirm-name"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder={entityName}
              className="w-full rounded-xl px-3.5 py-2.5 text-[14px] font-mono bg-[var(--tw-field,var(--tw-pill))] border border-[var(--tw-line-strong)] text-[var(--tw-ink)] outline-none focus:ring-2 focus:ring-[var(--tw-focus)]"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="destructive-confirm-phrase"
              className="block text-[13px] text-[var(--tw-ink-2)]"
            >
              To confirm, type{' '}
              <strong className="font-semibold text-[var(--tw-ink)]">
                &ldquo;{confirmPhrase}&rdquo;
              </strong>
            </label>
            <input
              id="destructive-confirm-phrase"
              type="text"
              autoComplete="off"
              spellCheck={false}
              value={phraseInput}
              onChange={(e) => setPhraseInput(e.target.value)}
              placeholder={confirmPhrase}
              className="w-full rounded-xl px-3.5 py-2.5 text-[14px] font-mono bg-[var(--tw-field,var(--tw-pill))] border border-[var(--tw-line-strong)] text-[var(--tw-ink)] outline-none focus:ring-2 focus:ring-[var(--tw-focus)]"
            />
          </div>
        </div>

        <div
          role="alert"
          className="flex items-center gap-2.5 rounded-xl px-3.5 py-3 text-[13px] font-medium border border-[var(--tw-loss)]/45 bg-[var(--tw-loss-bg)] text-[var(--tw-loss)]"
        >
          <AlertCircle size={16} className="shrink-0" aria-hidden="true" />
          <span>Deleting {entityName} cannot be undone.</span>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-[13px] font-semibold border border-[var(--tw-line-strong)] bg-[var(--tw-tile)] text-[var(--tw-ink)] hover:bg-[var(--tw-pill)] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canConfirm}
            className={`px-4 py-2 rounded-xl text-[13px] font-semibold border transition-all ${
              canConfirm
                ? 'bg-[var(--tw-loss)] border-[var(--tw-loss)] text-white hover:brightness-95 cursor-pointer shadow-sm'
                : 'bg-[var(--tw-pill)] border-[var(--tw-line)] text-[var(--tw-ink-3)] opacity-55 cursor-not-allowed'
            }`}
          >
            {confirmButtonLabel}
          </button>
        </div>
      </form>
    </div>
  );
};

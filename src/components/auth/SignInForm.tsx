'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, Eye, EyeOff, Lock } from 'lucide-react';
import { useSessionSync } from '../../context/SessionSyncContext';
import { EdgeLedgerLogo } from '../ui/EdgeLedgerLogo';

interface SignInFormProps {
  mode?: 'session' | 'resume';
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const SignInForm: React.FC<SignInFormProps> = ({
  mode = 'session',
  onSuccess,
  onCancel,
}) => {
  const { signIn, unlockSession, sessionSnapshot } = useSessionSync();
  const baseId = useId();
  const pinId = `${baseId}-pin`;
  const errorBannerId = `${baseId}-error`;

  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasFieldError, setHasFieldError] = useState(false);

  const pinRef = useRef<HTMLInputElement>(null);
  const isBusy = mode === 'session' && sessionSnapshot.state === 'signingIn';

  useEffect(() => {
    pinRef.current?.focus();
  }, []);

  useEffect(() => {
    if (mode === 'session' && sessionSnapshot.state === 'signedOut' && sessionSnapshot.error) {
      setErrorMessage(sessionSnapshot.error);
    }
    if (mode === 'resume') {
      if (sessionSnapshot.state === 'locked') {
        pinRef.current?.focus();
      } else {
        setPin('');
        setErrorMessage(null);
        setHasFieldError(false);
      }
    }
  }, [mode, sessionSnapshot.state, sessionSnapshot.error]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedPin = pin.trim();

    if (!trimmedPin) {
      setHasFieldError(true);
      setErrorMessage('Enter lock PIN.');
      pinRef.current?.focus();
      return;
    }

    setHasFieldError(false);
    setErrorMessage(null);

    const ok =
      mode === 'resume'
        ? await unlockSession({ method: 'passcode', passcode: trimmedPin })
        : await signIn({ method: 'passcode', passcode: trimmedPin });

    if (ok) {
      setPin('');
      setErrorMessage(null);
      setHasFieldError(false);
      onSuccess?.();
    } else {
      setHasFieldError(true);
      setErrorMessage('Incorrect lock PIN.');
      pinRef.current?.focus();
    }
  };

  return (
    <div
      className="w-full max-w-sm rounded-[32px] p-6 sm:p-7"
      style={{
        background: 'var(--tw-tile)',
        color: 'var(--tw-ink)',
        border: '1px solid var(--tw-line-strong)',
        boxShadow: 'var(--tw-shadow-dropdown)',
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          {mode === 'resume' ? (
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'var(--tw-pill)', color: 'var(--tw-ink)' }}
            >
              <Lock size={18} aria-hidden="true" />
            </div>
          ) : (
            <EdgeLedgerLogo size={32} />
          )}
          <div>
            <h1 className="text-lg font-bold tracking-tight" style={{ color: 'var(--tw-ink)' }}>
              Desk locked
            </h1>
            <p className="text-xs" style={{ color: 'var(--tw-ink-2)' }}>
              {mode === 'resume'
                ? 'Enter lock PIN to resume your session'
                : 'Enter lock PIN to unlock EdgeLedger'}
            </p>
          </div>
        </div>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded-full text-xs font-medium"
            style={{
              border: '1px solid var(--tw-line-strong)',
              color: 'var(--tw-ink-2)',
              background: 'var(--tw-tile)',
            }}
          >
            Close
          </button>
        )}
      </div>

      <div
        id={errorBannerId}
        role="alert"
        aria-live="assertive"
        className={errorMessage ? 'mb-4 p-3 rounded-2xl flex items-start gap-2 text-xs' : 'sr-only'}
        style={
          errorMessage
            ? {
                color: 'var(--tw-loss)',
                background: 'color-mix(in srgb, var(--tw-loss) 12%, var(--tw-tile))',
                border: '1px solid color-mix(in srgb, var(--tw-loss) 45%, transparent)',
              }
            : undefined
        }
      >
        {errorMessage && (
          <>
            <AlertCircle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
            <span>{errorMessage}</span>
          </>
        )}
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label
            htmlFor={pinId}
            className="block text-xs font-semibold mb-1.5"
            style={{ color: 'var(--tw-ink-2)' }}
          >
            Lock PIN
          </label>
          <div className="relative">
            <Lock
              size={15}
              aria-hidden="true"
              className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--tw-ink-3)' }}
            />
            <input
              ref={pinRef}
              id={pinId}
              type={showPin ? 'text' : 'password'}
              inputMode="numeric"
              autoComplete="off"
              required
              aria-invalid={hasFieldError}
              aria-describedby={hasFieldError ? errorBannerId : undefined}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                if (errorMessage) setErrorMessage(null);
                if (hasFieldError) setHasFieldError(false);
              }}
              placeholder="Enter lock PIN"
              className="w-full h-11 pl-10 pr-10 rounded-2xl text-sm font-mono tracking-widest"
              style={{
                background: 'var(--tw-bg)',
                color: 'var(--tw-ink)',
                border: `1px solid ${hasFieldError ? 'var(--tw-loss)' : 'var(--tw-line-strong)'}`,
              }}
            />
            <button
              type="button"
              onClick={() => setShowPin((prev) => !prev)}
              aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:opacity-80"
              style={{ color: 'var(--tw-ink-3)' }}
            >
              {showPin ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isBusy}
          className="w-full h-11 rounded-full text-sm font-semibold transition-colors disabled:opacity-60"
          style={{
            background: 'var(--tw-hero)',
            color: 'var(--tw-hero-ink)',
            border: '1px solid var(--tw-hero)',
          }}
        >
          {isBusy ? 'Unlocking...' : 'Unlock desk'}
        </button>
      </form>
    </div>
  );
};

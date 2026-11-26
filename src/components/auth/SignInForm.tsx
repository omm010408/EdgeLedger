'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { KeyRound, Mail, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useSessionSync } from '../../context/SessionSyncContext';
import { EdgeLedgerLogo } from '../ui/EdgeLedgerLogo';

interface SignInFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const SignInForm: React.FC<SignInFormProps> = ({ onSuccess, onCancel }) => {
  const { signIn, sessionSnapshot } = useSessionSync();
  const baseId = useId();
  const emailId = `${baseId}-email`;
  const passwordId = `${baseId}-password`;
  const errorBannerId = `${baseId}-error`;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showEmail, setShowEmail] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const isBusy = sessionSnapshot.state === 'signingIn';

  useEffect(() => {
    if (sessionSnapshot.error && !errorMessage) {
      setErrorMessage(sessionSnapshot.error);
    }
  }, [sessionSnapshot.error, errorMessage]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: { email?: string; password?: string } = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errs.email = 'Enter a valid email address.';
    }
    if (!password || password.length < 6) {
      errs.password = 'Enter a password of at least 6 characters.';
    }

    if (errs.email || errs.password) {
      setFieldErrors(errs);
      setErrorMessage(errs.email || errs.password || 'Check highlighted fields.');
      if (errs.email) {
        emailRef.current?.focus();
      } else if (errs.password) {
        passwordRef.current?.focus();
      }
      return;
    }

    setFieldErrors({});
    setErrorMessage(null);
    const ok = await signIn({ email: trimmedEmail, password, method: 'password' });
    if (ok) {
      onSuccess?.();
    } else {
      setErrorMessage('Invalid email or password. Please verify and try again.');
      passwordRef.current?.focus();
    }
  };

  return (
    <div
      className="w-full max-w-md rounded-[32px] p-6 sm:p-7"
      style={{
        background: 'var(--tw-tile)',
        color: 'var(--tw-ink)',
        border: '1px solid var(--tw-line-strong)',
        boxShadow: 'var(--tw-shadow-dropdown)',
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <EdgeLedgerLogo size={32} />
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--tw-ink)' }}>
              Sign in to EdgeLedger
            </h1>
            <p className="text-xs" style={{ color: 'var(--tw-ink-2)' }}>
              4-hour JWT session authentication
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

      {/* Live Error Region */}
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

      <form onSubmit={handlePasswordSubmit} noValidate className="space-y-4">
        <div>
          <label
            htmlFor={emailId}
            className="block text-xs font-semibold mb-1.5"
            style={{ color: 'var(--tw-ink-2)' }}
          >
            Email address
          </label>
          <div className="relative">
            <Mail
              size={15}
              aria-hidden="true"
              className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--tw-ink-3)' }}
            />
            <input
              ref={emailRef}
              id={emailId}
              type={showEmail ? 'text' : 'password'}
              inputMode="email"
              autoComplete="off"
              required
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? errorBannerId : undefined}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="w-full h-11 pl-10 pr-10 rounded-2xl text-sm"
              style={{
                background: 'var(--tw-bg)',
                color: 'var(--tw-ink)',
                border: `1px solid ${fieldErrors.email ? 'var(--tw-loss)' : 'var(--tw-line-strong)'}`,
              }}
            />
            <button
              type="button"
              onClick={() => setShowEmail((prev) => !prev)}
              aria-label={showEmail ? 'Hide email' : 'Show email'}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:opacity-80"
              style={{ color: 'var(--tw-ink-3)' }}
            >
              {showEmail ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
            </button>
          </div>
        </div>

        <div>
          <label
            htmlFor={passwordId}
            className="block text-xs font-semibold mb-1.5"
            style={{ color: 'var(--tw-ink-2)' }}
          >
            Password
          </label>
          <div className="relative">
            <KeyRound
              size={15}
              aria-hidden="true"
              className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--tw-ink-3)' }}
            />
            <input
              ref={passwordRef}
              id={passwordId}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              aria-invalid={Boolean(fieldErrors.password)}
              aria-describedby={fieldErrors.password ? errorBannerId : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full h-11 pl-10 pr-10 rounded-2xl text-sm"
              style={{
                background: 'var(--tw-bg)',
                color: 'var(--tw-ink)',
                border: `1px solid ${fieldErrors.password ? 'var(--tw-loss)' : 'var(--tw-line-strong)'}`,
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:opacity-80"
              style={{ color: 'var(--tw-ink-3)' }}
            >
              {showPassword ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}
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
          {isBusy ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
};

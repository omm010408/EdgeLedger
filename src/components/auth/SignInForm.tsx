'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { Fingerprint, KeyRound, Lock, Mail, AlertCircle } from 'lucide-react';
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
  const passkeyEmailId = `${baseId}-passkey-email`;
  const passkeyTokenId = `${baseId}-passkey-cred`;
  const errorBannerId = `${baseId}-error`;

  const [mode, setMode] = useState<'password' | 'passkey'>('password');
  const [email, setEmail] = useState('trader@edgeledger.io');
  const [password, setPassword] = useState('');
  const [passkeyCredentialId, setPasskeyCredentialId] = useState('pk-edgeledger-device-1');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string; passkey?: string }>({});

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const passkeyEmailRef = useRef<HTMLInputElement>(null);
  const passkeyCredRef = useRef<HTMLInputElement>(null);

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

  const handlePasskeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: { email?: string; passkey?: string } = {};
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errs.email = 'Enter the account email associated with your passkey.';
    }
    if (!passkeyCredentialId || passkeyCredentialId.trim().length < 6) {
      errs.passkey = 'Passkey credential identifier must be at least 6 characters.';
    }

    if (errs.email || errs.passkey) {
      setFieldErrors(errs);
      setErrorMessage(errs.email || errs.passkey || 'Passkey verification failed.');
      if (errs.email) {
        passkeyEmailRef.current?.focus();
      } else if (errs.passkey) {
        passkeyCredRef.current?.focus();
      }
      return;
    }

    setFieldErrors({});
    setErrorMessage(null);
    const ok = await signIn({
      email: trimmedEmail,
      method: 'passkey',
      credentialId: passkeyCredentialId.trim(),
    });
    if (ok) {
      onSuccess?.();
    } else {
      setErrorMessage('Passkey assertion failed. Confirm your credential and retry.');
      passkeyCredRef.current?.focus();
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
              HttpOnly session authentication &amp; scoped sync
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

      {/* Mode Selector: Email + Password vs Passkey */}
      <div
        className="grid grid-cols-2 gap-1.5 p-1 rounded-full mb-5"
        role="tablist"
        aria-label="Authentication method"
        style={{ background: 'var(--tw-pill)' }}
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'password'}
          onClick={() => {
            setMode('password');
            setErrorMessage(null);
            setFieldErrors({});
          }}
          className="flex items-center justify-center gap-1.5 h-9 rounded-full text-xs font-semibold transition-colors"
          style={
            mode === 'password'
              ? {
                  background: 'var(--tw-tile)',
                  color: 'var(--tw-ink)',
                  border: '1px solid var(--tw-line-strong)',
                }
              : { color: 'var(--tw-ink-2)' }
          }
        >
          <Lock size={14} aria-hidden="true" />
          <span>Email &amp; password</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={mode === 'passkey'}
          onClick={() => {
            setMode('passkey');
            setErrorMessage(null);
            setFieldErrors({});
          }}
          className="flex items-center justify-center gap-1.5 h-9 rounded-full text-xs font-semibold transition-colors"
          style={
            mode === 'passkey'
              ? {
                  background: 'var(--tw-tile)',
                  color: 'var(--tw-ink)',
                  border: '1px solid var(--tw-line-strong)',
                }
              : { color: 'var(--tw-ink-2)' }
          }
        >
          <Fingerprint size={14} aria-hidden="true" />
          <span>Passkey</span>
        </button>
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

      {mode === 'password' ? (
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
                type="email"
                autoComplete="email"
                required
                aria-invalid={Boolean(fieldErrors.email)}
                aria-describedby={fieldErrors.email ? errorBannerId : undefined}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="trader@edgeledger.io"
                className="w-full h-11 pl-10 pr-3.5 rounded-2xl text-sm"
                style={{
                  background: 'var(--tw-bg)',
                  color: 'var(--tw-ink)',
                  border: `1px solid ${fieldErrors.email ? 'var(--tw-loss)' : 'var(--tw-line-strong)'}`,
                }}
              />
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
                type="password"
                autoComplete="current-password"
                required
                aria-invalid={Boolean(fieldErrors.password)}
                aria-describedby={fieldErrors.password ? errorBannerId : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full h-11 pl-10 pr-3.5 rounded-2xl text-sm"
                style={{
                  background: 'var(--tw-bg)',
                  color: 'var(--tw-ink)',
                  border: `1px solid ${fieldErrors.password ? 'var(--tw-loss)' : 'var(--tw-line-strong)'}`,
                }}
              />
            </div>
          </div>

          <p className="text-xs" style={{ color: 'var(--tw-ink-3)' }}>
            Demo workspace credential: <span className="font-mono">trader@edgeledger.io</span> /{' '}
            <span className="font-mono">EdgeLedger!2026</span>
          </p>

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
      ) : (
        <form onSubmit={handlePasskeySubmit} noValidate className="space-y-4">
          <div>
            <label
              htmlFor={passkeyEmailId}
              className="block text-xs font-semibold mb-1.5"
              style={{ color: 'var(--tw-ink-2)' }}
            >
              Account email
            </label>
            <input
              ref={passkeyEmailRef}
              id={passkeyEmailId}
              type="email"
              autoComplete="username webauthn"
              required
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? errorBannerId : undefined}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-11 px-3.5 rounded-2xl text-sm"
              style={{
                background: 'var(--tw-bg)',
                color: 'var(--tw-ink)',
                border: `1px solid ${fieldErrors.email ? 'var(--tw-loss)' : 'var(--tw-line-strong)'}`,
              }}
            />
          </div>

          <div>
            <label
              htmlFor={passkeyTokenId}
              className="block text-xs font-semibold mb-1.5"
              style={{ color: 'var(--tw-ink-2)' }}
            >
              Passkey credential ID
            </label>
            <input
              ref={passkeyCredRef}
              id={passkeyTokenId}
              type="text"
              required
              aria-invalid={Boolean(fieldErrors.passkey)}
              aria-describedby={fieldErrors.passkey ? errorBannerId : undefined}
              value={passkeyCredentialId}
              onChange={(e) => setPasskeyCredentialId(e.target.value)}
              className="w-full h-11 px-3.5 rounded-2xl text-sm font-mono"
              style={{
                background: 'var(--tw-bg)',
                color: 'var(--tw-ink)',
                border: `1px solid ${fieldErrors.passkey ? 'var(--tw-loss)' : 'var(--tw-line-strong)'}`,
              }}
            />
          </div>

          <button
            type="submit"
            disabled={isBusy}
            className="w-full h-11 rounded-full text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
            style={{
              background: 'var(--tw-hero)',
              color: 'var(--tw-hero-ink)',
              border: '1px solid var(--tw-hero)',
            }}
          >
            <Fingerprint size={16} aria-hidden="true" />
            <span>{isBusy ? 'Verifying passkey...' : 'Continue with passkey'}</span>
          </button>
        </form>
      )}
    </div>
  );
};

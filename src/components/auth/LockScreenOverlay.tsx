'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { Lock, LogOut } from 'lucide-react';
import { useSessionSync } from '../../context/SessionSyncContext';

export const LockScreenOverlay: React.FC = () => {
  const {
    sessionSnapshot,
    unlockSession,
    requestSignOut,
  } = useSessionSync();

  const passcodeId = useId();
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (sessionSnapshot.state === 'locked') {
      inputRef.current?.focus();
    } else {
      setPasscode('');
      setError(null);
    }
  }, [sessionSnapshot.state]);

  if (sessionSnapshot.state !== 'locked') return null;

  const handlePasscodeUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await unlockSession({ method: 'passcode', passcode });
    if (!ok) {
      setError('Incorrect passcode.');
      inputRef.current?.focus();
    } else {
      setPasscode('');
      setError(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label="Session locked"
    >
      <div
        className="w-full max-w-sm rounded-[32px] p-6 space-y-4"
        style={{
          background: 'var(--tw-tile)',
          color: 'var(--tw-ink)',
          border: '1px solid var(--tw-line-strong)',
          boxShadow: 'var(--tw-shadow-dropdown)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: 'var(--tw-pill)', color: 'var(--tw-ink)' }}
          >
            <Lock size={18} aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Desk locked</h2>
            <p className="text-xs" style={{ color: 'var(--tw-ink-2)' }}>
              UI lock for {sessionSnapshot.session?.email || 'active session'}. Unlock resumes session.
            </p>
          </div>
        </div>

        <div role="alert" aria-live="assertive" className={error ? 'text-xs' : 'sr-only'} style={{ color: 'var(--tw-loss)' }}>
          {error}
        </div>

        <form onSubmit={handlePasscodeUnlock} className="space-y-3">
          <div>
            <label htmlFor={passcodeId} className="block text-xs font-semibold mb-1" style={{ color: 'var(--tw-ink-2)' }}>
              Unlock passcode
            </label>
            <input
              ref={inputRef}
              id={passcodeId}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={passcode}
              onChange={(e) => {
                setPasscode(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Enter unlock passcode"
              className="w-full h-11 px-3.5 rounded-2xl text-sm font-mono tracking-widest"
              style={{
                background: 'var(--tw-bg)',
                color: 'var(--tw-ink)',
                border: '1px solid var(--tw-line-strong)',
              }}
            />
          </div>
          <button
            type="submit"
            className="w-full h-10 rounded-full text-xs font-semibold"
            style={{ background: 'var(--tw-hero)', color: 'var(--tw-hero-ink)' }}
          >
            Unlock with passcode
          </button>
        </form>

        <div className="pt-1">
          <button
            type="button"
            onClick={() => void requestSignOut()}
            className="w-full h-10 px-4 rounded-full text-xs font-semibold inline-flex items-center justify-center gap-1.5"
            style={{
              color: 'var(--tw-loss)',
              border: '1px solid color-mix(in srgb, var(--tw-loss) 45%, transparent)',
            }}
          >
            <LogOut size={14} aria-hidden="true" />
            <span>Sign out</span>
          </button>
        </div>
      </div>
    </div>
  );
};

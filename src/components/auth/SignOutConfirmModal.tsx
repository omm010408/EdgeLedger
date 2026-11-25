'use client';

import React from 'react';
import { AlertTriangle, Download, LogOut } from 'lucide-react';
import { useSessionSync } from '../../context/SessionSyncContext';

export const SignOutConfirmModal: React.FC = () => {
  const {
    sessionSnapshot,
    exportPendingOutbox,
    confirmSignOutAndClear,
    cancelSignOut,
  } = useSessionSync();

  const pendingCount = sessionSnapshot.pendingOutboxWarningCount;
  if (!pendingCount || pendingCount <= 0) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Pending sync items warning"
    >
      <div
        className="w-full max-w-md rounded-[32px] p-6 space-y-4"
        style={{
          background: 'var(--tw-tile)',
          color: 'var(--tw-ink)',
          border: '1px solid var(--tw-line-strong)',
          boxShadow: 'var(--tw-shadow-dropdown)',
        }}
      >
        <div className="flex items-start gap-3">
          <AlertTriangle size={22} className="shrink-0 mt-0.5" style={{ color: 'var(--tw-warn)' }} aria-hidden="true" />
          <div>
            <h2 className="text-lg font-bold">
              {pendingCount} unsynced {pendingCount === 1 ? 'change' : 'changes'} in outbox
            </h2>
            <p className="text-xs mt-1" style={{ color: 'var(--tw-ink-2)' }}>
              Signing out clears your local IndexedDB cache and outbox for this device. Export your pending changes first so nothing is lost.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            onClick={() => void exportPendingOutbox()}
            className="w-full h-10 rounded-full text-xs font-semibold inline-flex items-center justify-center gap-2"
            style={{
              background: 'var(--tw-hero)',
              color: 'var(--tw-hero-ink)',
            }}
          >
            <Download size={14} aria-hidden="true" />
            <span>Export pending items (JSON)</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={cancelSignOut}
              className="flex-1 h-10 rounded-full text-xs font-semibold"
              style={{
                background: 'var(--tw-pill)',
                color: 'var(--tw-ink)',
                border: '1px solid var(--tw-line-strong)',
              }}
            >
              Keep session
            </button>
            <button
              type="button"
              onClick={() => void confirmSignOutAndClear()}
              className="flex-1 h-10 rounded-full text-xs font-semibold inline-flex items-center justify-center gap-1.5"
              style={{
                background: 'color-mix(in srgb, var(--tw-loss) 14%, var(--tw-tile))',
                color: 'var(--tw-loss)',
                border: '1px solid color-mix(in srgb, var(--tw-loss) 45%, transparent)',
              }}
            >
              <LogOut size={14} aria-hidden="true" />
              <span>Clear &amp; sign out</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

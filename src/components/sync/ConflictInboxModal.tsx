'use client';

import React from 'react';
import { AlertCircle, Check, RotateCcw, X } from 'lucide-react';
import { useSessionSync } from '../../context/SessionSyncContext';

export const ConflictInboxModal: React.FC = () => {
  const {
    isConflictInboxOpen,
    closeConflictInbox,
    syncSnapshot,
    resolveConflictKeepRemote,
    resolveConflictRetryLocal,
  } = useSessionSync();

  if (!isConflictInboxOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Sync conflict inbox"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeConflictInbox();
      }}
    >
      <div
        className="w-full max-w-3xl max-h-[85vh] overflow-y-auto rounded-[32px] p-6 space-y-4"
        style={{
          background: 'var(--tw-tile)',
          color: 'var(--tw-ink)',
          border: '1px solid var(--tw-line-strong)',
          boxShadow: 'var(--tw-shadow-dropdown)',
        }}
      >
        <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: 'var(--tw-line)' }}>
          <div className="flex items-center gap-2.5">
            <AlertCircle size={18} style={{ color: 'var(--tw-loss)' }} aria-hidden="true" />
            <div>
              <h2 className="text-base font-bold">Conflict Inbox ({syncSnapshot.conflicts.length})</h2>
              <p className="text-xs" style={{ color: 'var(--tw-ink-2)' }}>
                Both local and remote versions are preserved. Other queued items continue syncing automatically.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeConflictInbox}
            aria-label="Close conflict inbox"
            className="p-2 rounded-full"
            style={{ border: '1px solid var(--tw-line-strong)', color: 'var(--tw-ink-2)' }}
          >
            <X size={16} />
          </button>
        </div>

        {syncSnapshot.conflicts.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: 'var(--tw-ink-3)' }}>
            No conflicts pending review. All records are reconciled.
          </div>
        ) : (
          <div className="space-y-4">
            {syncSnapshot.conflicts.map((conflict) => (
              <div
                key={conflict.id}
                className="rounded-2xl p-4 space-y-3"
                style={{
                  background: 'var(--tw-bg)',
                  border: '1px solid var(--tw-line-strong)',
                }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-mono font-semibold" style={{ color: 'var(--tw-ink)' }}>
                    {conflict.entity} · {conflict.entityId} ({conflict.op})
                  </div>
                  <div className="text-xs" style={{ color: 'var(--tw-loss)' }}>
                    {conflict.reason}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-xl p-3" style={{ background: 'var(--tw-tile)', border: '1px solid var(--tw-line)' }}>
                    <div className="text-xs font-semibold mb-1.5" style={{ color: 'var(--tw-warn)' }}>
                      Local edit (base v{conflict.baseVersion})
                    </div>
                    <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap break-words" style={{ color: 'var(--tw-ink-2)' }}>
                      {JSON.stringify(conflict.localRecord, null, 2)}
                    </pre>
                  </div>

                  <div className="rounded-xl p-3" style={{ background: 'var(--tw-tile)', border: '1px solid var(--tw-line)' }}>
                    <div className="text-xs font-semibold mb-1.5" style={{ color: 'var(--tw-gain)' }}>
                      Remote server version
                    </div>
                    <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap break-words" style={{ color: 'var(--tw-ink-2)' }}>
                      {JSON.stringify(conflict.remoteRecord, null, 2)}
                    </pre>
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void resolveConflictKeepRemote(conflict.id)}
                    className="h-9 px-4 rounded-full text-xs font-semibold inline-flex items-center gap-1.5"
                    style={{
                      background: 'var(--tw-pill)',
                      color: 'var(--tw-ink)',
                      border: '1px solid var(--tw-line-strong)',
                    }}
                  >
                    <Check size={14} aria-hidden="true" />
                    <span>Accept remote</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void resolveConflictRetryLocal(conflict.id)}
                    className="h-9 px-4 rounded-full text-xs font-semibold inline-flex items-center gap-1.5"
                    style={{
                      background: 'var(--tw-hero)',
                      color: 'var(--tw-hero-ink)',
                    }}
                  >
                    <RotateCcw size={14} aria-hidden="true" />
                    <span>
                      {conflict.entity === 'trade'
                        ? 'Create append-only correction'
                        : 'Re-apply local on remote version'}
                    </span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

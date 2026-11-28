'use client';

import React from 'react';
import { StatusChipDisplay, useSessionSync } from '../../context/SessionSyncContext';

export function deriveStatusChipDisplay(params: {
  sessionState: 'signedOut' | 'signingIn' | 'signedIn' | 'refreshing' | 'locked';
  syncState: 'idle' | 'pulling' | 'pushing' | 'offline' | 'backoff' | 'conflict';
  pendingCount: number;
  conflictCount: number;
  lastSyncedAt: string | null;
}): StatusChipDisplay {
  if (params.sessionState === 'signedOut') {
    return { kind: 'signedOut', label: 'Signed out', tokenVar: '--ink-3' };
  }
  if (params.conflictCount > 0 || params.syncState === 'conflict') {
    return {
      kind: 'conflict',
      label: `Conflict · ${params.conflictCount} to review`,
      tokenVar: '--loss',
    };
  }
  if (params.syncState === 'offline') {
    return {
      kind: 'offline',
      label: `Offline · ${params.pendingCount} queued`,
      tokenVar: '--warn',
    };
  }
  if (
    params.syncState === 'pulling' ||
    params.syncState === 'pushing' ||
    params.syncState === 'backoff' ||
    params.sessionState === 'refreshing' ||
    params.pendingCount > 0
  ) {
    return {
      kind: 'syncing',
      label: `Syncing · ${params.pendingCount} pending`,
      tokenVar: '--warn',
    };
  }
  return {
    kind: 'synced',
    label: `Synced · ${params.lastSyncedAt || 'now'}`,
    tokenVar: '--gain',
  };
}

export const SyncStatusChip: React.FC<{
  collapsed?: boolean;
  compact?: boolean;
}> = ({ collapsed = false, compact = false }) => {
  const {
    statusDisplay,
    sessionSnapshot,
    openSignInModal,
    openConflictInbox,
    triggerSync,
  } = useSessionSync();

  const colorExpr = `var(${statusDisplay.tokenVar})`;

  const handleClick = () => {
    if (statusDisplay.kind === 'signedOut') {
      openSignInModal();
    } else if (statusDisplay.kind === 'conflict') {
      openConflictInbox();
    } else {
      void triggerSync();
    }
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={handleClick}
        title={statusDisplay.label}
        aria-label={statusDisplay.label}
        className="w-full flex justify-center py-1 rounded"
        style={{ color: colorExpr }}
      >
        <span
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: colorExpr }}
          aria-hidden="true"
        />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      data-testid="sync-status-chip"
      aria-live="polite"
      title={
        statusDisplay.kind === 'signedOut'
          ? 'Enter lock PIN to enable multi-device sync'
          : statusDisplay.kind === 'conflict'
          ? 'Open Conflict Inbox to review'
          : `Sync state: ${statusDisplay.label}`
      }
      className={`inline-flex items-center gap-2 rounded-full font-mono whitespace-nowrap shrink-0 transition-colors ${
        compact ? 'h-[34px] px-2.5 text-xs' : 'w-full justify-between px-3 py-1.5 text-xs'
      }`}
      style={{
        color: colorExpr,
        backgroundColor: 'var(--tw-tile)',
        border: `1px solid color-mix(in srgb, ${colorExpr} 48%, transparent)`,
      }}
    >
      <span className="inline-flex items-center gap-2 min-w-0">
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${
            statusDisplay.kind === 'syncing' ? 'animate-pulse' : ''
          }`}
          style={{ backgroundColor: colorExpr }}
          aria-hidden="true"
        />
        <span className="truncate font-medium">{statusDisplay.label}</span>
      </span>
      {!compact && sessionSnapshot.session?.email && (
        <span className="text-[11px] truncate opacity-85" style={{ color: 'var(--ink-3)' }}>
          {sessionSnapshot.session.email}
        </span>
      )}
    </button>
  );
};

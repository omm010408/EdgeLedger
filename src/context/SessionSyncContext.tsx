'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import {
  createDefaultSessionTransport,
  SessionManager,
  SessionSnapshot,
  SignInCredentials,
} from '../lib/auth/sessionManager';
import { installTransportAdapter } from '../lib/sync/transportAdapter';
import {
  createUserSyncStore,
  exportPendingOutboxJson,
  SyncStoreBackend,
} from '../lib/sync/indexedDbStore';
import { createHttpSyncProtocolAdapter } from '../lib/sync/syncProtocolAdapter';
import { SyncCoordinator, SyncStatusSnapshot } from '../lib/sync/syncCoordinator';
import { subscribeSyncBridge } from '../lib/sync/mutationBridge';

export type StatusChipDisplay = {
  kind: 'synced' | 'syncing' | 'offline' | 'conflict' | 'signedOut';
  label: string;
  tokenVar: '--gain' | '--warn' | '--loss' | '--ink-3';
};

interface SessionSyncContextValue {
  sessionSnapshot: SessionSnapshot;
  syncSnapshot: SyncStatusSnapshot;
  statusDisplay: StatusChipDisplay;
  isSignInModalOpen: boolean;
  isConflictInboxOpen: boolean;
  openSignInModal: () => void;
  closeSignInModal: () => void;
  openConflictInbox: () => void;
  closeConflictInbox: () => void;
  signIn: (creds: SignInCredentials) => Promise<boolean>;
  requestSignOut: () => Promise<{ signedOut: boolean; pendingCount: number }>;
  confirmSignOutAndClear: () => Promise<void>;
  cancelSignOut: () => void;
  exportPendingOutbox: () => Promise<string | null>;
  lockSession: () => void;
  unlockSession: (input: { method: 'biometric' | 'passcode'; passcode?: string }) => Promise<boolean>;
  triggerSync: () => Promise<boolean>;
  resolveConflictKeepRemote: (conflictId: string) => Promise<void>;
  resolveConflictRetryLocal: (conflictId: string) => Promise<void>;
}

const INITIAL_SYNC_SNAPSHOT: SyncStatusSnapshot = {
  state: 'idle',
  lastSyncedAt: null,
  pendingCount: 0,
  conflictCount: 0,
  backoffAttempt: 0,
  nextRetryAt: null,
  lastError: null,
  conflicts: [],
  outbox: [],
};

const SessionSyncContext = createContext<SessionSyncContextValue | undefined>(undefined);

export const SessionSyncProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const storesByUserRef = useRef<Map<string, SyncStoreBackend>>(new Map());
  const coordinatorRef = useRef<SyncCoordinator | null>(null);
  const managerRef = useRef<SessionManager | null>(null);

  const getStoreForUser = useCallback((userId: string): SyncStoreBackend => {
    let store = storesByUserRef.current.get(userId);
    if (!store) {
      store = createUserSyncStore(userId);
      storesByUserRef.current.set(userId, store);
    }
    return store;
  }, []);

  if (!managerRef.current) {
    managerRef.current = new SessionManager({
      transport: createDefaultSessionTransport(),
      callbacks: {
        getPendingOutboxCount: async () => {
          const uid = managerRef.current?.getUserId();
          if (!uid) return 0;
          const outbox = await getStoreForUser(uid).getAllOutbox();
          return outbox.length;
        },
        clearUserStorage: async (userId: string) => {
          const store = getStoreForUser(userId);
          await store.clearAll();
          storesByUserRef.current.delete(userId);
        },
      },
    });
  }

  const [sessionSnapshot, setSessionSnapshot] = useState<SessionSnapshot>(() =>
    managerRef.current!.getSnapshot()
  );
  const [syncSnapshot, setSyncSnapshot] = useState<SyncStatusSnapshot>(INITIAL_SYNC_SNAPSHOT);
  const [isSignInModalOpen, setIsSignInModalOpen] = useState(false);
  const [isConflictInboxOpen, setIsConflictInboxOpen] = useState(false);

  // Install root fetch transport wrapper & subscribe to session updates
  useEffect(() => {
    const manager = managerRef.current!;
    const uninstallTransport = installTransportAdapter({
      refresh: () => manager.refresh(),
      forceSignOut: () => manager.forceSignOut(),
    });

    const unsubSession = manager.subscribe((snap) => {
      setSessionSnapshot(snap);
    });

    void manager.restoreSessionFromCookie();

    return () => {
      unsubSession();
      uninstallTransport();
    };
  }, []);

  // Manage SyncCoordinator lifecycle per authenticated userId
  useEffect(() => {
    const userId = sessionSnapshot.session?.userId;
    const isAuthed = sessionSnapshot.state !== 'signedOut' && Boolean(userId);

    if (!isAuthed || !userId) {
      coordinatorRef.current?.dispose();
      coordinatorRef.current = null;
      setSyncSnapshot(INITIAL_SYNC_SNAPSHOT);
      return;
    }

    const store = getStoreForUser(userId);
    const adapter = createHttpSyncProtocolAdapter();
    const coordinator = new SyncCoordinator({
      userId,
      store,
      adapter,
    });
    coordinatorRef.current = coordinator;

    const unsubCoord = coordinator.subscribe((snap) => {
      setSyncSnapshot(snap);
    });

    void (async () => {
      await coordinator.hydrateFromStore();
      await coordinator.syncNow();
    })();

    const unsubBridge = subscribeSyncBridge((event) => {
      void (async () => {
        await coordinator.enqueueChange(event);
        await coordinator.syncNow();
      })();
    });

    const onOnline = () => {
      void coordinator.handleReconnect();
    };
    const onOffline = () => {
      coordinator.handleOffline();
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      unsubBridge();
      unsubCoord();
      coordinator.dispose();
      if (coordinatorRef.current === coordinator) {
        coordinatorRef.current = null;
      }
    };
  }, [sessionSnapshot.session?.userId, sessionSnapshot.state === 'signedOut', getStoreForUser]);

  const signIn = useCallback(async (creds: SignInCredentials): Promise<boolean> => {
    const ok = await managerRef.current!.signIn(creds);
    if (ok) {
      setIsSignInModalOpen(false);
    }
    return ok;
  }, []);

  const requestSignOut = useCallback(async () => {
    return managerRef.current!.signOut();
  }, []);

  const confirmSignOutAndClear = useCallback(async () => {
    await managerRef.current!.signOut({ force: true });
  }, []);

  const cancelSignOut = useCallback(() => {
    managerRef.current!.cancelSignOutWarning();
  }, []);

  const exportPendingOutbox = useCallback(async (): Promise<string | null> => {
    const uid = managerRef.current?.getUserId();
    if (!uid) return null;
    const store = getStoreForUser(uid);
    const json = await exportPendingOutboxJson(store);
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `edgeledger-pending-outbox-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
    return json;
  }, [getStoreForUser]);

  const lockSession = useCallback(() => {
    managerRef.current!.lock();
  }, []);

  const unlockSession = useCallback(
    async (input: { method: 'biometric' | 'passcode'; passcode?: string }) => {
      return managerRef.current!.unlock(input);
    },
    []
  );

  const triggerSync = useCallback(async () => {
    if (!coordinatorRef.current) return false;
    return coordinatorRef.current.syncNow();
  }, []);

  const resolveConflictKeepRemote = useCallback(async (conflictId: string) => {
    if (!coordinatorRef.current) return;
    await coordinatorRef.current.resolveConflictKeepRemote(conflictId);
  }, []);

  const resolveConflictRetryLocal = useCallback(async (conflictId: string) => {
    if (!coordinatorRef.current) return;
    await coordinatorRef.current.resolveConflictRetryLocal(conflictId);
  }, []);

  const statusDisplay = useMemo<StatusChipDisplay>(() => {
    if (sessionSnapshot.state === 'signedOut') {
      return {
        kind: 'signedOut',
        label: 'Signed out',
        tokenVar: '--ink-3',
      };
    }

    if (syncSnapshot.conflictCount > 0 || syncSnapshot.state === 'conflict') {
      return {
        kind: 'conflict',
        label: `Conflict · ${syncSnapshot.conflictCount} to review`,
        tokenVar: '--loss',
      };
    }

    if (syncSnapshot.state === 'offline') {
      return {
        kind: 'offline',
        label: `Offline · ${syncSnapshot.pendingCount} queued`,
        tokenVar: '--warn',
      };
    }

    if (
      syncSnapshot.state === 'pulling' ||
      syncSnapshot.state === 'pushing' ||
      syncSnapshot.state === 'backoff' ||
      sessionSnapshot.state === 'refreshing' ||
      syncSnapshot.pendingCount > 0
    ) {
      return {
        kind: 'syncing',
        label: `Syncing · ${syncSnapshot.pendingCount} pending`,
        tokenVar: '--warn',
      };
    }

    return {
      kind: 'synced',
      label: `Synced · ${syncSnapshot.lastSyncedAt || 'now'}`,
      tokenVar: '--gain',
    };
  }, [sessionSnapshot.state, syncSnapshot]);

  return (
    <SessionSyncContext.Provider
      value={{
        sessionSnapshot,
        syncSnapshot,
        statusDisplay,
        isSignInModalOpen,
        isConflictInboxOpen,
        openSignInModal: () => setIsSignInModalOpen(true),
        closeSignInModal: () => setIsSignInModalOpen(false),
        openConflictInbox: () => setIsConflictInboxOpen(true),
        closeConflictInbox: () => setIsConflictInboxOpen(false),
        signIn,
        requestSignOut,
        confirmSignOutAndClear,
        cancelSignOut,
        exportPendingOutbox,
        lockSession,
        unlockSession,
        triggerSync,
        resolveConflictKeepRemote,
        resolveConflictRetryLocal,
      }}
    >
      {children}
    </SessionSyncContext.Provider>
  );
};

export function useSessionSync(): SessionSyncContextValue {
  const ctx = useContext(SessionSyncContext);
  if (!ctx) {
    throw new Error('useSessionSync must be used within SessionSyncProvider');
  }
  return ctx;
}

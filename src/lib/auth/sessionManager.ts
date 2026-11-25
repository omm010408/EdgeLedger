import { safeLog } from './redact';

export type SessionState = 'signedOut' | 'signingIn' | 'signedIn' | 'refreshing' | 'locked';

export interface SessionInfo {
  userId: string;
  email?: string;
  deviceId: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  state: SessionState;
}

export interface SignInCredentials {
  email: string;
  password?: string;
  method?: 'password' | 'passkey';
  credentialId?: string;
}

export interface SessionTransport {
  signIn: (creds: SignInCredentials) => Promise<{ ok: boolean; session?: SessionInfo; error?: string }>;
  refresh: () => Promise<{ ok: boolean; session?: SessionInfo; error?: string }>;
  signOut: () => Promise<void>;
}

export interface SessionStoreCallbacks {
  getPendingOutboxCount: () => Promise<number>;
  clearUserStorage: (userId: string) => Promise<void>;
}

export type SessionListener = (snapshot: SessionSnapshot) => void;

export interface SessionSnapshot {
  state: SessionState;
  session: SessionInfo | null;
  error: string | null;
  pendingOutboxWarningCount: number | null;
}

export type UnlockVerifier = (input: { method: 'biometric' | 'passcode'; passcode?: string }) => Promise<boolean> | boolean;

export class SessionManager {
  private state: SessionState = 'signedOut';
  private session: SessionInfo | null = null;
  private error: string | null = null;
  private pendingOutboxWarningCount: number | null = null;
  private listeners = new Set<SessionListener>();
  private refreshPromise: Promise<boolean> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimeoutMs: number;
  private transport: SessionTransport;
  private callbacks: SessionStoreCallbacks;
  private unlockVerifier: UnlockVerifier;

  // In-memory only token cache if ever needed; never written to localStorage/sessionStorage.
  private inMemoryAccessToken: string | null = null;

  constructor(options: {
    transport: SessionTransport;
    callbacks: SessionStoreCallbacks;
    idleTimeoutMs?: number;
    unlockVerifier?: UnlockVerifier;
    initialSession?: SessionInfo | null;
  }) {
    this.transport = options.transport;
    this.callbacks = options.callbacks;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 15 * 60 * 1000;
    this.unlockVerifier =
      options.unlockVerifier ??
      (async ({ method, passcode }) => {
        if (method === 'biometric') return true;
        return Boolean(passcode && passcode.trim().length >= 4);
      });

    if (options.initialSession) {
      this.session = { ...options.initialSession, state: 'signedIn' };
      this.state = 'signedIn';
    }
  }

  getSnapshot(): SessionSnapshot {
    return {
      state: this.state,
      session: this.session ? { ...this.session, state: this.state } : null,
      error: this.error,
      pendingOutboxWarningCount: this.pendingOutboxWarningCount,
    };
  }

  getState(): SessionState {
    return this.state;
  }

  getUserId(): string | null {
    return this.session?.userId ?? null;
  }

  setInMemoryToken(token: string | null): void {
    this.inMemoryAccessToken = token;
  }

  getInMemoryToken(): string | null {
    return this.inMemoryAccessToken;
  }

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snap = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (this.state === 'signedIn' && this.idleTimeoutMs > 0) {
      this.idleTimer = setTimeout(() => {
        this.lock();
      }, this.idleTimeoutMs);
    }
  }

  recordUserActivity(): void {
    if (this.state === 'signedIn') {
      this.resetIdleTimer();
    }
  }

  async signIn(creds: SignInCredentials): Promise<boolean> {
    if (this.state !== 'signedOut') {
      return false;
    }

    this.state = 'signingIn';
    this.error = null;
    this.pendingOutboxWarningCount = null;
    this.emit();

    try {
      const res = await this.transport.signIn(creds);
      if (!res.ok || !res.session) {
        this.state = 'signedOut';
        this.session = null;
        this.error = res.error || 'Sign-in failed.';
        this.emit();
        return false;
      }

      this.session = { ...res.session, state: 'signedIn' };
      this.state = 'signedIn';
      this.error = null;
      this.resetIdleTimer();
      this.emit();
      return true;
    } catch (err: unknown) {
      safeLog('warn', 'Sign-in request failed', { error: err });
      this.state = 'signedOut';
      this.session = null;
      this.error = err instanceof Error ? err.message : 'Unable to reach authentication server.';
      this.emit();
      return false;
    }
  }

  /**
   * Single-flight refresh: signedIn -> refreshing -> signedIn, or -> signedOut if refresh fails.
   */
  async refresh(): Promise<boolean> {
    if (this.state !== 'signedIn' && this.state !== 'locked' && this.state !== 'refreshing') {
      return false;
    }
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    const previousState = this.state === 'locked' ? 'locked' : 'signedIn';
    this.state = 'refreshing';
    this.emit();

    this.refreshPromise = (async () => {
      try {
        const res = await this.transport.refresh();
        if (!res.ok || !res.session) {
          await this.completeForceSignOut();
          return false;
        }
        this.session = { ...res.session, state: previousState };
        this.state = previousState;
        this.error = null;
        this.resetIdleTimer();
        this.emit();
        return true;
      } catch (err: unknown) {
        safeLog('warn', 'Session refresh failed', { error: err });
        await this.completeForceSignOut();
        return false;
      } finally {
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  /**
   * Restores session on app boot if an existing httpOnly refresh cookie is valid.
   */
  async restoreSessionFromCookie(): Promise<boolean> {
    if (this.state !== 'signedOut') return this.state === 'signedIn';
    try {
      const res = await this.transport.refresh();
      if (res.ok && res.session) {
        this.session = { ...res.session, state: 'signedIn' };
        this.state = 'signedIn';
        this.error = null;
        this.resetIdleTimer();
        this.emit();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * UI-only lock: signedIn -> locked. Never signs out or clears data.
   */
  lock(): boolean {
    if (this.state !== 'signedIn') return false;
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.state = 'locked';
    this.emit();
    return true;
  }

  /**
   * Biometric or passcode unlock gates the UI only and ONLY transitions locked -> signedIn.
   * It NEVER replaces sign-in when signedOut.
   */
  async unlock(input: { method: 'biometric' | 'passcode'; passcode?: string }): Promise<boolean> {
    if (this.state !== 'locked' || !this.session) {
      return false;
    }
    const verified = await this.unlockVerifier(input);
    if (!verified) {
      this.error = input.method === 'passcode' ? 'Incorrect passcode.' : 'Biometric check was not verified.';
      this.emit();
      return false;
    }
    this.state = 'signedIn';
    this.error = null;
    this.resetIdleTimer();
    this.emit();
    return true;
  }

  /**
   * Requests sign-out. If outbox has pending items and force=false, returns requiresConfirmation=true
   * so UI warns the user with the count and offers export before clearing.
   */
  async signOut(options?: { force?: boolean }): Promise<{ signedOut: boolean; pendingCount: number }> {
    if (this.state === 'signedOut') {
      return { signedOut: true, pendingCount: 0 };
    }

    const pendingCount = await this.callbacks.getPendingOutboxCount();
    if (pendingCount > 0 && !options?.force) {
      this.pendingOutboxWarningCount = pendingCount;
      this.emit();
      return { signedOut: false, pendingCount };
    }

    await this.completeForceSignOut();
    return { signedOut: true, pendingCount };
  }

  cancelSignOutWarning(): void {
    this.pendingOutboxWarningCount = null;
    this.emit();
  }

  async forceSignOut(): Promise<void> {
    await this.completeForceSignOut();
  }

  private async completeForceSignOut(): Promise<void> {
    const uid = this.session?.userId;
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.inMemoryAccessToken = null;
    this.pendingOutboxWarningCount = null;

    try {
      await this.transport.signOut();
    } catch {
      // Sign-out cleanup proceeds even if network is unreachable
    }

    if (uid) {
      await this.callbacks.clearUserStorage(uid);
    }

    this.session = null;
    this.state = 'signedOut';
    this.emit();
  }

  dispose(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.listeners.clear();
  }
}

export function createDefaultSessionTransport(baseUrl = ''): SessionTransport {
  return {
    async signIn(creds) {
      const res = await fetch(`${baseUrl}/auth/sign-in`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: data.error || 'Authentication failed.' };
      }
      return { ok: true, session: data.session };
    },
    async refresh() {
      const res = await fetch(`${baseUrl}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: data.error || 'Session expired.' };
      }
      return { ok: true, session: data.session };
    },
    async signOut() {
      await fetch(`${baseUrl}/auth/sign-out`, {
        method: 'POST',
        credentials: 'include',
      });
    },
  };
}

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SessionInfo,
  SessionManager,
  SessionState,
  SessionTransport,
} from '../sessionManager';
import { redactSensitive, redactString, safeLog } from '../redact';

function makeSession(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    userId: 'usr-123',
    email: 'trader@edgeledger.io',
    deviceId: 'dev-1',
    accessExpiresAt: new Date(Date.now() + 900_000).toISOString(),
    refreshExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    state: 'signedIn',
    ...overrides,
  };
}

describe('SessionManager State Machine & Redaction', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('transitions signedOut -> signingIn -> signedIn on valid credentials and back to signedOut on failure', async () => {
    const observed: SessionState[] = [];
    let shouldSucceed = false;

    const transport: SessionTransport = {
      signIn: vi.fn(async () =>
        shouldSucceed ? { ok: true, session: makeSession() } : { ok: false, error: 'Bad password' }
      ),
      refresh: vi.fn(async () => ({ ok: true, session: makeSession() })),
      signOut: vi.fn(async () => {}),
    };

    const manager = new SessionManager({
      transport,
      callbacks: {
        getPendingOutboxCount: async () => 0,
        clearUserStorage: async () => {},
      },
    });
    manager.subscribe((s) => observed.push(s.state));

    // Failed sign-in: signedOut -> signingIn -> signedOut
    const ok1 = await manager.signIn({ email: 'trader@edgeledger.io', password: 'wrong' });
    expect(ok1).toBe(false);
    expect(manager.getState()).toBe('signedOut');

    // Successful sign-in: signedOut -> signingIn -> signedIn
    shouldSucceed = true;
    const ok2 = await manager.signIn({ email: 'trader@edgeledger.io', password: 'correct' });
    expect(ok2).toBe(true);
    expect(manager.getState()).toBe('signedIn');
    expect(observed).toEqual(['signedOut', 'signingIn', 'signedOut', 'signingIn', 'signedIn']);
  });

  it('transitions signedIn -> refreshing -> signedIn, and -> signedOut if refresh fails', async () => {
    const states: SessionState[] = [];
    let refreshOk = true;
    const clearUserStorage = vi.fn(async () => {});

    const transport: SessionTransport = {
      signIn: vi.fn(async () => ({ ok: true, session: makeSession() })),
      refresh: vi.fn(async () =>
        refreshOk ? { ok: true, session: makeSession() } : { ok: false, error: 'Expired' }
      ),
      signOut: vi.fn(async () => {}),
    };

    const manager = new SessionManager({
      transport,
      callbacks: {
        getPendingOutboxCount: async () => 0,
        clearUserStorage,
      },
      initialSession: makeSession(),
    });
    manager.subscribe((s) => states.push(s.state));

    expect(await manager.refresh()).toBe(true);
    expect(manager.getState()).toBe('signedIn');

    refreshOk = false;
    expect(await manager.refresh()).toBe(false);
    expect(manager.getState()).toBe('signedOut');
    expect(clearUserStorage).toHaveBeenCalledWith('usr-123');
    expect(states).toEqual(['signedIn', 'refreshing', 'signedIn', 'refreshing', 'signedOut']);
  });

  it('supports signedIn <-> locked (manual and idle timeout), disables biometric unlock, and requires passcode 1973', async () => {
    const transport: SessionTransport = {
      signIn: vi.fn(async () => ({ ok: true, session: makeSession() })),
      refresh: vi.fn(async () => ({ ok: true, session: makeSession() })),
      signOut: vi.fn(async () => {}),
    };

    const manager = new SessionManager({
      transport,
      callbacks: {
        getPendingOutboxCount: async () => 0,
        clearUserStorage: async () => {},
      },
      idleTimeoutMs: 5000,
    });

    // Passcode / biometric unlock CANNOT replace sign-in when signedOut
    expect(await manager.unlock({ method: 'passcode', passcode: '1973' })).toBe(false);
    expect(await manager.unlock({ method: 'biometric' })).toBe(false);
    expect(manager.getState()).toBe('signedOut');

    await manager.signIn({ email: 'ommroshan@gmail.com', method: 'password', password: 'EdgeLedger@010408' });
    expect(manager.getState()).toBe('signedIn');

    // Manual lock -> biometric unlock is disabled; wrong passcodes fail; 1973 unlocks
    expect(manager.lock()).toBe(true);
    expect(manager.getState()).toBe('locked');
    expect(await manager.unlock({ method: 'biometric' })).toBe(false);
    expect(manager.getState()).toBe('locked');
    expect(await manager.unlock({ method: 'passcode', passcode: '2026' })).toBe(false);
    expect(manager.getState()).toBe('locked');
    expect(await manager.unlock({ method: 'passcode', passcode: '1973' })).toBe(true);
    expect(manager.getState()).toBe('signedIn');

    // Idle timeout locks -> wrong passcode fails -> 1973 unlocks
    vi.advanceTimersByTime(5000);
    expect(manager.getState()).toBe('locked');
    expect(await manager.unlock({ method: 'passcode', passcode: '12' })).toBe(false);
    expect(manager.getState()).toBe('locked');
    expect(await manager.unlock({ method: 'passcode', passcode: '1973' })).toBe(true);
    expect(manager.getState()).toBe('signedIn');
  });

  it('warns on sign-out when outbox has pending items and clears scoped storage on confirmed sign-out', async () => {
    const clearUserStorage = vi.fn(async () => {});
    const manager = new SessionManager({
      transport: {
        signIn: vi.fn(async () => ({ ok: true, session: makeSession() })),
        refresh: vi.fn(async () => ({ ok: true, session: makeSession() })),
        signOut: vi.fn(async () => {}),
      },
      callbacks: {
        getPendingOutboxCount: async () => 3,
        clearUserStorage,
      },
      initialSession: makeSession(),
    });

    const firstAttempt = await manager.signOut();
    expect(firstAttempt).toEqual({ signedOut: false, pendingCount: 3 });
    expect(manager.getSnapshot().pendingOutboxWarningCount).toBe(3);
    expect(manager.getState()).toBe('signedIn');
    expect(clearUserStorage).not.toHaveBeenCalled();

    const confirmed = await manager.signOut({ force: true });
    expect(confirmed).toEqual({ signedOut: true, pendingCount: 3 });
    expect(manager.getState()).toBe('signedOut');
    expect(clearUserStorage).toHaveBeenCalledWith('usr-123');
  });

  it('redacts tokens, passwords, cookies, and account numbers from logs', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const sampleJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3ItMSJ9.signature123';
    const input = {
      authorization: `Bearer ${sampleJwt}`,
      password: 'SuperSecretPassword!',
      accountNumber: 'ACCT-987654321',
      nested: {
        refreshToken: sampleJwt,
        note: `Retry with Bearer ${sampleJwt} on account 449012349876`,
      },
    };

    const redacted = redactSensitive(input) as Record<string, any>;
    expect(redacted.authorization).toBe('[REDACTED]');
    expect(redacted.password).toBe('[REDACTED]');
    expect(redacted.accountNumber).toBe('[REDACTED]');
    expect(redacted.nested.refreshToken).toBe('[REDACTED]');
    expect(redacted.nested.note).not.toContain(sampleJwt);
    expect(redacted.nested.note).not.toContain('449012349876');
    expect(redactString('acct 1234567890')).toBe('acct [REDACTED_ACCT]');

    safeLog('warn', `Sync error for Bearer ${sampleJwt} on 9988776655`, input);
    const loggedText = warnSpy.mock.calls.flat().map((c) => JSON.stringify(c)).join(' ');
    expect(loggedText).not.toContain(sampleJwt);
    expect(loggedText).not.toContain('SuperSecretPassword!');
    expect(loggedText).not.toContain('9988776655');
    expect(loggedText).not.toContain('987654321');
  });

  it('restores active 4-hour JWT session on reload via getSession without revoking refresh, and deduplicates concurrent calls', async () => {
    const getSessionSpy = vi.fn(async () => ({ ok: true, session: makeSession() }));
    const refreshSpy = vi.fn(async () => ({ ok: true, session: makeSession() }));

    const manager = new SessionManager({
      transport: {
        signIn: vi.fn(async () => ({ ok: true, session: makeSession() })),
        getSession: getSessionSpy,
        refresh: refreshSpy,
        signOut: vi.fn(async () => {}),
      },
      callbacks: {
        getPendingOutboxCount: async () => 0,
        clearUserStorage: async () => {},
      },
    });

    // Simulate React StrictMode / simultaneous reload checks
    const [ok1, ok2] = await Promise.all([
      manager.restoreSessionFromCookie(),
      manager.restoreSessionFromCookie(),
    ]);
    expect(ok1).toBe(true);
    expect(ok2).toBe(true);
    expect(manager.getState()).toBe('signedIn');
    expect(getSessionSpy).toHaveBeenCalledTimes(1);
    expect(refreshSpy).not.toHaveBeenCalled();

    // If getSession reports inactive/expired, falls back cleanly to refresh once
    const manager2 = new SessionManager({
      transport: {
        signIn: vi.fn(async () => ({ ok: true, session: makeSession() })),
        getSession: vi.fn(async () => ({ ok: false, error: 'Expired' })),
        refresh: refreshSpy,
        signOut: vi.fn(async () => {}),
      },
      callbacks: {
        getPendingOutboxCount: async () => 0,
        clearUserStorage: async () => {},
      },
    });
    expect(await manager2.restoreSessionFromCookie()).toBe(true);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });
});

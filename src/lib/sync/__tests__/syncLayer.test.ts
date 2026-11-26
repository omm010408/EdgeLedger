import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTransportFetch } from '../transportAdapter';
import {
  clearMemoryDatabasesForTests,
  exportPendingOutboxJson,
  getScopedDbName,
  MemorySyncStoreBackend,
} from '../indexedDbStore';
import {
  BACKOFF_BASE_MS,
  BACKOFF_CAP_MS,
  computeBackoffDelayMs,
  SyncCoordinator,
  SyncEngineState,
} from '../syncCoordinator';
import { ProtocolHttpError, SyncProtocolAdapter } from '../syncProtocolAdapter';
import {
  resetServerSyncStoreForTests,
  serverPullChanges,
  serverPushItems,
} from '../../auth/serverAuth';
import { deriveStatusChipDisplay } from '../../../components/sync/SyncStatusChip';

describe('Transport Adapter, IndexedDB Outbox, Backoff & Sync Coordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearMemoryDatabasesForTests();
    resetServerSyncStoreForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('transport refreshes once and retries once on 401, and signs out on a second 401', async () => {
    let callCount = 0;
    const baseFetch = vi.fn(async () => {
      callCount += 1;
      return new Response(JSON.stringify({ ok: callCount === 2 }), {
        status: callCount === 1 ? 401 : callCount === 2 ? 200 : 401,
      });
    }) as unknown as typeof fetch;

    const refresh = vi.fn(async () => true);
    const forceSignOut = vi.fn(async () => {});

    const wrappedFetch = createTransportFetch({
      baseFetch,
      session: { refresh, forceSignOut },
    });

    // Scenario A: 401 -> refresh -> retry succeeds (200)
    const res1 = await wrappedFetch('/api/v1/accounts');
    expect(res1.status).toBe(200);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(forceSignOut).not.toHaveBeenCalled();
    expect((baseFetch as any).mock.calls[0][1].credentials).toBe('include');

    // Scenario B: always 401 -> refresh once -> retry once -> second 401 triggers signOut
    const always401 = vi.fn(async () => new Response('Unauthorized', { status: 401 })) as unknown as typeof fetch;
    const refresh2 = vi.fn(async () => true);
    const forceSignOut2 = vi.fn(async () => {});

    const wrappedFetch2 = createTransportFetch({
      baseFetch: always401,
      session: { refresh: refresh2, forceSignOut: forceSignOut2 },
    });

    const res2 = await wrappedFetch2('/sync/changes?cursor=');
    expect(res2.status).toBe(401);
    expect(refresh2).toHaveBeenCalledTimes(1);
    expect(always401).toHaveBeenCalledTimes(2);
    expect(forceSignOut2).toHaveBeenCalledTimes(1);
  });

  it('retries automatically only on reads and idempotent outbox items, never on non-idempotent writes', async () => {
    const sleep = vi.fn(async () => {});

    // Non-idempotent POST without Idempotency-Key -> zero retries on 503
    const postFetch = vi.fn(async () => new Response('Busy', { status: 503 })) as unknown as typeof fetch;
    const tfPost = createTransportFetch({
      baseFetch: postFetch,
      session: { refresh: async () => false, forceSignOut: async () => {} },
      sleep,
      maxRetries: 2,
    });
    const postRes = await tfPost('/api/v1/trades', { method: 'POST', body: '{}' });
    expect(postRes.status).toBe(503);
    expect(postFetch).toHaveBeenCalledTimes(1);

    // Read GET -> retries on 503
    let readAttempt = 0;
    const getFetch = vi.fn(async () => {
      readAttempt += 1;
      return new Response('ok', { status: readAttempt < 3 ? 503 : 200 });
    }) as unknown as typeof fetch;
    const tfGet = createTransportFetch({
      baseFetch: getFetch,
      session: { refresh: async () => false, forceSignOut: async () => {} },
      sleep,
      maxRetries: 2,
    });
    const getRes = await tfGet('/api/v1/health', { method: 'GET' });
    expect(getRes.status).toBe(200);
    expect(getFetch).toHaveBeenCalledTimes(3);

    // Outbox /sync/push with per-item idempotencyKey -> retries on 503
    let outboxAttempt = 0;
    const pushFetch = vi.fn(async () => {
      outboxAttempt += 1;
      return new Response('{}', { status: outboxAttempt === 1 ? 503 : 200 });
    }) as unknown as typeof fetch;
    const tfPush = createTransportFetch({
      baseFetch: pushFetch,
      session: { refresh: async () => false, forceSignOut: async () => {} },
      sleep,
      maxRetries: 2,
    });
    const pushRes = await tfPush('/sync/push', {
      method: 'POST',
      body: JSON.stringify({ items: [{ idempotencyKey: 'k-1', entity: 'account', op: 'create' }] }),
    });
    expect(pushRes.status).toBe(200);
    expect(pushFetch).toHaveBeenCalledTimes(2);
  });

  it('computes exponential backoff starting at 1s, doubling, capped at 5 min with jitter, using fake timers', async () => {
    expect(computeBackoffDelayMs(0, () => 1)).toBe(BACKOFF_BASE_MS); // 1000ms
    expect(computeBackoffDelayMs(1, () => 1)).toBe(2000);
    expect(computeBackoffDelayMs(2, () => 1)).toBe(4000);
    expect(computeBackoffDelayMs(20, () => 1)).toBe(BACKOFF_CAP_MS); // capped at 5m (300,000ms)
    expect(computeBackoffDelayMs(20, () => 0)).toBe(BACKOFF_CAP_MS / 2); // jitter min bound

    const store = new MemorySyncStoreBackend('usr-backoff');
    let failPull = true;
    const adapter: SyncProtocolAdapter = {
      pullChanges: vi.fn(async () => {
        if (failPull) throw new ProtocolHttpError(503, 'Service Unavailable');
        return { changes: [], nextCursor: '1' };
      }),
      pushBatch: vi.fn(async () => ({ results: [] })),
    };

    const states: SyncEngineState[] = [];
    const coord = new SyncCoordinator({
      userId: 'usr-backoff',
      store,
      adapter,
      randomFn: () => 1,
    });
    coord.subscribe((s) => states.push(s.state));

    await coord.syncNow();
    expect(coord.getSnapshot().state).toBe('backoff');
    expect(coord.getSnapshot().backoffAttempt).toBe(1);

    // Should not retry before 1000ms
    vi.advanceTimersByTime(999);
    expect(adapter.pullChanges).toHaveBeenCalledTimes(1);

    // Retries cleanly at 1000ms and recovers to idle
    failPull = false;
    await vi.advanceTimersByTimeAsync(1);
    expect(adapter.pullChanges).toHaveBeenCalledTimes(2);
    expect(coord.getSnapshot().state).toBe('idle');
    expect(states).toContain('pulling');
    expect(states).toContain('backoff');
  });

  it('covers sync transitions: idle -> pulling -> pushing -> idle, offline -> reconnect, and preserves order & idempotency', async () => {
    const userId = 'usr-order';
    const store = new MemorySyncStoreBackend(userId);
    let online = true;
    const states: SyncEngineState[] = [];

    const adapter: SyncProtocolAdapter = {
      pullChanges: vi.fn(async (cursor) => serverPullChanges(userId, cursor)),
      pushBatch: vi.fn(async (items) => serverPushItems(userId, items)),
    };

    const coord = new SyncCoordinator({
      userId,
      store,
      adapter,
      isOnline: () => online,
    });
    coord.subscribe((s) => states.push(s.state));

    // Enqueue 2 items in order while online
    const item1 = await coord.enqueueChange({
      entity: 'account',
      entityId: 'acc-1',
      op: 'create',
      payload: { id: 'acc-1', name: 'Apex 100K' },
    });
    const item2 = await coord.enqueueChange({
      entity: 'journal',
      entityId: 'j-1',
      op: 'create',
      payload: { id: 'j-1', body: 'London session focus' },
    });

    await coord.syncNow();
    expect(coord.getSnapshot().state).toBe('idle');
    expect(coord.getSnapshot().pendingCount).toBe(0);
    expect(states).toEqual(expect.arrayContaining(['idle', 'pulling', 'pushing', 'idle']));

    // Replaying exact same batch with same idempotencyKey creates zero duplicates
    const replay = serverPushItems(userId, [
      {
        idempotencyKey: item1!.idempotencyKey,
        entity: 'account',
        op: 'create',
        baseVersion: 0,
        payload: { id: 'acc-1', name: 'Apex 100K' },
      },
      {
        idempotencyKey: item2!.idempotencyKey,
        entity: 'journal',
        op: 'create',
        baseVersion: 0,
        payload: { id: 'j-1', body: 'London session focus' },
      },
    ]);
    expect(replay.results[0].status).toBe('accepted');
    if (replay.results[0].status === 'accepted') {
      expect(replay.results[0].newVersion).toBe(1); // Not incremented twice
    }
    expect(serverPullChanges(userId, '0').changes).toHaveLength(2);

    // Offline -> read from cache + reconnect pulls then pushes
    online = false;
    coord.handleOffline();
    expect(coord.getSnapshot().state).toBe('offline');
    await coord.enqueueChange({
      entity: 'account',
      entityId: 'acc-1',
      op: 'update',
      baseVersion: 1,
      payload: { id: 'acc-1', name: 'Apex 100K Updated Offline' },
    });
    const cached = await coord.readCachedEntities('account');
    expect(cached[0].record.name).toBe('Apex 100K Updated Offline');

    online = true;
    await coord.handleReconnect();
    expect(coord.getSnapshot().state).toBe('idle');
    expect(coord.getSnapshot().pendingCount).toBe(0);
  });

  it('moves conflicted item to conflict inbox keeping both local and remote while rest of queue keeps syncing', async () => {
    const userId = 'usr-conflict';
    const store = new MemorySyncStoreBackend(userId);

    // Pre-populate server with account acc-1 at version 2
    serverPushItems(userId, [
      { idempotencyKey: 'seed-1', entity: 'account', op: 'create', baseVersion: 0, payload: { id: 'acc-1', name: 'Remote v1' } },
      { idempotencyKey: 'seed-2', entity: 'account', op: 'update', baseVersion: 1, payload: { id: 'acc-1', name: 'Remote v2' } },
    ]);

    const adapter: SyncProtocolAdapter = {
      pullChanges: vi.fn(async (cursor) => serverPullChanges(userId, cursor)),
      pushBatch: vi.fn(async (items) => serverPushItems(userId, items)),
    };

    const coord = new SyncCoordinator({ userId, store, adapter });
    // Stale edit against baseVersion 1 (conflicts with server v2)
    await coord.enqueueChange({
      entity: 'account',
      entityId: 'acc-1',
      op: 'update',
      baseVersion: 1,
      payload: { id: 'acc-1', name: 'Stale Local Edit' },
    });
    // Independent second item in queue should STILL sync cleanly
    await coord.enqueueChange({
      entity: 'risk_rule',
      entityId: 'rule-1',
      op: 'create',
      baseVersion: 0,
      payload: { id: 'rule-1', accountId: 'acc-1', limit: 2500 },
    });

    await coord.syncNow();
    const snap = coord.getSnapshot();
    expect(snap.state).toBe('conflict');
    expect(snap.pendingCount).toBe(0);
    expect(snap.conflictCount).toBe(1);
    expect(snap.conflicts[0].localRecord.name).toBe('Stale Local Edit');
    expect((snap.conflicts[0].remoteRecord as any).payload.name).toBe('Remote v2');

    // Second item was pushed cleanly despite first item conflicting
    const pulled = serverPullChanges(userId, '0').changes;
    expect(pulled.some((c) => c.entity === 'risk_rule' && c.id === 'rule-1')).toBe(true);
  });

  it('persists offline queue across simulated reload and enforces append-only closed trades & preference scoping', async () => {
    const userId = 'usr-reload';
    let online = false;
    const adapter: SyncProtocolAdapter = {
      pullChanges: vi.fn(async (cursor) => serverPullChanges(userId, cursor)),
      pushBatch: vi.fn(async (items) => serverPushItems(userId, items)),
    };

    // Before reload: queue items while offline + device-only preference + closed trade correction
    const store1 = new MemorySyncStoreBackend(userId);
    expect(store1.dbName).toBe(getScopedDbName(userId));
    const coord1 = new SyncCoordinator({ userId, store: store1, adapter, isOnline: () => online });

    await coord1.enqueueChange({
      entity: 'trade',
      entityId: 'tr-closed-1',
      op: 'create',
      baseVersion: 0,
      payload: { id: 'tr-closed-1', status: 'CLOSED', netPnl: 1200 },
    });
    // Attempting to update a CLOSED trade must emit an append-only trade_correction
    const corrItem = await coord1.enqueueChange({
      entity: 'trade',
      entityId: 'tr-closed-1',
      op: 'update',
      baseVersion: 1,
      payload: { id: 'tr-closed-1', status: 'CLOSED', netPnl: 1250 },
    });
    expect(corrItem?.entity).toBe('trade_correction');
    expect(corrItem?.op).toBe('correction');

    // Device preference stays out of outbox; account preference syncs
    const devPref = await coord1.enqueueChange({
      entity: 'preference',
      entityId: 'pref-theme',
      op: 'update',
      payload: { key: 'theme', value: 'light', scope: 'device' },
    });
    expect(devPref).toBeNull();

    const exported = await exportPendingOutboxJson(store1);
    expect(exported).toContain('tr-closed-1');
    coord1.dispose();

    // Simulated reload: brand-new store & coordinator instance for same scoped DB
    online = true;
    const store2 = new MemorySyncStoreBackend(userId);
    const coord2 = new SyncCoordinator({ userId, store: store2, adapter, isOnline: () => online });
    await coord2.hydrateFromStore();
    expect(coord2.getSnapshot().pendingCount).toBe(2);

    await coord2.syncNow();
    expect(coord2.getSnapshot().pendingCount).toBe(0);
    const changes = serverPullChanges(userId, '0').changes;
    expect(changes.map((c) => c.entity)).toEqual(['trade', 'trade_correction']);
  });

  it('derives exact StatusChip labels and approved design tokens', () => {
    expect(
      deriveStatusChipDisplay({
        sessionState: 'signedOut',
        syncState: 'idle',
        pendingCount: 0,
        conflictCount: 0,
        lastSyncedAt: null,
      })
    ).toEqual({ kind: 'signedOut', label: 'Signed out', tokenVar: '--ink-3' });

    expect(
      deriveStatusChipDisplay({
        sessionState: 'signedIn',
        syncState: 'idle',
        pendingCount: 0,
        conflictCount: 2,
        lastSyncedAt: '13:00',
      })
    ).toEqual({ kind: 'conflict', label: 'Conflict · 2 to review', tokenVar: '--loss' });

    expect(
      deriveStatusChipDisplay({
        sessionState: 'signedIn',
        syncState: 'offline',
        pendingCount: 4,
        conflictCount: 0,
        lastSyncedAt: '13:00',
      })
    ).toEqual({ kind: 'offline', label: 'Offline · 4 queued', tokenVar: '--warn' });

    expect(
      deriveStatusChipDisplay({
        sessionState: 'signedIn',
        syncState: 'pushing',
        pendingCount: 2,
        conflictCount: 0,
        lastSyncedAt: '13:00',
      })
    ).toEqual({ kind: 'syncing', label: 'Syncing · 2 pending', tokenVar: '--warn' });

    expect(
      deriveStatusChipDisplay({
        sessionState: 'signedIn',
        syncState: 'idle',
        pendingCount: 0,
        conflictCount: 0,
        lastSyncedAt: '13:05',
      })
    ).toEqual({ kind: 'synced', label: 'Synced · 13:05', tokenVar: '--gain' });
  });

  it('verifies /auth/sign-in, /auth/refresh, /auth/sign-out, /sync/changes, and /sync/push protocol handlers with httpOnly SameSite=Lax cookies', async () => {
    const { POST: signInPost } = await import('../../../app/auth/sign-in/route');
    const { POST: refreshPost } = await import('../../../app/auth/refresh/route');
    const { POST: signOutPost } = await import('../../../app/auth/sign-out/route');
    const { GET: changesGet } = await import('../../../app/sync/changes/route');
    const { POST: pushPost } = await import('../../../app/sync/push/route');
    const { NextRequest } = await import('next/server');

    // 0. Reject unauthorized emails and passkey bypasses (email/password single account only)
    const badEmailRes = await signInPost(
      new NextRequest('http://localhost:3000/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'trader@edgeledger.io', password: 'EdgeLedger!2026' }),
      })
    );
    expect(badEmailRes.status).toBe(401);

    const passkeyAttemptRes = await signInPost(
      new NextRequest('http://localhost:3000/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'ommroshan@gmail.com',
          method: 'passkey',
          credentialId: 'pk-edgeledger-device-1',
        }),
      })
    );
    expect(passkeyAttemptRes.status).toBe(401);

    // 1. Sign in -> sets httpOnly SameSite=Lax cookies
    const signInReq = new NextRequest('http://localhost:3000/auth/sign-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ommroshan@gmail.com', password: 'EdgeLedger@010408' }),
    });
    const signInRes = await signInPost(signInReq);
    expect(signInRes.status).toBe(200);
    const signInJson = await signInRes.json();
    expect(signInJson.tokenType).toBe('Bearer');
    expect(signInJson.expiresInSeconds).toBe(14400); // 4 hours per JWT token

    const accessCookie = signInRes.cookies.get('el_access');
    const refreshCookie = signInRes.cookies.get('el_refresh');
    expect(accessCookie?.httpOnly).toBe(true);
    expect(accessCookie?.sameSite).toBe('lax');
    expect(accessCookie?.maxAge).toBe(14400);
    expect(refreshCookie?.httpOnly).toBe(true);
    expect(refreshCookie?.sameSite).toBe('lax');

    // Verify JWT payload has 4-hour lifetime (exp - iat = 14,400,000 ms)
    const jwtParts = String(accessCookie?.value || '').split('.');
    expect(jwtParts).toHaveLength(3);
    const jwtHeader = JSON.parse(Buffer.from(jwtParts[0], 'base64url').toString('utf8'));
    const jwtPayload = JSON.parse(Buffer.from(jwtParts[1], 'base64url').toString('utf8'));
    expect(jwtHeader.typ).toBe('JWT');
    expect(jwtHeader.alg).toBe('HS256');
    expect(jwtPayload.exp - jwtPayload.iat).toBe(4 * 60 * 60 * 1000);

    // 2. Unauthenticated /sync/changes -> 401
    const unauthChanges = await changesGet(new NextRequest('http://localhost:3000/sync/changes?cursor='));
    expect(unauthChanges.status).toBe(401);

    // Bearer JWT authentication also succeeds cleanly
    const bearerChanges = await changesGet(
      new NextRequest('http://localhost:3000/sync/changes?cursor=', {
        headers: { Authorization: `Bearer ${accessCookie!.value}` },
      })
    );
    expect(bearerChanges.status).toBe(200);

    // 3. Authenticated /sync/push + /sync/changes
    const pushReq = new NextRequest('http://localhost:3000/sync/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `el_access=${accessCookie!.value}`,
      },
      body: JSON.stringify({
        items: [
          {
            idempotencyKey: 'http-idemp-1',
            entity: 'account',
            op: 'create',
            baseVersion: 0,
            payload: { id: 'acc-http-1', name: 'HTTP Protocol Desk' },
          },
        ],
      }),
    });
    const pushRes = await pushPost(pushReq);
    expect(pushRes.status).toBe(200);
    const pushJson = await pushRes.json();
    expect(pushJson.results[0].status).toBe('accepted');

    const changesReq = new NextRequest('http://localhost:3000/sync/changes?cursor=0', {
      headers: { Cookie: `el_access=${accessCookie!.value}` },
    });
    const changesRes = await changesGet(changesReq);
    expect(changesRes.status).toBe(200);
    const changesJson = await changesRes.json();
    expect(changesJson.changes).toHaveLength(1);
    expect(changesJson.changes[0].record.name).toBe('HTTP Protocol Desk');

    // 4. Refresh -> rotates cookies; old refresh cookie is revoked
    const refreshReq = new NextRequest('http://localhost:3000/auth/refresh', {
      method: 'POST',
      headers: { Cookie: `el_refresh=${refreshCookie!.value}` },
    });
    const refreshRes = await refreshPost(refreshReq);
    expect(refreshRes.status).toBe(200);
    const rotatedRefresh = refreshRes.cookies.get('el_refresh');
    expect(rotatedRefresh?.value).not.toBe(refreshCookie!.value);

    // Reusing revoked refresh fails with 401
    const reuseRes = await refreshPost(refreshReq);
    expect(reuseRes.status).toBe(401);

    // 5. Sign out clears cookies & revokes current refresh
    const signOutReq = new NextRequest('http://localhost:3000/auth/sign-out', {
      method: 'POST',
      headers: { Cookie: `el_refresh=${rotatedRefresh!.value}` },
    });
    const signOutRes = await signOutPost(signOutReq);
    expect(signOutRes.status).toBe(200);
    expect(signOutRes.cookies.get('el_access')?.maxAge).toBe(0);
    expect(signOutRes.cookies.get('el_refresh')?.maxAge).toBe(0);
  });
});

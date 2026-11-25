import { safeLog } from '../auth/redact';
import {
  CachedEntityEntry,
  ConflictInboxItem,
  OutboxQueueItem,
  SyncEntityKind,
  SyncOperationKind,
  SyncStoreBackend,
} from './indexedDbStore';
import {
  ProtocolHttpError,
  PushBatchRequestItem,
  SyncProtocolAdapter,
} from './syncProtocolAdapter';

export type SyncEngineState =
  | 'idle'
  | 'pulling'
  | 'pushing'
  | 'offline'
  | 'backoff'
  | 'conflict';

export interface SyncStatusSnapshot {
  state: SyncEngineState;
  lastSyncedAt: string | null;
  pendingCount: number;
  conflictCount: number;
  backoffAttempt: number;
  nextRetryAt: number | null;
  lastError: string | null;
  conflicts: ConflictInboxItem[];
  outbox: OutboxQueueItem[];
}

export type SyncCoordinatorListener = (snapshot: SyncStatusSnapshot) => void;

export const BACKOFF_BASE_MS = 1000;
export const BACKOFF_CAP_MS = 5 * 60 * 1000; // 5 minutes (300,000 ms)

/**
 * Computes exponential backoff starting at 1s, doubling each attempt, capped at 5 min, with jitter.
 * Using equal jitter: half deterministic exponential + half random [0, cap/2] keeps delay bounded
 * in [min(cap, base*2^n)/2, min(cap, base*2^n)] while preventing thundering herds.
 */
export function computeBackoffDelayMs(
  attempt: number,
  randomFn: () => number = Math.random
): number {
  const safeAttempt = Math.max(0, attempt);
  const exp = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * Math.pow(2, safeAttempt));
  const half = Math.floor(exp / 2);
  const jitter = Math.floor(Math.min(0.999999, Math.max(0, randomFn())) * (exp - half + 1));
  return Math.min(BACKOFF_CAP_MS, half + jitter);
}

function makeIdempotencyKey(entity: SyncEntityKind, entityId: string, seq: number): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `idemp-${entity}-${entityId}-${seq}-${rand}`;
}

export class SyncCoordinator {
  private userId: string;
  private store: SyncStoreBackend;
  private adapter: SyncProtocolAdapter;
  private isOnlineFn: () => boolean;
  private randomFn: () => number;
  private onRemoteChangesApplied?: (changes: CachedEntityEntry[]) => void;

  private state: SyncEngineState = 'idle';
  private lastSyncedAt: string | null = null;
  private pendingCount = 0;
  private conflictCount = 0;
  private backoffAttempt = 0;
  private nextRetryAt: number | null = null;
  private lastError: string | null = null;
  private conflicts: ConflictInboxItem[] = [];
  private outbox: OutboxQueueItem[] = [];
  private listeners = new Set<SyncCoordinatorListener>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private seqCounter = 0;
  private isRunningCycle = false;

  constructor(options: {
    userId: string;
    store: SyncStoreBackend;
    adapter: SyncProtocolAdapter;
    isOnline?: () => boolean;
    randomFn?: () => number;
    onRemoteChangesApplied?: (changes: CachedEntityEntry[]) => void;
  }) {
    this.userId = options.userId;
    this.store = options.store;
    this.adapter = options.adapter;
    this.isOnlineFn =
      options.isOnline ??
      (() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
    this.randomFn = options.randomFn ?? Math.random;
    this.onRemoteChangesApplied = options.onRemoteChangesApplied;
  }

  subscribe(listener: SyncCoordinatorListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): SyncStatusSnapshot {
    return {
      state: this.state,
      lastSyncedAt: this.lastSyncedAt,
      pendingCount: this.pendingCount,
      conflictCount: this.conflictCount,
      backoffAttempt: this.backoffAttempt,
      nextRetryAt: this.nextRetryAt,
      lastError: this.lastError,
      conflicts: [...this.conflicts],
      outbox: [...this.outbox],
    };
  }

  private emit(): void {
    const snap = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snap);
    }
  }

  async hydrateFromStore(): Promise<void> {
    const [outbox, conflicts] = await Promise.all([
      this.store.getAllOutbox(),
      this.store.getAllConflicts(),
    ]);
    this.outbox = outbox;
    this.conflicts = conflicts;
    this.pendingCount = outbox.length;
    this.conflictCount = conflicts.length;
    this.seqCounter = outbox.reduce((max, item) => Math.max(max, item.seq), this.seqCounter);

    if (!this.isOnlineFn()) {
      this.state = 'offline';
    } else if (this.conflictCount > 0) {
      this.state = 'conflict';
    } else {
      this.state = 'idle';
    }
    this.emit();
  }

  async readCachedEntities(entity?: SyncEntityKind): Promise<CachedEntityEntry[]> {
    return this.store.getAllCache(entity);
  }

  /**
   * Queues a mutation in user-scoped IndexedDB outbox and updates local cache immediately.
   * - Closed trades are append-only: editing a CLOSED trade creates a `trade_correction` item instead of overwriting.
   * - Device-scoped preferences never enter the outbox.
   */
  async enqueueChange(params: {
    entity: SyncEntityKind;
    entityId: string;
    op: SyncOperationKind;
    payload: Record<string, unknown>;
    baseVersion?: number;
  }): Promise<OutboxQueueItem | null> {
    // Device-scoped preferences stay local-only
    if (params.entity === 'preference' && params.payload.scope === 'device') {
      await this.store.putPreference({
        key: String(params.payload.key || params.entityId),
        value: params.payload.value,
        scope: 'device',
        updatedAt: new Date().toISOString(),
      });
      return null;
    }

    let entity: SyncEntityKind = params.entity;
    let entityId = params.entityId;
    let op: SyncOperationKind = params.op;
    let payload: Record<string, unknown> = { ...params.payload };

    // Closed trades are append-only: convert update/upsert on a closed trade into a correction record
    const existingCache = await this.store.getCacheItem('trade', params.entityId);
    const existingIsClosed =
      entity === 'trade' &&
      (String(existingCache?.record?.status || '').toUpperCase() === 'CLOSED' ||
        (params.op === 'update' && String(params.payload?.status || '').toUpperCase() === 'CLOSED'));

    if (existingIsClosed && op !== 'create') {
      entity = 'trade_correction';
      op = 'correction';
      const corrId = `corr-${params.entityId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      entityId = corrId;
      payload = {
        ...payload,
        id: corrId,
        targetTradeId: params.entityId,
        correctionType: 'append_only_adjustment',
        createdAt: new Date().toISOString(),
      };
    }

    const baseVersion =
      params.baseVersion ?? existingCache?.version ?? Number(payload.version ?? 0);

    // Optimistically update local cache (unless append-only correction keeps original closed trade intact)
    const nowIso = new Date().toISOString();
    await this.store.putCacheItem({
      cacheKey: `${entity}:${entityId}`,
      entity,
      id: entityId,
      version: baseVersion,
      updatedAt: nowIso,
      deletedAt: op === 'delete' ? nowIso : null,
      record: { ...payload, id: entityId },
    });

    this.seqCounter += 1;
    const item: OutboxQueueItem = {
      idempotencyKey: makeIdempotencyKey(entity, entityId, this.seqCounter),
      entity,
      entityId,
      op,
      baseVersion,
      payload: { ...payload, id: entityId },
      attempts: 0,
      createdAt: nowIso,
      seq: this.seqCounter,
    };

    await this.store.putOutboxItem(item);
    this.outbox = await this.store.getAllOutbox();
    this.pendingCount = this.outbox.length;

    if (!this.isOnlineFn()) {
      this.state = 'offline';
    }
    this.emit();
    return item;
  }

  handleOffline(): void {
    this.clearRetryTimer();
    this.state = 'offline';
    this.emit();
  }

  async handleReconnect(): Promise<void> {
    this.clearRetryTimer();
    this.backoffAttempt = 0;
    this.nextRetryAt = null;
    await this.syncNow();
  }

  private clearRetryTimer(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private scheduleBackoff(errMessage: string): void {
    this.clearRetryTimer();
    const delayMs = computeBackoffDelayMs(this.backoffAttempt, this.randomFn);
    this.backoffAttempt += 1;
    this.state = 'backoff';
    this.nextRetryAt = Date.now() + delayMs;
    this.lastError = errMessage;
    this.emit();

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.syncNow();
    }, delayMs);
  }

  /**
   * Executes one full sync cycle: pull(cursor) -> push(outbox in order) -> idle | conflict.
   */
  async syncNow(): Promise<boolean> {
    if (this.isRunningCycle) return true;

    if (!this.isOnlineFn()) {
      this.state = 'offline';
      this.emit();
      return false;
    }

    this.isRunningCycle = true;
    this.clearRetryTimer();
    this.lastError = null;

    try {
      // 1. PULL with cursor
      this.state = 'pulling';
      this.emit();

      const cursorRec = await this.store.getCursor(this.userId);
      const pullRes = await this.adapter.pullChanges(cursorRec?.changeToken ?? null);

      const appliedCacheEntries: CachedEntityEntry[] = [];
      for (const change of pullRes.changes) {
        const entry: CachedEntityEntry = {
          cacheKey: `${change.entity}:${change.id}`,
          entity: change.entity,
          id: change.id,
          version: change.version,
          updatedAt: change.updatedAt,
          deletedAt: change.deletedAt,
          record: change.record,
        };
        await this.store.putCacheItem(entry);
        appliedCacheEntries.push(entry);
      }

      if (pullRes.nextCursor !== undefined && pullRes.nextCursor !== null) {
        await this.store.putCursor({
          userId: this.userId,
          changeToken: pullRes.nextCursor,
          updatedAt: new Date().toISOString(),
        });
      }

      if (appliedCacheEntries.length > 0 && this.onRemoteChangesApplied) {
        this.onRemoteChangesApplied(appliedCacheEntries);
      }

      // 2. PUSH outbox items in order, one idempotencyKey per item
      const outboxItems = await this.store.getAllOutbox();
      this.outbox = outboxItems;
      this.pendingCount = outboxItems.length;

      if (outboxItems.length > 0) {
        this.state = 'pushing';
        this.emit();

        // Push in order; if a batch returns conflict for one item, remaining items STILL process cleanly
        const batch: PushBatchRequestItem[] = outboxItems.map((item) => ({
          idempotencyKey: item.idempotencyKey,
          entity: item.entity,
          op: item.op,
          baseVersion: item.baseVersion,
          payload: item.payload,
        }));

        const pushRes = await this.adapter.pushBatch(batch);
        const byKey = new Map(outboxItems.map((i) => [i.idempotencyKey, i]));

        for (const outcome of pushRes.results) {
          const source = byKey.get(outcome.idempotencyKey);
          if (!source) continue;

          if (outcome.status === 'accepted') {
            await this.store.putCacheItem({
              cacheKey: `${source.entity}:${source.entityId}`,
              entity: source.entity,
              id: source.entityId,
              version: outcome.newVersion,
              updatedAt: new Date().toISOString(),
              deletedAt: source.op === 'delete' ? new Date().toISOString() : null,
              record: outcome.record || { ...source.payload, version: outcome.newVersion },
            });
            await this.store.deleteOutboxItem(source.idempotencyKey);
          } else if (outcome.status === 'conflict') {
            // Retain BOTH local and remote version in Conflict Inbox; server wins in live cache for mutable entities
            const conflictItem: ConflictInboxItem = {
              id: `conf-${source.idempotencyKey}`,
              idempotencyKey: source.idempotencyKey,
              entity: source.entity,
              entityId: source.entityId,
              op: source.op,
              baseVersion: source.baseVersion,
              localRecord: source.payload,
              remoteRecord: outcome.remoteRecord,
              reason: outcome.reason,
              detectedAt: new Date().toISOString(),
            };
            await this.store.putConflict(conflictItem);

            // Server wins in cache so UI matches remote while user reviews local edit in Conflict Inbox
            const remoteVer = Number((outcome.remoteRecord as any)?.version ?? source.baseVersion + 1);
            await this.store.putCacheItem({
              cacheKey: `${source.entity}:${source.entityId}`,
              entity: source.entity,
              id: source.entityId,
              version: remoteVer,
              updatedAt: new Date().toISOString(),
              record: (outcome.remoteRecord as any)?.payload || outcome.remoteRecord,
            });

            // Remove from outbox so it never blocks subsequent items
            await this.store.deleteOutboxItem(source.idempotencyKey);
          } else if (outcome.status === 'rejected') {
            // Move rejected item to conflict inbox too so nothing is silently discarded
            await this.store.putConflict({
              id: `rej-${source.idempotencyKey}`,
              idempotencyKey: source.idempotencyKey,
              entity: source.entity,
              entityId: source.entityId,
              op: source.op,
              baseVersion: source.baseVersion,
              localRecord: source.payload,
              remoteRecord: {},
              reason: `Rejected: ${outcome.reason}`,
              detectedAt: new Date().toISOString(),
            });
            await this.store.deleteOutboxItem(source.idempotencyKey);
          }
        }
      }

      this.outbox = await this.store.getAllOutbox();
      this.conflicts = await this.store.getAllConflicts();
      this.pendingCount = this.outbox.length;
      this.conflictCount = this.conflicts.length;
      this.backoffAttempt = 0;
      this.nextRetryAt = null;
      this.lastSyncedAt = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
      this.state = this.conflictCount > 0 ? 'conflict' : 'idle';
      this.emit();
      return true;
    } catch (err: unknown) {
      safeLog('warn', 'Sync cycle interrupted', { error: err });
      if (!this.isOnlineFn() || this.isNetworkFailure(err)) {
        this.state = 'offline';
        this.lastError = err instanceof Error ? err.message : 'Network offline';
        this.emit();
        return false;
      }

      if (
        err instanceof ProtocolHttpError &&
        err.status >= 400 &&
        err.status < 500 &&
        err.status !== 408 &&
        err.status !== 429
      ) {
        if (err.status === 401) {
          // 401 already handled by transport adapter; avoid looping backoff
          this.state = 'idle';
          this.lastError = 'Authentication required';
          this.emit();
          return false;
        }
        this.state = this.conflictCount > 0 ? 'conflict' : 'idle';
        this.lastError = err.message;
        this.emit();
        return false;
      }

      // 5xx, 408 timeout, 429 rate-limit -> exponential backoff + jitter
      this.scheduleBackoff(err instanceof Error ? err.message : 'Server sync error');
      return false;
    } finally {
      this.isRunningCycle = false;
    }
  }

  private isNetworkFailure(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    if (err.name === 'TypeError' && /fetch|network/i.test(err.message)) return true;
    return /ECONNREFUSED|ENOTFOUND|network|offline/i.test(err.message);
  }

  async resolveConflictKeepRemote(conflictId: string): Promise<void> {
    await this.store.deleteConflict(conflictId);
    this.conflicts = await this.store.getAllConflicts();
    this.conflictCount = this.conflicts.length;
    this.state = this.conflictCount > 0 ? 'conflict' : 'idle';
    this.emit();
  }

  async resolveConflictRetryLocal(conflictId: string): Promise<void> {
    const conflict = (await this.store.getAllConflicts()).find((c) => c.id === conflictId);
    if (!conflict) return;

    const remoteVersion = Number(
      (conflict.remoteRecord as any)?.version ?? conflict.baseVersion + 1
    );
    const isClosedTradeConflict =
      conflict.entity === 'trade' &&
      (Boolean((conflict.remoteRecord as any)?.closedImmutable) ||
        String((conflict.remoteRecord as any)?.payload?.status || (conflict.remoteRecord as any)?.status || '').toUpperCase() === 'CLOSED');

    await this.store.deleteConflict(conflictId);
    await this.enqueueChange({
      entity: isClosedTradeConflict ? 'trade_correction' : conflict.entity,
      entityId: isClosedTradeConflict
        ? `corr-${conflict.entityId}-${Date.now()}`
        : conflict.entityId,
      op: isClosedTradeConflict ? 'correction' : conflict.op,
      payload: isClosedTradeConflict
        ? { ...conflict.localRecord, targetTradeId: conflict.entityId }
        : conflict.localRecord,
      baseVersion: isClosedTradeConflict ? 0 : remoteVersion,
    });
    this.conflicts = await this.store.getAllConflicts();
    this.conflictCount = this.conflicts.length;
    this.emit();
    await this.syncNow();
  }

  dispose(): void {
    this.clearRetryTimer();
    this.listeners.clear();
  }
}

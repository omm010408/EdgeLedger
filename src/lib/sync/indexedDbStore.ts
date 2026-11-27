export type SyncEntityKind =
  | 'account'
  | 'strategy'
  | 'trade'
  | 'trade_correction'
  | 'journal'
  | 'risk_rule'
  | 'preference';

export type SyncOperationKind = 'create' | 'update' | 'delete' | 'correction';

export interface OutboxQueueItem {
  idempotencyKey: string;
  entity: SyncEntityKind;
  entityId: string;
  op: SyncOperationKind;
  baseVersion: number;
  payload: Record<string, unknown>;
  attempts: number;
  lastError?: string;
  createdAt: string;
  seq: number;
}

export interface CachedEntityEntry {
  cacheKey: string; // `${entity}:${id}`
  entity: SyncEntityKind;
  id: string;
  version: number;
  updatedAt: string;
  deletedAt?: string | null;
  record: Record<string, unknown>;
}

export interface ConflictInboxItem {
  id: string;
  idempotencyKey: string;
  entity: SyncEntityKind;
  entityId: string;
  op: SyncOperationKind;
  baseVersion: number;
  localRecord: Record<string, unknown>;
  remoteRecord: Record<string, unknown>;
  reason: string;
  detectedAt: string;
}

export interface SyncCursorRecord {
  userId: string;
  changeToken: string;
  updatedAt: string;
}

export interface PreferenceRecord {
  key: string;
  value: unknown;
  scope: 'device' | 'account';
  updatedAt: string;
}

export function getScopedDbName(userId: string): string {
  const safe = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `edgeledger_sync_${safe}`;
}

export interface SyncStoreBackend {
  dbName: string;
  getAllOutbox(): Promise<OutboxQueueItem[]>;
  putOutboxItem(item: OutboxQueueItem): Promise<void>;
  deleteOutboxItem(idempotencyKey: string): Promise<void>;
  getAllCache(entity?: SyncEntityKind): Promise<CachedEntityEntry[]>;
  getCacheItem(entity: SyncEntityKind, id: string): Promise<CachedEntityEntry | null>;
  putCacheItem(entry: CachedEntityEntry): Promise<void>;
  getCursor(userId: string): Promise<SyncCursorRecord | null>;
  putCursor(record: SyncCursorRecord): Promise<void>;
  getAllConflicts(): Promise<ConflictInboxItem[]>;
  putConflict(item: ConflictInboxItem): Promise<void>;
  deleteConflict(id: string): Promise<void>;
  getPreference(key: string): Promise<PreferenceRecord | null>;
  putPreference(pref: PreferenceRecord): Promise<void>;
  clearAll(): Promise<void>;
}

interface MemoryDbSnapshot {
  outbox: Map<string, OutboxQueueItem>;
  cache: Map<string, CachedEntityEntry>;
  cursor: Map<string, SyncCursorRecord>;
  conflicts: Map<string, ConflictInboxItem>;
  preferences: Map<string, PreferenceRecord>;
}

/**
 * Persistent in-memory backing registry (keyed by DB name) used as a safe fallback
 * when IndexedDB is unavailable (Node/SSR) AND to deterministically test reload persistence
 * across re-instantiated SyncStore instances without external test dependencies.
 */
const memoryDatabases = new Map<string, MemoryDbSnapshot>();

export function clearMemoryDatabasesForTests(): void {
  memoryDatabases.clear();
}

function getOrCreateMemoryDb(dbName: string): MemoryDbSnapshot {
  let snap = memoryDatabases.get(dbName);
  if (!snap) {
    snap = {
      outbox: new Map(),
      cache: new Map(),
      cursor: new Map(),
      conflicts: new Map(),
      preferences: new Map(),
    };
    memoryDatabases.set(dbName, snap);
  }
  return snap;
}

export class MemorySyncStoreBackend implements SyncStoreBackend {
  readonly dbName: string;

  constructor(userId: string) {
    this.dbName = getScopedDbName(userId);
    getOrCreateMemoryDb(this.dbName);
  }

  private snap(): MemoryDbSnapshot {
    return getOrCreateMemoryDb(this.dbName);
  }

  async getAllOutbox(): Promise<OutboxQueueItem[]> {
    return Array.from(this.snap().outbox.values()).sort((a, b) => a.seq - b.seq);
  }

  async putOutboxItem(item: OutboxQueueItem): Promise<void> {
    this.snap().outbox.set(item.idempotencyKey, structuredClone(item));
  }

  async deleteOutboxItem(idempotencyKey: string): Promise<void> {
    this.snap().outbox.delete(idempotencyKey);
  }

  async getAllCache(entity?: SyncEntityKind): Promise<CachedEntityEntry[]> {
    const all = Array.from(this.snap().cache.values());
    return entity ? all.filter((e) => e.entity === entity) : all;
  }

  async getCacheItem(entity: SyncEntityKind, id: string): Promise<CachedEntityEntry | null> {
    return this.snap().cache.get(`${entity}:${id}`) ?? null;
  }

  async putCacheItem(entry: CachedEntityEntry): Promise<void> {
    this.snap().cache.set(entry.cacheKey, structuredClone(entry));
  }

  async getCursor(userId: string): Promise<SyncCursorRecord | null> {
    return this.snap().cursor.get(userId) ?? null;
  }

  async putCursor(record: SyncCursorRecord): Promise<void> {
    this.snap().cursor.set(record.userId, structuredClone(record));
  }

  async getAllConflicts(): Promise<ConflictInboxItem[]> {
    return Array.from(this.snap().conflicts.values());
  }

  async putConflict(item: ConflictInboxItem): Promise<void> {
    this.snap().conflicts.set(item.id, structuredClone(item));
  }

  async deleteConflict(id: string): Promise<void> {
    this.snap().conflicts.delete(id);
  }

  async getPreference(key: string): Promise<PreferenceRecord | null> {
    return this.snap().preferences.get(key) ?? null;
  }

  async putPreference(pref: PreferenceRecord): Promise<void> {
    this.snap().preferences.set(pref.key, structuredClone(pref));
  }

  async clearAll(): Promise<void> {
    memoryDatabases.delete(this.dbName);
  }
}

const STORE_NAMES = ['outbox', 'cache', 'cursor', 'conflicts', 'preferences'] as const;

export class IndexedDbSyncStore implements SyncStoreBackend {
  readonly dbName: string;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private idbFactory: IDBFactory;

  constructor(userId: string, idbFactory?: IDBFactory) {
    this.dbName = getScopedDbName(userId);
    const factory = idbFactory || (typeof indexedDB !== 'undefined' ? indexedDB : undefined);
    if (!factory) {
      throw new Error('IndexedDB factory is not available in this environment.');
    }
    this.idbFactory = factory;
  }

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = this.idbFactory.open(this.dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('outbox')) {
          db.createObjectStore('outbox', { keyPath: 'idempotencyKey' });
        }
        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache', { keyPath: 'cacheKey' });
        }
        if (!db.objectStoreNames.contains('cursor')) {
          db.createObjectStore('cursor', { keyPath: 'userId' });
        }
        if (!db.objectStoreNames.contains('conflicts')) {
          db.createObjectStore('conflicts', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('preferences')) {
          db.createObjectStore('preferences', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB sync database.'));
    });
    return this.dbPromise;
  }

  private async runTx<T>(
    storeName: (typeof STORE_NAMES)[number],
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const req = fn(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error(`IndexedDB ${storeName} error`));
    });
  }

  async getAllOutbox(): Promise<OutboxQueueItem[]> {
    const list = await this.runTx<OutboxQueueItem[]>('outbox', 'readonly', (s) => s.getAll());
    return (list || []).sort((a, b) => a.seq - b.seq);
  }

  async putOutboxItem(item: OutboxQueueItem): Promise<void> {
    await this.runTx('outbox', 'readwrite', (s) => s.put(item));
  }

  async deleteOutboxItem(idempotencyKey: string): Promise<void> {
    await this.runTx('outbox', 'readwrite', (s) => s.delete(idempotencyKey));
  }

  async getAllCache(entity?: SyncEntityKind): Promise<CachedEntityEntry[]> {
    const list = await this.runTx<CachedEntityEntry[]>('cache', 'readonly', (s) => s.getAll());
    return entity ? (list || []).filter((e) => e.entity === entity) : list || [];
  }

  async getCacheItem(entity: SyncEntityKind, id: string): Promise<CachedEntityEntry | null> {
    const res = await this.runTx<CachedEntityEntry | undefined>('cache', 'readonly', (s) =>
      s.get(`${entity}:${id}`)
    );
    return res ?? null;
  }

  async putCacheItem(entry: CachedEntityEntry): Promise<void> {
    await this.runTx('cache', 'readwrite', (s) => s.put(entry));
  }

  async getCursor(userId: string): Promise<SyncCursorRecord | null> {
    const res = await this.runTx<SyncCursorRecord | undefined>('cursor', 'readonly', (s) =>
      s.get(userId)
    );
    return res ?? null;
  }

  async putCursor(record: SyncCursorRecord): Promise<void> {
    await this.runTx('cursor', 'readwrite', (s) => s.put(record));
  }

  async getAllConflicts(): Promise<ConflictInboxItem[]> {
    return (await this.runTx<ConflictInboxItem[]>('conflicts', 'readonly', (s) => s.getAll())) || [];
  }

  async putConflict(item: ConflictInboxItem): Promise<void> {
    await this.runTx('conflicts', 'readwrite', (s) => s.put(item));
  }

  async deleteConflict(id: string): Promise<void> {
    await this.runTx('conflicts', 'readwrite', (s) => s.delete(id));
  }

  async getPreference(key: string): Promise<PreferenceRecord | null> {
    const res = await this.runTx<PreferenceRecord | undefined>('preferences', 'readonly', (s) =>
      s.get(key)
    );
    return res ?? null;
  }

  async putPreference(pref: PreferenceRecord): Promise<void> {
    await this.runTx('preferences', 'readwrite', (s) => s.put(pref));
  }

  async clearAll(): Promise<void> {
    if (this.dbPromise) {
      const db = await this.dbPromise.catch(() => null);
      db?.close();
      this.dbPromise = null;
    }
    await new Promise<void>((resolve) => {
      const req = this.idbFactory.deleteDatabase(this.dbName);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  }
}

export function createUserSyncStore(userId: string): SyncStoreBackend {
  if (typeof indexedDB !== 'undefined') {
    return new IndexedDbSyncStore(userId);
  }
  return new MemorySyncStoreBackend(userId);
}

export async function exportPendingOutboxJson(store: SyncStoreBackend): Promise<string> {
  const [outbox, conflicts] = await Promise.all([store.getAllOutbox(), store.getAllConflicts()]);
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      dbName: store.dbName,
      pendingOutbox: outbox,
      conflicts,
    },
    null,
    2
  );
}

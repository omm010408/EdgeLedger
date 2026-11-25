import {
  AccountRule,
  Trade,
  TradeAllocation,
  TradeExecution,
  TradingAccount,
} from '../types/financial';

export type SyncEntityType = 'account' | 'trade' | 'strategy' | 'journal' | 'alert';

export interface SyncTombstone {
  id: string;
  entityType: SyncEntityType;
  deletedAt: string;
}

export interface OutboxMutation {
  id: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: 'upsert' | 'delete';
  timestamp: string;
  payload?: unknown;
}

export interface ReconcileResult<T> {
  merged: T[];
  toPushToCloud: T[];
  toDeleteFromCloud: string[];
  pulledCount: number;
  conflictResolutions: number;
}

export interface ReconcileOptions<T> {
  local: T[];
  remote: T[];
  tombstones?: SyncTombstone[];
  entityType?: SyncEntityType;
  getId: (item: T) => string;
  getUpdatedAt: (item: T) => string | undefined;
  mergeItem?: (local: T, remote: T) => { item: T; changedFromLocal: boolean; shouldPush: boolean };
}

export const TOMBSTONE_STORAGE_KEY = 'edgeledger_sync_tombstones';
export const OUTBOX_STORAGE_KEY = 'edgeledger_sync_queue';

/** Parse an ISO timestamp string to epoch milliseconds, returning 0 if missing or invalid. */
export function parseTimestampMs(iso?: string | null): number {
  if (!iso) return 0;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Deterministically reconcile local and remote entity lists without blindly overwriting
 * newer or offline local mutations. Respects delete tombstones unless remote was edited
 * strictly after the deletion timestamp.
 */
export function reconcileEntityLists<T>(options: ReconcileOptions<T>): ReconcileResult<T> {
  const {
    local,
    remote,
    tombstones = [],
    entityType,
    getId,
    getUpdatedAt,
    mergeItem,
  } = options;

  const tombstoneMap = new Map<string, number>();
  for (const t of tombstones) {
    if (entityType && t.entityType !== entityType) continue;
    const ms = parseTimestampMs(t.deletedAt);
    const existing = tombstoneMap.get(t.id) ?? 0;
    if (ms > existing) {
      tombstoneMap.set(t.id, ms);
    }
  }

  const localMap = new Map<string, T>();
  const remoteMap = new Map<string, T>();
  const orderedIds: string[] = [];
  const seenIds = new Set<string>();

  for (const item of local) {
    const id = getId(item);
    localMap.set(id, item);
    if (!seenIds.has(id)) {
      seenIds.add(id);
      orderedIds.push(id);
    }
  }

  for (const item of remote) {
    const id = getId(item);
    remoteMap.set(id, item);
    if (!seenIds.has(id)) {
      seenIds.add(id);
      orderedIds.push(id);
    }
  }

  const merged: T[] = [];
  const toPushToCloud: T[] = [];
  const toDeleteFromCloud: string[] = [];
  let pulledCount = 0;
  let conflictResolutions = 0;

  for (const id of orderedIds) {
    const localItem = localMap.get(id);
    const remoteItem = remoteMap.get(id);
    const deletedMs = tombstoneMap.get(id) ?? 0;
    const localMs = localItem ? parseTimestampMs(getUpdatedAt(localItem)) : 0;
    const remoteMs = remoteItem ? parseTimestampMs(getUpdatedAt(remoteItem)) : 0;

    // Respect tombstone unless item was recreated/updated strictly after deletion.
    if (deletedMs > 0) {
      const recreatedLocally = localItem && localMs > deletedMs;
      const recreatedRemotely = remoteItem && remoteMs > deletedMs;

      if (!recreatedLocally && !recreatedRemotely) {
        if (remoteItem) {
          toDeleteFromCloud.push(id);
        }
        continue;
      }
    }

    if (localItem && !remoteItem) {
      merged.push(localItem);
      toPushToCloud.push(localItem);
      continue;
    }

    if (!localItem && remoteItem) {
      merged.push(remoteItem);
      pulledCount++;
      continue;
    }

    if (localItem && remoteItem) {
      if (mergeItem) {
        const result = mergeItem(localItem, remoteItem);
        merged.push(result.item);
        if (result.shouldPush) {
          toPushToCloud.push(result.item);
        }
        if (result.changedFromLocal) {
          pulledCount++;
        }
        if (localMs !== remoteMs) {
          conflictResolutions++;
        }
      } else if (remoteMs > localMs) {
        merged.push(remoteItem);
        pulledCount++;
        conflictResolutions++;
      } else if (localMs > remoteMs) {
        merged.push(localItem);
        toPushToCloud.push(localItem);
        conflictResolutions++;
      } else {
        // Equal timestamps: preserve local instance to avoid UI flicker/overwrites
        merged.push(localItem);
      }
    }
  }

  return {
    merged,
    toPushToCloud,
    toDeleteFromCloud,
    pulledCount,
    conflictResolutions,
  };
}

/** Merge nested account rules by ID, preferring rules from the newer side or higher version. */
function mergeRules(
  localRules: AccountRule[],
  remoteRules: AccountRule[],
  preferLocalOnTie: boolean
): { rules: AccountRule[]; differsFromLocal: boolean; differsFromRemote: boolean } {
  const localMap = new Map(localRules.map((r) => [r.id, r]));
  const remoteMap = new Map(remoteRules.map((r) => [r.id, r]));
  const ids = Array.from(new Set([...localRules.map((r) => r.id), ...remoteRules.map((r) => r.id)]));

  const rules: AccountRule[] = [];
  let differsFromLocal = ids.length !== localRules.length;
  let differsFromRemote = ids.length !== remoteRules.length;

  for (const id of ids) {
    const l = localMap.get(id);
    const r = remoteMap.get(id);
    if (l && !r) {
      rules.push(l);
      differsFromRemote = true;
    } else if (!l && r) {
      rules.push(r);
      differsFromLocal = true;
    } else if (l && r) {
      const lVer = l.version ?? 1;
      const rVer = r.version ?? 1;
      if (rVer > lVer) {
        rules.push(r);
        differsFromLocal = true;
      } else if (lVer > rVer || preferLocalOnTie) {
        rules.push(l);
        if (JSON.stringify(l) !== JSON.stringify(r)) differsFromRemote = true;
      } else {
        rules.push(r);
        if (JSON.stringify(l) !== JSON.stringify(r)) differsFromLocal = true;
      }
    }
  }

  return { rules, differsFromLocal, differsFromRemote };
}

/**
 * Non-overriding merge for TradingAccount that combines LWW scalar resolution
 * with nested AccountRule union reconciliation.
 */
export function mergeAccount(
  local: TradingAccount,
  remote: TradingAccount
): { item: TradingAccount; changedFromLocal: boolean; shouldPush: boolean } {
  const localMs = parseTimestampMs(local.updatedAt || local.createdAt);
  const remoteMs = parseTimestampMs(remote.updatedAt || remote.createdAt);
  const preferLocal = localMs >= remoteMs;

  const base = preferLocal ? local : remote;
  const { rules, differsFromLocal, differsFromRemote } = mergeRules(
    local.rules || [],
    remote.rules || [],
    preferLocal
  );

  const item: TradingAccount = {
    ...base,
    notes: base.notes ?? (preferLocal ? remote.notes : local.notes),
    rules,
  };

  return {
    item,
    changedFromLocal: !preferLocal || differsFromLocal,
    shouldPush: localMs > remoteMs || differsFromRemote,
  };
}

function mergeExecutions(
  localExecs: TradeExecution[],
  remoteExecs: TradeExecution[]
): { executions: TradeExecution[]; addedFromRemote: boolean; missingInRemote: boolean } {
  const map = new Map<string, TradeExecution>();
  const remoteIds = new Set(remoteExecs.map((e) => e.id));
  const localIds = new Set(localExecs.map((e) => e.id));

  for (const exec of localExecs) {
    map.set(exec.id, exec);
  }
  let addedFromRemote = false;
  for (const exec of remoteExecs) {
    if (!localIds.has(exec.id)) {
      addedFromRemote = true;
    }
    if (!map.has(exec.id)) {
      map.set(exec.id, exec);
    }
  }

  let missingInRemote = false;
  for (const id of localIds) {
    if (!remoteIds.has(id)) {
      missingInRemote = true;
      break;
    }
  }

  const executions = Array.from(map.values()).sort(
    (a, b) => parseTimestampMs(a.executionTime) - parseTimestampMs(b.executionTime)
  );
  return { executions, addedFromRemote, missingInRemote };
}

function mergeAllocations(
  localAllocs: TradeAllocation[],
  remoteAllocs: TradeAllocation[],
  preferLocal: boolean
): { allocations: TradeAllocation[]; changedFromLocal: boolean; shouldPush: boolean } {
  const localMap = new Map(localAllocs.map((a) => [a.id, a]));
  const remoteMap = new Map(remoteAllocs.map((a) => [a.id, a]));
  const ids = Array.from(new Set([...localAllocs.map((a) => a.id), ...remoteAllocs.map((a) => a.id)]));

  const allocations: TradeAllocation[] = [];
  let changedFromLocal = !preferLocal;
  let shouldPush = false;

  for (const id of ids) {
    const l = localMap.get(id);
    const r = remoteMap.get(id);
    if (l && !r) {
      allocations.push(l);
      shouldPush = true;
    } else if (!l && r) {
      allocations.push(r);
      changedFromLocal = true;
    } else if (l && r) {
      const base = preferLocal ? l : r;
      const { executions, addedFromRemote, missingInRemote } = mergeExecutions(
        l.executions || [],
        r.executions || []
      );
      allocations.push({
        ...base,
        accountName: base.accountName || l.accountName || r.accountName,
        executions,
      });
      if (addedFromRemote) changedFromLocal = true;
      if (missingInRemote) shouldPush = true;
    }
  }

  return { allocations, changedFromLocal, shouldPush };
}

/**
 * Non-overriding merge for Trade preserving nested allocations, executions,
 * tags, and screenshots across offline/online edits.
 */
export function mergeTrade(
  local: Trade,
  remote: Trade
): { item: Trade; changedFromLocal: boolean; shouldPush: boolean } {
  const localMs = parseTimestampMs(local.updatedAt || local.createdAt);
  const remoteMs = parseTimestampMs(remote.updatedAt || remote.createdAt);
  const preferLocal = localMs >= remoteMs;

  const base = preferLocal ? local : remote;
  const fallback = preferLocal ? remote : local;

  const tags = Array.from(new Set([...(local.tags || []), ...(remote.tags || [])]));
  const screenshots = Array.from(new Set([...(local.screenshots || []), ...(remote.screenshots || [])]));
  const allocMerge = mergeAllocations(local.allocations || [], remote.allocations || [], preferLocal);

  const item: Trade = {
    ...base,
    strategyName: base.strategyName || fallback.strategyName,
    tradeThesis: base.tradeThesis ?? fallback.tradeThesis,
    technicalBias: base.technicalBias ?? fallback.technicalBias,
    macroBias: base.macroBias ?? fallback.macroBias,
    tags,
    screenshots,
    allocations: allocMerge.allocations,
  };

  return {
    item,
    changedFromLocal: !preferLocal || allocMerge.changedFromLocal,
    shouldPush: localMs > remoteMs || allocMerge.shouldPush,
  };
}

function readJsonStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota issues cleanly
  }
}

export function loadTombstones(): SyncTombstone[] {
  const all = readJsonStorage<SyncTombstone[]>(TOMBSTONE_STORAGE_KEY, []);
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  return all.filter((t) => parseTimestampMs(t.deletedAt) >= cutoff);
}

export function saveTombstones(tombstones: SyncTombstone[]): void {
  writeJsonStorage(TOMBSTONE_STORAGE_KEY, tombstones);
}

export function recordTombstone(entityType: SyncEntityType, id: string): SyncTombstone[] {
  const current = loadTombstones().filter(
    (t) => !(t.entityType === entityType && t.id === id)
  );
  const updated: SyncTombstone[] = [
    ...current,
    { id, entityType, deletedAt: new Date().toISOString() },
  ];
  saveTombstones(updated);
  return updated;
}

export function loadOutbox(): OutboxMutation[] {
  return readJsonStorage<OutboxMutation[]>(OUTBOX_STORAGE_KEY, []);
}

export function saveOutbox(mutations: OutboxMutation[]): void {
  writeJsonStorage(OUTBOX_STORAGE_KEY, mutations);
}

export function enqueueMutation(
  entityType: SyncEntityType,
  entityId: string,
  operation: 'upsert' | 'delete',
  payload?: unknown
): OutboxMutation[] {
  const existing = loadOutbox().filter(
    (m) => !(m.entityType === entityType && m.entityId === entityId)
  );
  const next: OutboxMutation[] = [
    ...existing,
    {
      id: `${entityType}:${entityId}:${Date.now()}`,
      entityType,
      entityId,
      operation,
      timestamp: new Date().toISOString(),
      payload,
    },
  ];
  saveOutbox(next);
  return next;
}

export function removeOutboxItems(entityIds: Set<string>): OutboxMutation[] {
  const remaining = loadOutbox().filter((m) => !entityIds.has(`${m.entityType}:${m.entityId}`));
  saveOutbox(remaining);
  return remaining;
}

export function clearOutbox(): void {
  saveOutbox([]);
}

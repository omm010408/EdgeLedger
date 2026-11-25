import { SyncEntityKind, SyncOperationKind } from './indexedDbStore';

export interface SyncBridgeEvent {
  entity: SyncEntityKind;
  entityId: string;
  op: SyncOperationKind;
  payload: Record<string, unknown>;
  baseVersion?: number;
}

type BridgeListener = (event: SyncBridgeEvent) => void;

const listeners = new Set<BridgeListener>();

export function emitSyncBridgeEvent(event: SyncBridgeEvent): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // Bridge emission must never disrupt primary UI state updates
    }
  }
}

export function subscribeSyncBridge(listener: BridgeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

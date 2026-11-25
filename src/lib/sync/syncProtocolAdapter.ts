import { SyncEntityKind, SyncOperationKind } from './indexedDbStore';

export interface ProtocolChangeRecord {
  seq: number;
  entity: SyncEntityKind;
  id: string;
  op: SyncOperationKind;
  version: number;
  updatedAt: string;
  deletedAt?: string | null;
  record: Record<string, unknown>;
}

export interface PullChangesResponse {
  changes: ProtocolChangeRecord[];
  nextCursor: string;
}

export interface PushBatchRequestItem {
  idempotencyKey: string;
  entity: SyncEntityKind;
  op: SyncOperationKind;
  baseVersion: number;
  payload: Record<string, unknown>;
}

export type PushItemOutcome =
  | {
      idempotencyKey: string;
      status: 'accepted';
      entity: SyncEntityKind;
      id: string;
      newVersion: number;
      record?: Record<string, unknown>;
    }
  | {
      idempotencyKey: string;
      status: 'conflict';
      entity: SyncEntityKind;
      id: string;
      remoteRecord: Record<string, unknown>;
      reason: string;
    }
  | {
      idempotencyKey: string;
      status: 'rejected';
      entity: SyncEntityKind;
      id: string;
      reason: string;
    };

export interface PushBatchResponse {
  results: PushItemOutcome[];
}

export interface SyncProtocolAdapter {
  pullChanges(cursor: string | null): Promise<PullChangesResponse>;
  pushBatch(items: PushBatchRequestItem[]): Promise<PushBatchResponse>;
}

export class ProtocolHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ProtocolHttpError';
    this.status = status;
  }
}

export interface HttpSyncAdapterOptions {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Default HTTP adapter matching the EdgeLedger sync contract:
 * - GET /sync/changes?cursor= -> { changes[], nextCursor }
 * - POST /sync/push -> { items } -> { results[] }
 *
 * Point `baseUrl` or supply custom mappers in this adapter without touching existing fetch calls.
 */
export function createHttpSyncProtocolAdapter(
  options: HttpSyncAdapterOptions = {}
): SyncProtocolAdapter {
  const baseUrl = (options.baseUrl || '').replace(/\/+$/, '');
  const fetchImpl = options.fetchFn || ((...args: Parameters<typeof fetch>) => fetch(...args));
  const timeoutMs = options.timeoutMs ?? 15_000;

  async function requestJson<T>(url: string, init: RequestInit): Promise<T> {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

    try {
      const res = await fetchImpl(url, {
        ...init,
        credentials: 'include',
        signal: controller?.signal,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new ProtocolHttpError(
          res.status,
          errBody?.detail || errBody?.error || `Sync HTTP ${res.status}`
        );
      }

      return (await res.json()) as T;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return {
    async pullChanges(cursor: string | null): Promise<PullChangesResponse> {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '?cursor=';
      return requestJson<PullChangesResponse>(`${baseUrl}/sync/changes${query}`, {
        method: 'GET',
      });
    },

    async pushBatch(items: PushBatchRequestItem[]): Promise<PushBatchResponse> {
      return requestJson<PushBatchResponse>(`${baseUrl}/sync/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items }),
      });
    },
  };
}

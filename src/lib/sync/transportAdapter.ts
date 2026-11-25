import { safeLog } from '../auth/redact';

export interface TransportSessionBridge {
  refresh: () => Promise<boolean>;
  forceSignOut: () => Promise<void>;
}

export interface TransportAdapterOptions {
  baseFetch: typeof fetch;
  session: TransportSessionBridge;
  maxRetries?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onAuthFailure?: () => void;
}

const AUTH_EXEMPT_PATHS = ['/auth/sign-in', '/auth/refresh', '/auth/sign-out'];

function extractUrlString(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function isAuthEndpoint(urlStr: string): boolean {
  return AUTH_EXEMPT_PATHS.some((p) => urlStr.includes(p));
}

function isReadMethod(method?: string): boolean {
  const m = (method || 'GET').toUpperCase();
  return m === 'GET' || m === 'HEAD';
}

function extractHeaders(init?: RequestInit, input?: RequestInfo | URL): Headers {
  const headers = new Headers(
    input instanceof Request ? input.headers : undefined
  );
  if (init?.headers) {
    new Headers(init.headers).forEach((v, k) => headers.set(k, v));
  }
  return headers;
}

function hasIdempotencyKey(
  urlStr: string,
  init?: RequestInit,
  input?: RequestInfo | URL
): boolean {
  const headers = extractHeaders(init, input);
  if (headers.has('Idempotency-Key') || headers.has('X-Idempotency-Key')) {
    return true;
  }
  // Outbox batch push carries per-item idempotencyKey inside payload
  if (urlStr.includes('/sync/push') && typeof init?.body === 'string') {
    try {
      const parsed = JSON.parse(init.body);
      if (
        Array.isArray(parsed?.items) &&
        parsed.items.length > 0 &&
        parsed.items.every((item: any) => typeof item?.idempotencyKey === 'string' && item.idempotencyKey.length > 0)
      ) {
        return true;
      }
    } catch {
      return false;
    }
  }
  return false;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createTransportFetch(options: TransportAdapterOptions): typeof fetch {
  const {
    baseFetch,
    session,
    maxRetries = 2,
    baseDelayMs = 200,
    sleep = defaultSleep,
  } = options;

  let inflightRefresh: Promise<boolean> | null = null;

  async function refreshOnce(): Promise<boolean> {
    if (!inflightRefresh) {
      inflightRefresh = session.refresh().finally(() => {
        inflightRefresh = null;
      });
    }
    return inflightRefresh;
  }

  return async function transportFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const urlStr = extractUrlString(input);
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const requestInit: RequestInit = {
      ...init,
      credentials: init?.credentials ?? 'include',
    };

    const retryEligible = isReadMethod(method) || hasIdempotencyKey(urlStr, requestInit, input);
    const exemptAuth = isAuthEndpoint(urlStr);

    let authRetried = false;
    let attempt = 0;

    while (true) {
      try {
        const response = await baseFetch(input, requestInit);

        // 401 -> refresh once and retry once; second 401 signs out
        if (response.status === 401 && !exemptAuth) {
          if (!authRetried) {
            authRetried = true;
            const refreshed = await refreshOnce();
            if (refreshed) {
              continue;
            }
          }
          await session.forceSignOut();
          return response;
        }

        // 5xx transient error -> retry ONLY reads or outbox/idempotent items
        if (response.status >= 500 && response.status < 600 && retryEligible && attempt < maxRetries) {
          attempt += 1;
          await sleep(baseDelayMs * Math.pow(2, attempt - 1));
          continue;
        }

        return response;
      } catch (err) {
        safeLog('warn', `Transport fetch error on ${method} ${urlStr}`, { error: err });
        if (retryEligible && attempt < maxRetries) {
          attempt += 1;
          await sleep(baseDelayMs * Math.pow(2, attempt - 1));
          continue;
        }
        throw err;
      }
    }
  };
}

/**
 * Installs the transport fetch wrapper at the app root (`window.fetch` / `globalThis.fetch`).
 * Returns a cleanup/restore function. Idempotent if called multiple times.
 */
export function installTransportAdapter(
  session: TransportSessionBridge,
  target: { fetch: typeof fetch } = globalThis
): () => void {
  const anyTarget = target as unknown as {
    fetch: typeof fetch & { __edgeledgerWrapped?: boolean };
    __edgeledgerOriginalFetch?: typeof fetch;
  };

  if (anyTarget.fetch?.__edgeledgerWrapped && anyTarget.__edgeledgerOriginalFetch) {
    const wrapped = createTransportFetch({
      baseFetch: anyTarget.__edgeledgerOriginalFetch,
      session,
    }) as typeof fetch & { __edgeledgerWrapped?: boolean };
    wrapped.__edgeledgerWrapped = true;
    anyTarget.fetch = wrapped;
    return () => {
      if (anyTarget.__edgeledgerOriginalFetch) {
        anyTarget.fetch = anyTarget.__edgeledgerOriginalFetch;
      }
    };
  }

  const original = anyTarget.fetch.bind(target);
  anyTarget.__edgeledgerOriginalFetch = original;

  const wrapped = createTransportFetch({
    baseFetch: original,
    session,
  }) as typeof fetch & { __edgeledgerWrapped?: boolean };
  wrapped.__edgeledgerWrapped = true;
  anyTarget.fetch = wrapped;

  return () => {
    if (anyTarget.__edgeledgerOriginalFetch) {
      anyTarget.fetch = anyTarget.__edgeledgerOriginalFetch;
    }
  };
}

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAppConfig } from '../config/env';
import { redactSensitive } from './redact';

export const ACCESS_COOKIE_NAME = 'el_access';
export const REFRESH_COOKIE_NAME = 'el_refresh';

export const ACCESS_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours per JWT token
export const ACCESS_TTL_SECONDS = ACCESS_TTL_MS / 1000; // 14400 seconds
const REFRESH_TTL_MS = ACCESS_TTL_MS; // 4 hours max, bound to current browser session only

export const BROWSER_SESSION_HEADER = 'x-edgeledger-session-id';

export interface SessionTokenClaims {
  sub: string;
  email: string;
  deviceId: string;
  sid?: string;
  typ: 'access' | 'refresh';
  jti: string;
  iat: number;
  exp: number;
}

export interface SyncEntityRecord {
  id: string;
  entity: SyncProtocolEntity;
  version: number;
  updatedAt: string;
  deletedAt?: string | null;
  closedImmutable?: boolean;
  payload: Record<string, unknown>;
}

export type SyncProtocolEntity = 'account' | 'strategy' | 'trade' | 'trade_correction' | 'journal' | 'risk_rule' | 'preference';
export type SyncProtocolOp = 'create' | 'update' | 'delete' | 'correction';

export interface SyncPushItemRequest {
  idempotencyKey: string;
  entity: SyncProtocolEntity;
  op: SyncProtocolOp;
  baseVersion: number;
  payload: Record<string, unknown>;
}

export type SyncPushItemResult =
  | {
      idempotencyKey: string;
      status: 'accepted';
      entity: SyncProtocolEntity;
      id: string;
      newVersion: number;
      record: Record<string, unknown>;
    }
  | {
      idempotencyKey: string;
      status: 'conflict';
      entity: SyncProtocolEntity;
      id: string;
      remoteRecord: Record<string, unknown>;
      reason: string;
    }
  | {
      idempotencyKey: string;
      status: 'rejected';
      entity: SyncProtocolEntity;
      id: string;
      reason: string;
    };

export interface SyncChangeEntry {
  seq: number;
  entity: SyncProtocolEntity;
  id: string;
  op: SyncProtocolOp;
  version: number;
  updatedAt: string;
  deletedAt?: string | null;
  record: Record<string, unknown>;
}

interface ServerAuthAndSyncStore {
  secret: string;
  revokedRefreshIds: Set<string>;
  usersByEmail: Map<string, { userId: string; email: string; passwordHash: string; passkeyIds: string[] }>;
  passkeyChallenges: Map<string, number>;
  recordsByUser: Map<string, Map<string, SyncEntityRecord>>;
  changesByUser: Map<string, SyncChangeEntry[]>;
  idempotencyByUser: Map<string, Map<string, SyncPushItemResult>>;
}

const g = globalThis as unknown as { __edgeledger_auth_sync_store__?: ServerAuthAndSyncStore };

function hashSecretInput(password: string): string {
  return crypto.createHash('sha256').update(`edgeledger-pw:${password}`).digest('hex');
}

const RUNTIME_SECRET_ENV_KEY = '__EDGELEDGER_RUNTIME_AUTH_SECRET';

function resolveServerAuthSecret(): string {
  if (process.env.EDGELEDGER_AUTH_SECRET) {
    return process.env.EDGELEDGER_AUTH_SECRET;
  }
  if (!process.env[RUNTIME_SECRET_ENV_KEY]) {
    // Derive a process-stable secret across Next.js route bundles and serverless lambdas
    // when EDGELEDGER_AUTH_SECRET is not explicitly configured.
    const material =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL ||
      'edgeledger-local-dev-auth-key-v1';
    process.env[RUNTIME_SECRET_ENV_KEY] = crypto
      .createHash('sha256')
      .update(`edgeledger-jwt-hmac:${material}`)
      .digest('hex');
  }
  return process.env[RUNTIME_SECRET_ENV_KEY]!;
}

export const DESK_LOCK_PIN = '1973';

const SINGLE_AUTH_USER = {
  userId: 'usr-edgeledger-primary',
  email: 'ommroshan@gmail.com',
  passwordHash: hashSecretInput('EdgeLedger@010408'),
  passkeyIds: [] as string[],
};

function getStore(): ServerAuthAndSyncStore {
  const runtimeSecret = resolveServerAuthSecret();
  if (!g.__edgeledger_auth_sync_store__) {
    const users = new Map<
      string,
      { userId: string; email: string; passwordHash: string; passkeyIds: string[] }
    >();
    users.set(SINGLE_AUTH_USER.email, SINGLE_AUTH_USER);

    g.__edgeledger_auth_sync_store__ = {
      secret: runtimeSecret,
      revokedRefreshIds: new Set<string>(),
      usersByEmail: users,
      passkeyChallenges: new Map(),
      recordsByUser: new Map(),
      changesByUser: new Map(),
      idempotencyByUser: new Map(),
    };
  } else {
    if (g.__edgeledger_auth_sync_store__.secret !== runtimeSecret) {
      g.__edgeledger_auth_sync_store__.secret = runtimeSecret;
    }
    if (!g.__edgeledger_auth_sync_store__.usersByEmail.has(SINGLE_AUTH_USER.email)) {
      g.__edgeledger_auth_sync_store__.usersByEmail.set(SINGLE_AUTH_USER.email, SINGLE_AUTH_USER);
    }
  }
  return g.__edgeledger_auth_sync_store__;
}

function base64UrlEncode(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function signSessionToken(claims: SessionTokenClaims): string {
  const store = getStore();
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64UrlEncode(JSON.stringify(claims));
  const sig = base64UrlEncode(
    crypto.createHmac('sha256', store.secret).update(`${header}.${payload}`).digest()
  );
  return `${header}.${payload}.${sig}`;
}

export function verifySessionToken(
  token: string | undefined | null,
  expectedType: 'access' | 'refresh'
): SessionTokenClaims | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, payload, sig] = parts;
  const store = getStore();
  const expectedSig = base64UrlEncode(
    crypto.createHmac('sha256', store.secret).update(`${header}.${payload}`).digest()
  );

  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as SessionTokenClaims;
    if (parsed.typ !== expectedType) return null;
    if (Date.now() >= parsed.exp) return null;
    if (expectedType === 'refresh' && store.revokedRefreshIds.has(parsed.jti)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function authenticateUserCredentials(params: {
  email?: string;
  password?: string;
  method?: 'password' | 'passkey' | 'passcode' | 'pin';
  credentialId?: string;
  passcode?: string;
  pin?: string;
}): { ok: boolean; userId?: string; email?: string; error?: string } {
  if (params.method === 'passcode' || params.method === 'pin') {
    const providedPin = (params.passcode ?? params.pin ?? '').trim();
    if (providedPin !== DESK_LOCK_PIN) {
      return { ok: false, error: 'Incorrect lock PIN.' };
    }
    return { ok: true, userId: SINGLE_AUTH_USER.userId, email: SINGLE_AUTH_USER.email };
  }

  const store = getStore();
  const normalizedEmail = (params.email || '').trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return { ok: false, error: 'Please enter a valid email address.' };
  }

  if (params.method && params.method !== 'password') {
    return { ok: false, error: 'Email and password login only.' };
  }

  const rawPassword = params.password || '';
  const trimmedPassword = rawPassword.trim();
  if (rawPassword.length < 6 && trimmedPassword.length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters.' };
  }

  const existing = store.usersByEmail.get(normalizedEmail);
  const passwordMatches =
    Boolean(existing) &&
    (existing!.passwordHash === hashSecretInput(rawPassword) ||
      existing!.passwordHash === hashSecretInput(trimmedPassword));
  if (!existing || !passwordMatches) {
    return { ok: false, error: 'Invalid email or password.' };
  }

  return { ok: true, userId: existing.userId, email: existing.email };
}

export function extractBrowserSessionHeader(req: NextRequest): string | undefined {
  const value = req.headers.get(BROWSER_SESSION_HEADER)?.trim();
  return value ? value : undefined;
}

export function issueSessionTokens(
  userId: string,
  email: string,
  deviceId?: string,
  browserSessionId?: string
) {
  const now = Date.now();
  const resolvedDeviceId = deviceId || `dev-${crypto.randomUUID().slice(0, 8)}`;
  const normalizedSid = browserSessionId?.trim() || undefined;
  const accessExp = now + ACCESS_TTL_MS;
  const refreshExp = now + REFRESH_TTL_MS;

  const accessToken = signSessionToken({
    sub: userId,
    email,
    deviceId: resolvedDeviceId,
    ...(normalizedSid ? { sid: normalizedSid } : {}),
    typ: 'access',
    jti: crypto.randomUUID(),
    iat: now,
    exp: accessExp,
  });

  const refreshToken = signSessionToken({
    sub: userId,
    email,
    deviceId: resolvedDeviceId,
    ...(normalizedSid ? { sid: normalizedSid } : {}),
    typ: 'refresh',
    jti: crypto.randomUUID(),
    iat: now,
    exp: refreshExp,
  });

  return {
    accessToken,
    refreshToken,
    session: {
      userId,
      email,
      deviceId: resolvedDeviceId,
      accessExpiresAt: new Date(accessExp).toISOString(),
      refreshExpiresAt: new Date(refreshExp).toISOString(),
      state: 'signedIn' as const,
    },
  };
}

export function revokeRefreshToken(token: string | undefined | null): void {
  const claims = verifySessionToken(token, 'refresh');
  if (claims) {
    getStore().revokedRefreshIds.add(claims.jti);
  }
}

export function shouldUseSecureCookie(req?: NextRequest): boolean {
  if (process.env.NODE_ENV === 'production') {
    const proto = req?.headers.get('x-forwarded-proto') || req?.nextUrl?.protocol;
    if (proto === 'http:' || proto === 'http') return false;
    return true;
  }
  return false;
}

export function attachSessionCookies(
  res: NextResponse,
  accessToken: string,
  refreshToken: string,
  req?: NextRequest
): NextResponse {
  const secure = shouldUseSecureCookie(req);
  // Session-only cookies (no maxAge/expires): automatically discarded when the browser session ends
  res.cookies.set(ACCESS_COOKIE_NAME, accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
  });
  res.cookies.set(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
  });
  return res;
}

export function clearSessionCookies(res: NextResponse, req?: NextRequest): NextResponse {
  const secure = shouldUseSecureCookie(req);
  res.cookies.set(ACCESS_COOKIE_NAME, '', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  res.cookies.set(REFRESH_COOKIE_NAME, '', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return res;
}

export function verifyBrowserSessionBinding(
  claims: SessionTokenClaims | null,
  req: NextRequest
): SessionTokenClaims | null {
  if (!claims) return null;
  if (claims.sid) {
    const requestSid = extractBrowserSessionHeader(req);
    if (requestSid && requestSid !== claims.sid) {
      return null;
    }
  }
  return claims;
}

export function requireAuthenticatedClaims(req: NextRequest): SessionTokenClaims | null {
  const authHeader = req.headers.get('authorization');
  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    const bearerToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    const bearerClaims = verifyBrowserSessionBinding(verifySessionToken(bearerToken, 'access'), req);
    if (bearerClaims) return bearerClaims;
  }
  const accessCookie = req.cookies.get(ACCESS_COOKIE_NAME)?.value;
  return verifyBrowserSessionBinding(verifySessionToken(accessCookie, 'access'), req);
}

function getUserRecordMap(userId: string): Map<string, SyncEntityRecord> {
  const store = getStore();
  let map = store.recordsByUser.get(userId);
  if (!map) {
    map = new Map<string, SyncEntityRecord>();
    store.recordsByUser.set(userId, map);
  }
  return map;
}

function getUserChangeLog(userId: string): SyncChangeEntry[] {
  const store = getStore();
  let log = store.changesByUser.get(userId);
  if (!log) {
    log = [];
    store.changesByUser.set(userId, log);
  }
  return log;
}

function getUserIdempotencyMap(userId: string): Map<string, SyncPushItemResult> {
  const store = getStore();
  let map = store.idempotencyByUser.get(userId);
  if (!map) {
    map = new Map<string, SyncPushItemResult>();
    store.idempotencyByUser.set(userId, map);
  }
  return map;
}

export function serverPullChanges(userId: string, cursor: string | null | undefined): {
  changes: SyncChangeEntry[];
  nextCursor: string;
} {
  const log = getUserChangeLog(userId);
  const startSeq = cursor ? parseInt(cursor, 10) || 0 : 0;
  const changes = log.filter((c) => c.seq > startSeq);
  const nextCursor = String(changes.length > 0 ? changes[changes.length - 1].seq : startSeq);
  return { changes, nextCursor };
}

export function serverPushItems(
  userId: string,
  items: SyncPushItemRequest[]
): { results: SyncPushItemResult[] } {
  const records = getUserRecordMap(userId);
  const changeLog = getUserChangeLog(userId);
  const idempMap = getUserIdempotencyMap(userId);
  const results: SyncPushItemResult[] = [];

  for (const item of items) {
    if (!item.idempotencyKey || !item.entity || !item.op) {
      results.push({
        idempotencyKey: item.idempotencyKey || 'missing-key',
        status: 'rejected',
        entity: item.entity || 'account',
        id: String(item.payload?.id || ''),
        reason: 'Malformed sync push item: idempotencyKey, entity, and op are required.',
      });
      continue;
    }

    // Idempotent replay: never duplicate or re-mutate
    const cached = idempMap.get(item.idempotencyKey);
    if (cached) {
      results.push(cached);
      continue;
    }

    const entityId = String(item.payload?.id || item.idempotencyKey);
    const key = `${item.entity}:${entityId}`;
    const existing = records.get(key);
    const nowIso = new Date().toISOString();

    // Closed trade append-only enforcement: cannot overwrite an existing CLOSED trade
    if (
      item.entity === 'trade' &&
      existing &&
      existing.closedImmutable &&
      item.op !== 'correction'
    ) {
      const conflictRes: SyncPushItemResult = {
        idempotencyKey: item.idempotencyKey,
        status: 'conflict',
        entity: item.entity,
        id: entityId,
        remoteRecord: existing as unknown as Record<string, unknown>,
        reason: 'Closed trades are append-only. Submit a trade_correction record instead of overwriting.',
      };
      idempMap.set(item.idempotencyKey, conflictRes);
      results.push(conflictRes);
      continue;
    }

    if (item.op === 'correction' || item.entity === 'trade_correction') {
      const correctionId = String(item.payload?.id || `corr-${crypto.randomUUID().slice(0, 8)}`);
      const corrKey = `trade_correction:${correctionId}`;
      const record: SyncEntityRecord = {
        id: correctionId,
        entity: 'trade_correction',
        version: 1,
        updatedAt: nowIso,
        payload: { ...item.payload, id: correctionId, createdAt: nowIso },
      };
      records.set(corrKey, record);
      const seq = changeLog.length + 1;
      changeLog.push({
        seq,
        entity: 'trade_correction',
        id: correctionId,
        op: 'correction',
        version: 1,
        updatedAt: nowIso,
        record: record.payload,
      });
      const acceptedRes: SyncPushItemResult = {
        idempotencyKey: item.idempotencyKey,
        status: 'accepted',
        entity: 'trade_correction',
        id: correctionId,
        newVersion: 1,
        record: record.payload,
      };
      idempMap.set(item.idempotencyKey, acceptedRes);
      results.push(acceptedRes);
      continue;
    }

    // Optimistic concurrency check on existing mutable records (except last-write-wins preference)
    if (existing && item.entity !== 'preference') {
      if (item.baseVersion !== existing.version) {
        const conflictRes: SyncPushItemResult = {
          idempotencyKey: item.idempotencyKey,
          status: 'conflict',
          entity: item.entity,
          id: entityId,
          remoteRecord: existing as unknown as Record<string, unknown>,
          reason: `Version conflict: baseVersion ${item.baseVersion} != remote version ${existing.version}.`,
        };
        idempMap.set(item.idempotencyKey, conflictRes);
        results.push(conflictRes);
        continue;
      }
    }

    const nextVersion = existing ? existing.version + 1 : Math.max(1, (item.baseVersion || 0) + 1);
    const isClosedTrade =
      item.entity === 'trade' &&
      String(item.payload?.status || '').toUpperCase() === 'CLOSED';
    const deletedAt = item.op === 'delete' ? nowIso : null;

    const record: SyncEntityRecord = {
      id: entityId,
      entity: item.entity,
      version: nextVersion,
      updatedAt: nowIso,
      deletedAt,
      closedImmutable: isClosedTrade || existing?.closedImmutable || false,
      payload: {
        ...item.payload,
        id: entityId,
        version: nextVersion,
        updatedAt: nowIso,
        ...(deletedAt ? { deletedAt } : {}),
      },
    };

    records.set(key, record);
    const seq = changeLog.length + 1;
    changeLog.push({
      seq,
      entity: item.entity,
      id: entityId,
      op: item.op,
      version: nextVersion,
      updatedAt: nowIso,
      deletedAt,
      record: record.payload,
    });

    const acceptedRes: SyncPushItemResult = {
      idempotencyKey: item.idempotencyKey,
      status: 'accepted',
      entity: item.entity,
      id: entityId,
      newVersion: nextVersion,
      record: record.payload,
    };
    idempMap.set(item.idempotencyKey, acceptedRes);
    results.push(acceptedRes);
  }

  return { results };
}

export function resetServerSyncStoreForTests(): void {
  const store = getStore();
  store.revokedRefreshIds.clear();
  store.recordsByUser.clear();
  store.changesByUser.clear();
  store.idempotencyByUser.clear();
}

export function sanitizeAuditMetadata(meta: Record<string, unknown>): unknown {
  return redactSensitive(meta);
}

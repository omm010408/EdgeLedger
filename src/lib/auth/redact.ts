const SENSITIVE_KEY_PATTERN =
  /(token|access|refresh|password|passcode|secret|cookie|authorization|apikey|service_role|account.?number|card|ssn)/i;

const ACCOUNT_NUMBER_PATTERN = /\b(?=[A-Z0-9-]*\d)[A-Z0-9]{2,4}[- ]?\d{4,12}\b|\b\d{6,16}\b/g;
const BEARER_OR_JWT_PATTERN =
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.?[A-Za-z0-9_-]*/g;

export function redactString(input: string): string {
  return input
    .replace(BEARER_OR_JWT_PATTERN, '[REDACTED_TOKEN]')
    .replace(ACCOUNT_NUMBER_PATTERN, '[REDACTED_ACCT]');
}

export function redactSensitive(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value !== 'object') return value;

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
    };
  }

  if (seen.has(value as object)) return '[Circular]';
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(k)) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = redactSensitive(v, seen);
    }
  }
  return out;
}

export function safeLog(
  level: 'info' | 'warn' | 'error',
  message: string,
  meta?: Record<string, unknown>
): void {
  const safeMsg = redactString(message);
  const safeMeta = meta ? redactSensitive(meta) : undefined;
  if (level === 'error') {
    console.error(safeMsg, safeMeta ?? '');
  } else if (level === 'warn') {
    console.warn(safeMsg, safeMeta ?? '');
  } else {
    console.info(safeMsg, safeMeta ?? '');
  }
}

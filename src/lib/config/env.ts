/**
 * EDGELEDGER — Environment Configuration & Validation
 * Centralized, type-safe configuration loaded from environment variables (.env.local).
 */

export interface AppConfig {
  app: {
    env: 'development' | 'production' | 'test' | 'staging';
    url: string;
    defaultBaseCurrency: string;
    enableDemoData: boolean;
    enableWorkedFixtures: boolean;
    decimalPrecision: number;
    riskCheckIntervalMs: number;
  };
  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey?: string;
    isConfigured: boolean;
  };
}

function parseBoolean(val: string | undefined, defaultValue: boolean): boolean {
  if (val === undefined || val === '') return defaultValue;
  return val.toLowerCase() === 'true' || val === '1';
}

function parseNumber(val: string | undefined, defaultValue: number): number {
  if (!val) return defaultValue;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export function getAppConfig(): AppConfig {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined;

  const isConfigured = Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your-project') &&
    !supabaseUrl.includes('example.supabase.co') &&
    !supabaseAnonKey.includes('your-anon-key')
  );

  return {
    app: {
      env: (process.env.NEXT_PUBLIC_APP_ENV as any) || (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
      url: process.env.NEXT_PUBLIC_APP_URL?.trim() || 'http://localhost:3000',
      defaultBaseCurrency: process.env.NEXT_PUBLIC_DEFAULT_BASE_CURRENCY?.trim().toUpperCase() || 'USD',
      enableDemoData: parseBoolean(process.env.NEXT_PUBLIC_ENABLE_DEMO_DATA, true),
      enableWorkedFixtures: parseBoolean(process.env.NEXT_PUBLIC_WORKED_FIXTURES, true),
      decimalPrecision: parseNumber(process.env.NEXT_PUBLIC_DECIMAL_PRECISION, 28),
      riskCheckIntervalMs: parseNumber(process.env.NEXT_PUBLIC_RISK_CHECK_INTERVAL_MS, 5000),
    },
    supabase: {
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
      serviceRoleKey,
      isConfigured,
    },
  };
}

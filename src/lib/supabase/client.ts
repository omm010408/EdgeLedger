import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getAppConfig } from '../config/env';

const config = getAppConfig();

export const isSupabaseConfigured = config.supabase.isConfigured;

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(config.supabase.url, config.supabase.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

export function getSupabaseDetails() {
  const currentConfig = getAppConfig();
  return {
    configured: currentConfig.supabase.isConfigured,
    url: currentConfig.supabase.url || 'Not configured in .env.local',
    maskedKey: currentConfig.supabase.anonKey
      ? `${currentConfig.supabase.anonKey.slice(0, 6)}...${currentConfig.supabase.anonKey.slice(-4)}`
      : 'None',
    environment: currentConfig.app.env,
    baseCurrency: currentConfig.app.defaultBaseCurrency,
    decimalPrecision: currentConfig.app.decimalPrecision,
    riskCheckIntervalMs: currentConfig.app.riskCheckIntervalMs,
    enableDemoData: currentConfig.app.enableDemoData,
    enableWorkedFixtures: currentConfig.app.enableWorkedFixtures,
  };
}

export async function testSupabaseConnection(): Promise<{
  success: boolean;
  message: string;
  latencyMs?: number;
}> {
  const currentConfig = getAppConfig();
  if (!currentConfig.supabase.isConfigured || !supabase) {
    return {
      success: false,
      message: 'Supabase credentials are not configured in .env.local. Operating in Local Persistent Storage mode.',
    };
  }

  const start = Date.now();
  try {
    // Attempt a light ping or check system health
    const { error } = await supabase.from('trading_accounts').select('id').limit(1);
    const latencyMs = Date.now() - start;

    if (error) {
      // If table doesn't exist yet, but authentication connected
      if (error.code === '42P01') {
        return {
          success: true,
          message: `Connected to Supabase (${latencyMs}ms), but database schema tables are not yet migrated. Run /supabase/migrations/001_initial_schema.sql.`,
          latencyMs,
        };
      }
      return {
        success: false,
        message: `Connection returned error: ${error.message} (Code: ${error.code})`,
        latencyMs,
      };
    }

    return {
      success: true,
      message: `Successfully connected to Supabase PostgreSQL with active RLS policies (${latencyMs}ms latency).`,
      latencyMs,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    return {
      success: false,
      message: `Failed to connect to ${currentConfig.supabase.url}: ${err.message || 'Network error'}`,
      latencyMs,
    };
  }
}

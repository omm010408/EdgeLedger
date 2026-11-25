import { NextResponse } from 'next/server';
import { getAppConfig } from '@/lib/config/env';
import { SupabaseService } from '@/lib/supabase/service';

export async function GET() {
  const config = getAppConfig();
  const supabaseHealth = await SupabaseService.checkHealth();

  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    app: {
      env: config.app.env,
      baseCurrency: config.app.defaultBaseCurrency,
      decimalPrecision: config.app.decimalPrecision,
      riskCheckIntervalMs: config.app.riskCheckIntervalMs,
    },
    backend: {
      engine: 'Next.js 15 App Router Edge/Node',
      storageMode: config.supabase.isConfigured ? 'supabase_cloud' : 'local_storage_fallback',
    },
    supabase: {
      configured: config.supabase.isConfigured,
      connected: supabaseHealth.connected,
      latencyMs: supabaseHealth.latencyMs,
      accountsCount: supabaseHealth.accountsCount,
      tradesCount: supabaseHealth.tradesCount,
      message: supabaseHealth.message,
    },
  });
}

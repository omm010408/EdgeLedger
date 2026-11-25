import { NextRequest, NextResponse } from 'next/server';
import { SupabaseService } from '@/lib/supabase/service';
import { problemResponse } from '@/lib/api/problemDetails';
import { getAppConfig } from '@/lib/config/env';
import {
  mergeAccount,
  mergeTrade,
  reconcileEntityLists,
  SyncTombstone,
} from '@/lib/sync/syncEngine';
import { Trade, TradingAccount } from '@/lib/types/financial';
import { JournalEntry, RiskAlert, Strategy } from '@/lib/data/seedData';

export async function POST(req: NextRequest) {
  const config = getAppConfig();
  if (!config.supabase.isConfigured) {
    return problemResponse(
      503,
      'Supabase Cloud Not Configured',
      'Cannot execute cloud sync because NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are not configured in .env.local.'
    );
  }

  let body: {
    accounts?: TradingAccount[];
    trades?: Trade[];
    strategies?: Strategy[];
    journalEntries?: JournalEntry[];
    riskAlerts?: RiskAlert[];
    tombstones?: SyncTombstone[];
  };
  try {
    body = await req.json();
  } catch {
    return problemResponse(
      400,
      'Invalid JSON Payload',
      'The sync request payload could not be parsed as valid JSON.'
    );
  }

  const {
    accounts = [],
    trades = [],
    strategies = [],
    journalEntries = [],
    riskAlerts = [],
    tombstones = [],
  } = body;

  const [cloudAccounts, cloudTrades, cloudStrategies, cloudJournal, cloudAlerts] =
    await Promise.all([
      SupabaseService.fetchAccounts(),
      SupabaseService.fetchTrades(),
      SupabaseService.fetchStrategies(),
      SupabaseService.fetchJournalEntries(),
      SupabaseService.fetchAlerts(),
    ]);

  const accRec = reconcileEntityLists<TradingAccount>({
    local: accounts,
    remote: cloudAccounts ?? [],
    tombstones,
    entityType: 'account',
    getId: (a) => a.id,
    getUpdatedAt: (a) => a.updatedAt || a.createdAt,
    mergeItem: mergeAccount,
  });

  const tradeRec = reconcileEntityLists<Trade>({
    local: trades,
    remote: cloudTrades ?? [],
    tombstones,
    entityType: 'trade',
    getId: (t) => t.id,
    getUpdatedAt: (t) => t.updatedAt || t.createdAt,
    mergeItem: mergeTrade,
  });

  const stratRec = reconcileEntityLists<Strategy>({
    local: strategies,
    remote: cloudStrategies ?? [],
    tombstones,
    entityType: 'strategy',
    getId: (s) => s.id,
    getUpdatedAt: (s) => s.updatedAt || s.createdAt,
  });

  const journalRec = reconcileEntityLists<JournalEntry>({
    local: journalEntries,
    remote: cloudJournal ?? [],
    tombstones,
    entityType: 'journal',
    getId: (j) => j.id,
    getUpdatedAt: (j) => j.updatedAt || `${j.entryDate}T23:59:59.000Z`,
  });

  const alertRec = reconcileEntityLists<RiskAlert>({
    local: riskAlerts,
    remote: cloudAlerts ?? [],
    tombstones,
    entityType: 'alert',
    getId: (a) => a.id,
    getUpdatedAt: (a) => a.createdAt,
  });

  const deleteTombstones: SyncTombstone[] = [
    ...accRec.toDeleteFromCloud.map((id) => ({
      id,
      entityType: 'account' as const,
      deletedAt: new Date().toISOString(),
    })),
    ...tradeRec.toDeleteFromCloud.map((id) => ({
      id,
      entityType: 'trade' as const,
      deletedAt: new Date().toISOString(),
    })),
    ...stratRec.toDeleteFromCloud.map((id) => ({
      id,
      entityType: 'strategy' as const,
      deletedAt: new Date().toISOString(),
    })),
    ...journalRec.toDeleteFromCloud.map((id) => ({
      id,
      entityType: 'journal' as const,
      deletedAt: new Date().toISOString(),
    })),
    ...alertRec.toDeleteFromCloud.map((id) => ({
      id,
      entityType: 'alert' as const,
      deletedAt: new Date().toISOString(),
    })),
  ];

  const [pushResult, deletedCount] = await Promise.all([
    SupabaseService.syncLocalToCloud(
      accRec.toPushToCloud,
      tradeRec.toPushToCloud,
      stratRec.toPushToCloud,
      journalRec.toPushToCloud,
      alertRec.toPushToCloud
    ),
    SupabaseService.applyTombstones(deleteTombstones),
  ]);

  if (!pushResult.success) {
    return problemResponse(
      500,
      'Cloud Sync Failed',
      pushResult.error || 'Failed to synchronize local deltas to Supabase PostgreSQL.'
    );
  }

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    accountsSynced: pushResult.accountsSynced,
    tradesSynced: pushResult.tradesSynced,
    strategiesSynced: pushResult.strategiesSynced,
    journalSynced: pushResult.journalSynced,
    alertsSynced: pushResult.alertsSynced,
    deletedCount,
    pulledCount:
      accRec.pulledCount +
      tradeRec.pulledCount +
      stratRec.pulledCount +
      journalRec.pulledCount +
      alertRec.pulledCount,
    conflictResolutions:
      accRec.conflictResolutions +
      tradeRec.conflictResolutions +
      stratRec.conflictResolutions +
      journalRec.conflictResolutions +
      alertRec.conflictResolutions,
    cloudAccountsCount: accRec.merged.length,
    cloudTradesCount: tradeRec.merged.length,
    reconciled: {
      accounts: accRec.merged,
      trades: tradeRec.merged,
      strategies: stratRec.merged,
      journalEntries: journalRec.merged,
      riskAlerts: alertRec.merged,
    },
  });
}

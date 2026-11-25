'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  ReactNode,
} from 'react';
import {
  TradingAccount,
  Trade,
  InstrumentSpecification,
  AccountRule,
  TradeAllocation,
  TradeExecution,
  AccountType
} from '../lib/types/financial';
import {
  SEED_ACCOUNTS,
  SEED_INSTRUMENTS,
  SEED_STRATEGIES,
  SEED_TRADES,
  SEED_JOURNAL,
  SEED_ALERTS,
  Strategy,
  JournalEntry,
  RiskAlert
} from '../lib/data/seedData';
import {
  calculateTradingStatistics,
  calculateExecutionPnl,
  evaluateAccountRule,
  calculateDecisionQualityScore
} from '../lib/calculations/financialEngine';
import { getAppConfig } from '../lib/config/env';
import { SupabaseService } from '../lib/supabase/service';
import { isSupabaseConfigured } from '../lib/supabase/client';
import {
  SyncEntityType,
  SyncTombstone,
  clearOutbox,
  enqueueMutation,
  loadOutbox,
  loadTombstones,
  mergeAccount,
  mergeTrade,
  reconcileEntityLists,
  recordTombstone,
  removeOutboxItems,
  saveTombstones,
} from '../lib/sync/syncEngine';
import { emitSyncBridgeEvent } from '../lib/sync/mutationBridge';

interface TradingContextType {
  baseCurrency: string;
  accounts: TradingAccount[];
  selectedAccountId: string; // 'ALL' or specific account id
  setSelectedAccountId: (id: string) => void;
  selectedAccount: TradingAccount | null;
  periodFilter: 'Week' | 'Month' | 'All time';
  setPeriodFilter: (p: 'Week' | 'Month' | 'All time') => void;
  environmentFilter: 'live' | 'demo' | 'backtest' | 'ALL';
  setEnvironmentFilter: (env: 'live' | 'demo' | 'backtest' | 'ALL') => void;
  trades: Trade[];
  filteredTrades: Trade[];
  strategies: Strategy[];
  instruments: InstrumentSpecification[];
  journalEntries: JournalEntry[];
  riskAlerts: RiskAlert[];
  isLoaded: boolean;
  isPnlHidden: boolean;
  setIsPnlHidden: (hidden: boolean) => void;
  togglePnlPrivacy: () => void;

  // Cloud & Supabase Sync
  isCloudConfigured: boolean;
  syncStatus: 'synced' | 'syncing' | 'offline' | 'error';
  lastSyncedAt: string | null;
  pendingSyncCount: number;
  syncWithCloud: () => Promise<boolean>;

  // Actions
  addAccount: (accountData: Partial<TradingAccount>) => void;
  updateAccount: (account: TradingAccount) => void;
  deleteAccount: (id: string) => void;

  addTrade: (tradeData: Partial<Trade>) => void;
  updateTrade: (trade: Trade) => void;
  deleteTrade: (id: string) => void;
  executePartialClose: (
    tradeId: string,
    allocationId: string,
    closeSize: number,
    closePrice: number,
    commission?: number,
    swap?: number,
    notes?: string
  ) => void;

  addStrategy: (strategyData: Partial<Strategy>) => void;
  updateStrategy: (strategy: Strategy) => void;
  deleteStrategy: (id: string) => void;

  addJournalEntry: (entry: Partial<JournalEntry>) => void;
  updateJournalEntry: (entry: JournalEntry) => void;
  deleteJournalEntry: (id: string) => void;

  dismissAlert: (alertId: string) => void;
  updateRule: (accountId: string, rule: AccountRule) => void;
  addRule: (accountId: string, rule: Partial<AccountRule>) => void;
  toggleRule: (accountId: string, ruleId: string) => void;
  deleteRule: (accountId: string, ruleId: string) => void;

  importTrades: (newTrades: Trade[]) => void;
  importBackupState: (backup: {
    accounts?: TradingAccount[];
    trades?: Trade[];
    strategies?: Strategy[];
    journalEntries?: JournalEntry[];
    riskAlerts?: RiskAlert[];
  }) => {
    accounts: number;
    trades: number;
    strategies: number;
    journalEntries: number;
  };
  resetToDemoData: () => void;
  clearDemoData: () => void;
  clearAllUserData: () => void;

  // Metrics
  portfolioMetrics: ReturnType<typeof calculateTradingStatistics> & {
    totalBalance: number;
    totalEquity: number;
    openRiskUsd: number;
    todayPnl: number;
    weeklyPnl: number;
    monthlyPnl: number;
    maxDrawdownPct: number;
  };
}

const TradingContext = createContext<TradingContextType | undefined>(undefined);

const STORAGE_KEY = 'edgeledger_v2_store';
const appConfig = getAppConfig();

export const TradingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [accounts, setAccounts] = useState<TradingAccount[]>(() =>
    appConfig.app.enableDemoData ? SEED_ACCOUNTS : []
  );
  const [selectedAccountId, setSelectedAccountId] = useState<string>('ALL');
  const [periodFilter, setPeriodFilter] = useState<'Week' | 'Month' | 'All time'>('Week');
  const [environmentFilter, setEnvironmentFilter] = useState<'live' | 'demo' | 'backtest' | 'ALL'>('live');
  const [trades, setTrades] = useState<Trade[]>(() =>
    appConfig.app.enableDemoData ? SEED_TRADES : []
  );
  const [strategies, setStrategies] = useState<Strategy[]>(() =>
    appConfig.app.enableDemoData ? SEED_STRATEGIES : []
  );
  const [instruments] = useState<InstrumentSpecification[]>(SEED_INSTRUMENTS);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(() =>
    appConfig.app.enableDemoData ? SEED_JOURNAL : []
  );
  const [riskAlerts, setRiskAlerts] = useState<RiskAlert[]>(() =>
    appConfig.app.enableDemoData ? SEED_ALERTS : []
  );
  // Privacy mode: By default hide PnL and sensitive figures until unlocked by fingerprint
  const [isPnlHidden, setIsPnlHidden] = useState<boolean>(true);

  const togglePnlPrivacy = () => {
    setIsPnlHidden((prev) => !prev);
  };
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  // Cloud & Supabase Sync State
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'offline' | 'error'>(() =>
    isSupabaseConfigured ? 'synced' : 'offline'
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);

  const latestStateRef = useRef({
    accounts,
    trades,
    strategies,
    journalEntries,
    riskAlerts,
  });
  latestStateRef.current = {
    accounts,
    trades,
    strategies,
    journalEntries,
    riskAlerts,
  };
  const isSyncingRef = useRef<boolean>(false);

  const enqueueAndMarkPending = useCallback(
    (entityType: SyncEntityType, entityId: string, operation: 'upsert' | 'delete', payload?: unknown) => {
      const nextQueue = enqueueMutation(entityType, entityId, operation, payload);
      setPendingSyncCount(nextQueue.length);
    },
    []
  );

  const persistUpsertToCloud = useCallback(
    async (
      entityType: SyncEntityType,
      entityId: string,
      syncCall: () => Promise<boolean>
    ) => {
      if (!isSupabaseConfigured) return;
      const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
      if (!isOnline) {
        setSyncStatus('offline');
        enqueueAndMarkPending(entityType, entityId, 'upsert');
        return;
      }
      try {
        const ok = await syncCall();
        if (!ok) {
          enqueueAndMarkPending(entityType, entityId, 'upsert');
        }
      } catch (err) {
        console.warn(`Background Supabase upsert(${entityType}) queued:`, err);
        enqueueAndMarkPending(entityType, entityId, 'upsert');
      }
    },
    [enqueueAndMarkPending]
  );

  const persistDeleteToCloud = useCallback(
    async (
      entityType: SyncEntityType,
      entityId: string,
      deleteCall: () => Promise<boolean>
    ) => {
      recordTombstone(entityType, entityId);
      if (!isSupabaseConfigured) return;
      const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
      if (!isOnline) {
        setSyncStatus('offline');
        enqueueAndMarkPending(entityType, entityId, 'delete');
        return;
      }
      try {
        const ok = await deleteCall();
        if (!ok) {
          enqueueAndMarkPending(entityType, entityId, 'delete');
        }
      } catch (err) {
        console.warn(`Background Supabase delete(${entityType}) queued:`, err);
        enqueueAndMarkPending(entityType, entityId, 'delete');
      }
    },
    [enqueueAndMarkPending]
  );

  const runNonOverridingSync = useCallback(
    async (localSnapshot: {
      accounts: TradingAccount[];
      trades: Trade[];
      strategies: Strategy[];
      journalEntries: JournalEntry[];
      riskAlerts: RiskAlert[];
    }): Promise<boolean> => {
      if (!isSupabaseConfigured) {
        setSyncStatus('offline');
        return false;
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setSyncStatus('offline');
        return false;
      }
      if (isSyncingRef.current) {
        return true;
      }

      isSyncingRef.current = true;
      setSyncStatus('syncing');

      try {
        const tombstones = loadTombstones();
        const [cloudAccounts, cloudTrades, cloudStrategies, cloudJournal, cloudAlerts] =
          await Promise.all([
            SupabaseService.fetchAccounts(),
            SupabaseService.fetchTrades(),
            SupabaseService.fetchStrategies(),
            SupabaseService.fetchJournalEntries(),
            SupabaseService.fetchAlerts(),
          ]);

        const accRec =
          cloudAccounts !== null
            ? reconcileEntityLists<TradingAccount>({
                local: localSnapshot.accounts,
                remote: cloudAccounts,
                tombstones,
                entityType: 'account',
                getId: (a) => a.id,
                getUpdatedAt: (a) => a.updatedAt || a.createdAt,
                mergeItem: mergeAccount,
              })
            : null;

        const tradeRec =
          cloudTrades !== null
            ? reconcileEntityLists<Trade>({
                local: localSnapshot.trades,
                remote: cloudTrades,
                tombstones,
                entityType: 'trade',
                getId: (t) => t.id,
                getUpdatedAt: (t) => t.updatedAt || t.createdAt,
                mergeItem: mergeTrade,
              })
            : null;

        const stratRec =
          cloudStrategies !== null
            ? reconcileEntityLists<Strategy>({
                local: localSnapshot.strategies,
                remote: cloudStrategies,
                tombstones,
                entityType: 'strategy',
                getId: (s) => s.id,
                getUpdatedAt: (s) => s.updatedAt || s.createdAt,
              })
            : null;

        const journalRec =
          cloudJournal !== null
            ? reconcileEntityLists<JournalEntry>({
                local: localSnapshot.journalEntries,
                remote: cloudJournal,
                tombstones,
                entityType: 'journal',
                getId: (j) => j.id,
                getUpdatedAt: (j) => j.updatedAt || `${j.entryDate}T23:59:59.000Z`,
              })
            : null;

        const alertRec =
          cloudAlerts !== null
            ? reconcileEntityLists<RiskAlert>({
                local: localSnapshot.riskAlerts,
                remote: cloudAlerts,
                tombstones,
                entityType: 'alert',
                getId: (a) => a.id,
                getUpdatedAt: (a) => a.createdAt,
              })
            : null;

        if (accRec) setAccounts(accRec.merged);
        if (tradeRec) setTrades(tradeRec.merged);
        if (stratRec) setStrategies(stratRec.merged);
        if (journalRec) setJournalEntries(journalRec.merged);
        if (alertRec) setRiskAlerts(alertRec.merged);

        const accountsToPush = accRec?.toPushToCloud ?? [];
        const tradesToPush = tradeRec?.toPushToCloud ?? [];
        const strategiesToPush = stratRec?.toPushToCloud ?? [];
        const journalsToPush = journalRec?.toPushToCloud ?? [];
        const alertsToPush = alertRec?.toPushToCloud ?? [];

        const deleteTombstones: SyncTombstone[] = [
          ...(accRec?.toDeleteFromCloud ?? []).map((id) => ({
            id,
            entityType: 'account' as const,
            deletedAt: new Date().toISOString(),
          })),
          ...(tradeRec?.toDeleteFromCloud ?? []).map((id) => ({
            id,
            entityType: 'trade' as const,
            deletedAt: new Date().toISOString(),
          })),
          ...(stratRec?.toDeleteFromCloud ?? []).map((id) => ({
            id,
            entityType: 'strategy' as const,
            deletedAt: new Date().toISOString(),
          })),
          ...(journalRec?.toDeleteFromCloud ?? []).map((id) => ({
            id,
            entityType: 'journal' as const,
            deletedAt: new Date().toISOString(),
          })),
          ...(alertRec?.toDeleteFromCloud ?? []).map((id) => ({
            id,
            entityType: 'alert' as const,
            deletedAt: new Date().toISOString(),
          })),
        ];

        // Also include queued delete tombstones for tables that may have returned empty
        const outbox = loadOutbox();
        const queuedDeletes = outbox
          .filter((m) => m.operation === 'delete')
          .map((m) => ({
            id: m.entityId,
            entityType: m.entityType,
            deletedAt: m.timestamp,
          }));
        const combinedDeletes = [...deleteTombstones, ...queuedDeletes];

        const hasPushWork =
          accountsToPush.length > 0 ||
          tradesToPush.length > 0 ||
          strategiesToPush.length > 0 ||
          journalsToPush.length > 0 ||
          alertsToPush.length > 0;

        let syncOk = true;
        if (hasPushWork) {
          const pushResult = await SupabaseService.syncLocalToCloud(
            accountsToPush,
            tradesToPush,
            strategiesToPush,
            journalsToPush,
            alertsToPush
          );
          syncOk = pushResult.success;
        }

        if (combinedDeletes.length > 0) {
          await SupabaseService.applyTombstones(combinedDeletes);
        }

        if (syncOk) {
          const flushedKeys = new Set<string>([
            ...accountsToPush.map((a) => `account:${a.id}`),
            ...tradesToPush.map((t) => `trade:${t.id}`),
            ...strategiesToPush.map((s) => `strategy:${s.id}`),
            ...journalsToPush.map((j) => `journal:${j.id}`),
            ...alertsToPush.map((a) => `alert:${a.id}`),
            ...combinedDeletes.map((d) => `${d.entityType}:${d.id}`),
          ]);
          const remaining = removeOutboxItems(flushedKeys);
          setPendingSyncCount(remaining.length);
          setSyncStatus('synced');
          setLastSyncedAt(new Date().toLocaleTimeString());
        } else {
          setSyncStatus('error');
        }

        return syncOk;
      } catch (e) {
        console.error('Failed to reconcile with Supabase cloud:', e);
        setSyncStatus('error');
        return false;
      } finally {
        isSyncingRef.current = false;
      }
    },
    []
  );

  // Load state from localStorage on mount, then perform non-overriding reconciliation with Supabase
  useEffect(() => {
    let isCancelled = false;

    async function initializeData() {
      let initialAccounts: TradingAccount[] = appConfig.app.enableDemoData ? SEED_ACCOUNTS : [];
      let initialTrades: Trade[] = appConfig.app.enableDemoData ? SEED_TRADES : [];
      let initialStrategies: Strategy[] = appConfig.app.enableDemoData ? SEED_STRATEGIES : [];
      let initialJournal: JournalEntry[] = appConfig.app.enableDemoData ? SEED_JOURNAL : [];
      let initialAlerts: RiskAlert[] = appConfig.app.enableDemoData ? SEED_ALERTS : [];

      try {
        setPendingSyncCount(loadOutbox().length);
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed.accounts)) {
            const hydratedAccounts = parsed.accounts.map((acc: TradingAccount) => {
              const seed = SEED_ACCOUNTS.find((s) => s.id === acc.id);
              if (seed && (!acc.rules || acc.rules.length < seed.rules.length)) {
                return { ...acc, rules: seed.rules };
              }
              if (!acc.rules || acc.rules.length === 0) {
                return {
                  ...acc,
                  rules: generatePersonalizedRules(
                    acc.id,
                    acc.accountType,
                    acc.brokerOrFirm,
                    acc.accountSize
                  ),
                };
              }
              return acc;
            });
            initialAccounts = hydratedAccounts;
            setAccounts(hydratedAccounts);
          }
          if (Array.isArray(parsed.trades)) {
            initialTrades = parsed.trades;
            setTrades(parsed.trades);
          }
          if (Array.isArray(parsed.strategies)) {
            initialStrategies = parsed.strategies;
            setStrategies(parsed.strategies);
          }
          if (Array.isArray(parsed.journalEntries)) {
            initialJournal = parsed.journalEntries;
            setJournalEntries(parsed.journalEntries);
          }
          if (Array.isArray(parsed.riskAlerts)) {
            initialAlerts = parsed.riskAlerts;
            setRiskAlerts(parsed.riskAlerts);
          }
        }
      } catch (e) {
        console.warn('Failed to parse stored EdgeLedger data', e);
      }

      if (isSupabaseConfigured && !isCancelled) {
        await runNonOverridingSync({
          accounts: initialAccounts,
          trades: initialTrades,
          strategies: initialStrategies,
          journalEntries: initialJournal,
          riskAlerts: initialAlerts,
        });
      } else if (!isCancelled) {
        setSyncStatus('offline');
      }

      if (!isCancelled) setIsLoaded(true);
    }

    initializeData();

    const handleOnline = () => {
      if (isSupabaseConfigured) {
        runNonOverridingSync(latestStateRef.current);
      }
    };
    const handleOffline = () => {
      setSyncStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      isCancelled = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [runNonOverridingSync]);

  // Sync current memory state to cloud without overriding newer local or remote edits
  const syncWithCloud = useCallback(async (): Promise<boolean> => {
    return runNonOverridingSync(latestStateRef.current);
  }, [runNonOverridingSync]);

  // Save state to localStorage whenever state changes
  useEffect(() => {
    if (!isLoaded) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          accounts,
          trades,
          strategies,
          journalEntries,
          riskAlerts,
        })
      );
    } catch (e) {
      console.warn('Failed to save EdgeLedger data to localStorage', e);
    }
  }, [accounts, trades, strategies, journalEntries, riskAlerts, isLoaded]);

  const selectedAccount = useMemo(() => {
    if (selectedAccountId === 'ALL') return null;
    return accounts.find((a) => a.id === selectedAccountId) || null;
  }, [accounts, selectedAccountId]);

  // Trades filtered by selected account and environment
  const filteredTrades = useMemo(() => {
    let list = trades;

    // Filter by environment (Live by default, unless user selected ALL or specific)
    if (environmentFilter !== 'ALL') {
      list = list.filter((t) => (t.environment || 'live') === environmentFilter);
    }

    // Filter by account
    if (selectedAccountId !== 'ALL') {
      list = list.filter((t) =>
        t.allocations.some((alloc) => alloc.accountId === selectedAccountId)
      );
    }

    return list;
  }, [trades, selectedAccountId, environmentFilter]);

  // Portfolio & Account calculations
  const portfolioMetrics = useMemo(() => {
    const relevantTrades = filteredTrades;
    const baseStats = calculateTradingStatistics(relevantTrades);

    // Sum balances & equities
    let totalBal = 0;
    let totalEq = 0;
    let openRisk = 0;

    const targetAccounts = selectedAccountId === 'ALL'
      ? accounts.filter((a) => environmentFilter === 'ALL' || (environmentFilter === 'demo' ? a.isDemo : !a.isDemo))
      : accounts.filter((a) => a.id === selectedAccountId);

    targetAccounts.forEach((acc) => {
      totalBal += acc.currentBalance;
      totalEq += acc.currentEquity;
    });

    // Open trades risk
    const openTrades = relevantTrades.filter((t) => t.status === 'OPEN' || t.status === 'PARTIALLY_CLOSED');
    openTrades.forEach((t) => {
      if (selectedAccountId === 'ALL') {
        openRisk += t.plannedRiskUsd || 0;
      } else {
        const alloc = t.allocations.find((a) => a.accountId === selectedAccountId);
        if (alloc) openRisk += alloc.allocatedRiskUsd || 0;
      }
    });

    // Time-based P&L: Today, Weekly, Monthly
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let todayPnl = 0;
    let weeklyPnl = 0;
    let monthlyPnl = 0;

    relevantTrades.forEach((t) => {
      const exitDate = t.exitTime ? new Date(t.exitTime) : new Date(t.createdAt);
      const pnl = selectedAccountId === 'ALL'
        ? t.netPnl
        : (t.allocations.find((a) => a.accountId === selectedAccountId)?.netPnl || 0);

      if (t.status === 'CLOSED' || t.status === 'PARTIALLY_CLOSED') {
        if (exitDate.toISOString().split('T')[0] === todayStr) {
          todayPnl += pnl;
        }
        if (exitDate >= sevenDaysAgo) {
          weeklyPnl += pnl;
        }
        if (exitDate >= thirtyDaysAgo) {
          monthlyPnl += pnl;
        }
      }
    });

    // Drawdown calculation
    let maxDrawdownPct = 0;
    targetAccounts.forEach((acc) => {
      if (acc.highWaterMark > 0) {
        const dd = ((acc.highWaterMark - acc.currentEquity) / acc.highWaterMark) * 100;
        if (dd > maxDrawdownPct) maxDrawdownPct = dd;
      }
    });

    return {
      ...baseStats,
      totalBalance: Math.round(totalBal * 100) / 100,
      totalEquity: Math.round(totalEq * 100) / 100,
      openRiskUsd: Math.round(openRisk * 100) / 100,
      todayPnl: Math.round(todayPnl * 100) / 100,
      weeklyPnl: Math.round(weeklyPnl * 100) / 100,
      monthlyPnl: Math.round(monthlyPnl * 100) / 100,
      maxDrawdownPct: Math.round(maxDrawdownPct * 100) / 100,
    };
  }, [filteredTrades, accounts, selectedAccountId, environmentFilter]);

function generatePersonalizedRules(
  accountId: string,
  accountType: AccountType,
  brokerOrFirm: string,
  size: number
): AccountRule[] {
  const firmLower = (brokerOrFirm || '').toLowerCase();
  const now = new Date().toISOString();

  if (accountType === 'funded' || firmLower.includes('apex') || firmLower.includes('topstep')) {
    return [
      {
        id: `rule-${Date.now()}-1`,
        accountId,
        ruleType: 'daily_loss_limit',
        thresholdValue: Math.round(size * 0.025), // e.g. $2,500 on 100k
        thresholdUnit: 'currency',
        calculationMethod: 'equity_based',
        warningThresholdPct: 80,
        isEnabled: true,
        currentStatus: 'SAFE',
        currentMetricValue: 0,
        resetFrequency: 'daily',
        applicableTimezone: 'America/New_York',
        version: 1,
        effectiveFrom: now,
      },
      {
        id: `rule-${Date.now()}-2`,
        accountId,
        ruleType: 'trailing_drawdown',
        thresholdValue: Math.round(size * 0.05), // e.g. $5,000 trailing
        thresholdUnit: 'currency',
        calculationMethod: 'relative_trailing',
        warningThresholdPct: 80,
        isEnabled: true,
        currentStatus: 'SAFE',
        currentMetricValue: 0,
        resetFrequency: 'none',
        applicableTimezone: 'America/New_York',
        version: 1,
        effectiveFrom: now,
      },
      {
        id: `rule-${Date.now()}-3`,
        accountId,
        ruleType: 'max_risk_per_trade_pct',
        thresholdValue: 1.5,
        thresholdUnit: 'percent',
        calculationMethod: 'equity_based',
        warningThresholdPct: 80,
        isEnabled: true,
        currentStatus: 'SAFE',
        currentMetricValue: 0,
        resetFrequency: 'none',
        applicableTimezone: 'America/New_York',
        version: 1,
        effectiveFrom: now,
      },
      {
        id: `rule-${Date.now()}-4`,
        accountId,
        ruleType: 'max_open_risk_pct',
        thresholdValue: 2.5,
        thresholdUnit: 'percent',
        calculationMethod: 'equity_based',
        warningThresholdPct: 80,
        isEnabled: true,
        currentStatus: 'SAFE',
        currentMetricValue: 0,
        resetFrequency: 'none',
        applicableTimezone: 'America/New_York',
        version: 1,
        effectiveFrom: now,
      },
    ];
  }

  if (
    accountType === 'prop_evaluation' ||
    accountType === 'prop_verification' ||
    firmLower.includes('ftmo') ||
    firmLower.includes('mff') ||
    firmLower.includes('alpha')
  ) {
    return [
      {
        id: `rule-${Date.now()}-1`,
        accountId,
        ruleType: 'daily_loss_limit',
        thresholdValue: Math.round(size * 0.05), // 5% daily limit
        thresholdUnit: 'currency',
        calculationMethod: 'balance_based',
        warningThresholdPct: 80,
        isEnabled: true,
        currentStatus: 'SAFE',
        currentMetricValue: 0,
        resetFrequency: 'daily',
        applicableTimezone: 'Europe/Prague',
        version: 1,
        effectiveFrom: now,
      },
      {
        id: `rule-${Date.now()}-2`,
        accountId,
        ruleType: 'max_overall_loss',
        thresholdValue: Math.round(size * 0.10), // 10% total max loss
        thresholdUnit: 'currency',
        calculationMethod: 'static',
        warningThresholdPct: 80,
        isEnabled: true,
        currentStatus: 'SAFE',
        currentMetricValue: 0,
        resetFrequency: 'none',
        applicableTimezone: 'Europe/Prague',
        version: 1,
        effectiveFrom: now,
      },
      {
        id: `rule-${Date.now()}-3`,
        accountId,
        ruleType: 'profit_target',
        thresholdValue: Math.round(size * 0.10), // 10% profit target
        thresholdUnit: 'currency',
        calculationMethod: 'static',
        warningThresholdPct: 90,
        isEnabled: true,
        currentStatus: 'SAFE',
        currentMetricValue: 0,
        resetFrequency: 'none',
        applicableTimezone: 'Europe/Prague',
        version: 1,
        effectiveFrom: now,
      },
      {
        id: `rule-${Date.now()}-4`,
        accountId,
        ruleType: 'min_trading_days',
        thresholdValue: 4,
        thresholdUnit: 'days',
        calculationMethod: 'static',
        warningThresholdPct: 50,
        isEnabled: true,
        currentStatus: 'SAFE',
        currentMetricValue: 0,
        resetFrequency: 'none',
        applicableTimezone: 'Europe/Prague',
        version: 1,
        effectiveFrom: now,
      },
    ];
  }

  // Personal / Live Retail / Custom
  return [
    {
      id: `rule-${Date.now()}-1`,
      accountId,
      ruleType: 'daily_loss_limit',
      thresholdValue: Math.round(size * 0.04), // 4% daily loss cap
      thresholdUnit: 'currency',
      calculationMethod: 'balance_based',
      warningThresholdPct: 80,
      isEnabled: true,
      currentStatus: 'SAFE',
      currentMetricValue: 0,
      resetFrequency: 'daily',
      applicableTimezone: 'UTC',
      version: 1,
      effectiveFrom: now,
    },
    {
      id: `rule-${Date.now()}-2`,
      accountId,
      ruleType: 'max_risk_per_trade_pct',
      thresholdValue: 2.0,
      thresholdUnit: 'percent',
      calculationMethod: 'equity_based',
      warningThresholdPct: 80,
      isEnabled: true,
      currentStatus: 'SAFE',
      currentMetricValue: 0,
      resetFrequency: 'none',
      applicableTimezone: 'UTC',
      version: 1,
      effectiveFrom: now,
    },
    {
      id: `rule-${Date.now()}-3`,
      accountId,
      ruleType: 'max_overall_loss',
      thresholdValue: Math.round(size * 0.10), // 10% max drawdown
      thresholdUnit: 'currency',
      calculationMethod: 'static',
      warningThresholdPct: 80,
      isEnabled: true,
      currentStatus: 'SAFE',
      currentMetricValue: 0,
      resetFrequency: 'none',
      applicableTimezone: 'UTC',
      version: 1,
      effectiveFrom: now,
    },
    {
      id: `rule-${Date.now()}-4`,
      accountId,
      ruleType: 'max_open_positions',
      thresholdValue: 3,
      thresholdUnit: 'count',
      calculationMethod: 'static',
      warningThresholdPct: 66,
      isEnabled: true,
      currentStatus: 'SAFE',
      currentMetricValue: 0,
      resetFrequency: 'none',
      applicableTimezone: 'UTC',
      version: 1,
      effectiveFrom: now,
    },
  ];
}

  const applyAccountBalanceDeltas = useCallback(
    (deltas: Map<string, number>, now: string) => {
      if (deltas.size === 0) return;
      let hasNonZero = false;
      deltas.forEach((v) => {
        if (Math.abs(v) >= 0.0001) hasNonZero = true;
      });
      if (!hasNonZero) return;

      setAccounts((prevAccs) =>
        prevAccs.map((acc) => {
          const delta = deltas.get(acc.id);
          if (!delta || Math.abs(delta) < 0.0001) return acc;

          const newBal = Math.round((acc.currentBalance + delta) * 100) / 100;
          const newEq = Math.round((acc.currentEquity + delta) * 100) / 100;
          const newHwm = Math.round(Math.max(acc.highWaterMark, newEq) * 100) / 100;
          const netProfit = newEq - acc.startingBalance;
          const ddFromPeak = Math.max(0, newHwm - newEq);

          const updatedRules = (acc.rules || []).map((rule) => {
            if (rule.ruleType === 'trailing_drawdown') {
              const evalRes = evaluateAccountRule(rule, ddFromPeak, acc.startingBalance, newEq, newHwm);
              return { ...rule, currentMetricValue: ddFromPeak, currentStatus: evalRes.status };
            }
            if (rule.ruleType === 'max_overall_loss') {
              const lossUsed = Math.max(0, acc.startingBalance - newEq);
              const evalRes = evaluateAccountRule(rule, lossUsed, acc.startingBalance, newEq, newHwm);
              return { ...rule, currentMetricValue: lossUsed, currentStatus: evalRes.status };
            }
            if (rule.ruleType === 'profit_target') {
              const profitVal = Math.max(0, netProfit);
              const evalRes = evaluateAccountRule(rule, profitVal, acc.startingBalance, newEq, newHwm);
              return { ...rule, currentMetricValue: profitVal, currentStatus: evalRes.status };
            }
            return rule;
          });

          const updatedAcc: TradingAccount = {
            ...acc,
            currentBalance: newBal,
            currentEquity: newEq,
            highWaterMark: newHwm,
            rules: updatedRules,
            updatedAt: now,
          };

          emitSyncBridgeEvent({
            entity: 'account',
            entityId: updatedAcc.id,
            op: 'update',
            payload: updatedAcc as unknown as Record<string, unknown>,
          });
          void persistUpsertToCloud('account', updatedAcc.id, () =>
            SupabaseService.saveAccount(updatedAcc)
          );
          return updatedAcc;
        })
      );
    },
    [persistUpsertToCloud]
  );

  // Actions
  const addAccount = (accountData: Partial<TradingAccount>) => {
    const size = Number(accountData.accountSize) || 100000;
    const accountId = accountData.id || `acc-${Date.now()}`;
    const accountType = accountData.accountType || 'prop_evaluation';
    const brokerOrFirm = accountData.brokerOrFirm || 'Prop Desk';
    const now = new Date().toISOString();

    const initialRules =
      accountData.rules && accountData.rules.length > 0
        ? accountData.rules.map((r) => ({ ...r, accountId }))
        : generatePersonalizedRules(accountId, accountType, brokerOrFirm, size);

    const newAccount: TradingAccount = {
      id: accountId,
      userId: 'user-default',
      name: accountData.name || `${brokerOrFirm} $${(size / 1000).toFixed(0)}k`,
      brokerOrFirm,
      accountType,
      currency: accountData.currency || 'USD',
      accountSize: size,
      startingBalance: Number(accountData.startingBalance) || size,
      currentBalance: Number(accountData.currentBalance) || size,
      currentEquity: Number(accountData.currentEquity) || size,
      highWaterMark: Number(accountData.highWaterMark) || size,
      challengePhase: accountData.challengePhase || 'Phase 1',
      status: accountData.status || 'active',
      isDemo: accountData.isDemo ?? false,
      positionMatchingMode: accountData.positionMatchingMode || 'hedging',
      rules: initialRules,
      notes: accountData.notes || '',
      createdAt: now,
      updatedAt: now,
    };

    setAccounts((prev) => [newAccount, ...prev]);
    emitSyncBridgeEvent({ entity: 'account', entityId: newAccount.id, op: 'create', payload: newAccount as unknown as Record<string, unknown>, baseVersion: 0 });
    void persistUpsertToCloud('account', newAccount.id, () =>
      SupabaseService.saveAccount(newAccount)
    );
  };

  const updateAccount = (updated: TradingAccount) => {
    const stamped: TradingAccount = {
      ...updated,
      updatedAt: new Date().toISOString(),
    };
    setAccounts((prev) => prev.map((a) => (a.id === stamped.id ? stamped : a)));
    emitSyncBridgeEvent({ entity: 'account', entityId: stamped.id, op: 'update', payload: stamped as unknown as Record<string, unknown> });
    void persistUpsertToCloud('account', stamped.id, () =>
      SupabaseService.saveAccount(stamped)
    );
  };

  const deleteAccount = (id: string) => {
    const removedAlerts = latestStateRef.current.riskAlerts.filter((al) => al.accountId === id);
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    setRiskAlerts((prev) => prev.filter((al) => al.accountId !== id));
    if (selectedAccountId === id) setSelectedAccountId('ALL');
    emitSyncBridgeEvent({ entity: 'account', entityId: id, op: 'delete', payload: { id } });
    void persistDeleteToCloud('account', id, () => SupabaseService.deleteAccount(id));
    removedAlerts.forEach((al) => {
      void persistDeleteToCloud('alert', al.id, () => SupabaseService.deleteAlert(al.id));
    });
  };

  const addTrade = (tradeData: Partial<Trade>) => {
    const now = new Date().toISOString();
    const tradeId = `tr-${Date.now()}`;
    const targetAccount = selectedAccount || accounts[0];
    const targetAccountId = targetAccount?.id || 'unassigned';
    const targetAccountName = targetAccount?.name || 'Primary Desk';
    const targetEquity = targetAccount?.currentEquity || 100000;
    const riskUsd = tradeData.plannedRiskUsd || 500;
    const entryPrice = tradeData.entryPrice || 100;
    const stopLoss = tradeData.stopLoss || 95;

    // Snapshot planned risk at entry
    const defaultAllocations: TradeAllocation[] = tradeData.allocations && tradeData.allocations.length > 0
      ? tradeData.allocations.map((a) => ({
          ...a,
          tradeId,
          status: tradeData.status || 'OPEN',
        }))
      : [
          {
            id: `alloc-${Date.now()}`,
            tradeId,
            accountId: targetAccountId,
            accountName: targetAccountName,
            allocatedPositionSize: 1.0,
            allocatedRiskUsd: riskUsd,
            allocatedRiskPct: Math.round((riskUsd / targetEquity) * 1000) / 10,
            entryPrice,
            stopLoss,
            takeProfit: tradeData.takeProfit,
            realizedPnl: 0,
            netPnl: 0,
            commission: 10,
            swap: 0,
            fees: 0,
            status: tradeData.status || 'OPEN',
            executions: [
              {
                id: `exec-${Date.now()}`,
                tradeId,
                accountId: targetAccountId,
                executionType: 'ENTRY',
                price: entryPrice,
                size: 1.0,
                commission: 10,
                swap: 0,
                realizedPnl: 0,
                executionTime: now,
                notes: 'Trade entry execution',
              },
            ],
          },
        ];

    const computedGross = defaultAllocations.reduce((s, a) => s + (a.realizedPnl || 0), 0);
    const computedNet = defaultAllocations.reduce((s, a) => s + (a.netPnl || 0), 0);
    const finalRealizedPnl = tradeData.realizedPnl ?? computedGross;
    const finalNetPnl = tradeData.netPnl ?? computedNet;
    const finalRealizedR =
      tradeData.realizedR ??
      (riskUsd > 0 ? Math.round((finalNetPnl / riskUsd) * 100) / 100 : 0);

    const newTrade: Trade = {
      id: tradeId,
      userId: 'user-default',
      instrumentSymbol: tradeData.instrumentSymbol || 'XAUUSD',
      strategyId: tradeData.strategyId,
      strategyName: strategies.find((s) => s.id === tradeData.strategyId)?.name,
      strategyVersion: tradeData.strategyVersion || 1,
      direction: tradeData.direction || 'BUY',
      status: tradeData.status || 'OPEN',
      environment: tradeData.environment || 'live',
      timeframe: tradeData.timeframe || '15M',
      session: tradeData.session || 'London',
      setupType: tradeData.setupType || 'Market Structure Shift',
      entryPrice,
      stopLoss,
      takeProfit: tradeData.takeProfit,
      plannedRiskUsd: riskUsd, // Snapshotted permanently at entry
      plannedRiskPct: tradeData.plannedRiskPct || 1.0,
      plannedRr: tradeData.plannedRr || 2.0,
      realizedPnl: finalRealizedPnl,
      netPnl: finalNetPnl,
      realizedR: finalRealizedR,
      totalCommission: defaultAllocations.reduce((s, a) => s + (a.commission || 0), 0) || 10,
      totalSwap: defaultAllocations.reduce((s, a) => s + (a.swap || 0), 0),
      totalFees: defaultAllocations.reduce((s, a) => s + (a.fees || 0), 0),
      entryTime: tradeData.entryTime || now,
      exitTime: tradeData.exitTime || (tradeData.status === 'CLOSED' ? now : undefined),
      tradeThesis: tradeData.tradeThesis || '',
      technicalBias: tradeData.technicalBias || '',
      macroBias: tradeData.macroBias || '',
      macroBiasContext: tradeData.macroBiasContext,
      marketConditions: tradeData.marketConditions || 'Normal',
      screenshots: tradeData.screenshots || [],
      tags: tradeData.tags || ['Execution'],
      allocations: defaultAllocations,
      checklistAnswers: tradeData.checklistAnswers || {},
      isRuleCompliant: tradeData.isRuleCompliant ?? true,
      createdAt: now,
      updatedAt: now,
    };

    setTrades((prev) => [newTrade, ...prev]);

    if (newTrade.status === 'CLOSED' || newTrade.status === 'PARTIALLY_CLOSED') {
      const deltas = new Map<string, number>();
      newTrade.allocations.forEach((a) => {
        if (a.netPnl) {
          deltas.set(a.accountId, (deltas.get(a.accountId) || 0) + a.netPnl);
        }
      });
      applyAccountBalanceDeltas(deltas, now);
    }

    emitSyncBridgeEvent({ entity: 'trade', entityId: newTrade.id, op: 'create', payload: newTrade as unknown as Record<string, unknown>, baseVersion: 0 });
    void persistUpsertToCloud('trade', newTrade.id, () =>
      SupabaseService.saveTrade(newTrade)
    );
  };

  const updateTrade = (updated: Trade) => {
    // Validates that closed trade cannot reopen
    const existing = trades.find((t) => t.id === updated.id);
    if (existing && existing.status === 'CLOSED' && updated.status !== 'CLOSED') {
      throw new Error('A closed trade cannot be reopened. Record a new trade execution instead.');
    }
    const now = new Date().toISOString();

    // Compute per-account realized P&L delta so Accounts, Risk, Overview & Analytics stay in sync
    const deltas = new Map<string, number>();
    if (existing && (existing.status === 'CLOSED' || existing.status === 'PARTIALLY_CLOSED')) {
      existing.allocations.forEach((a) => {
        if (a.netPnl) {
          deltas.set(a.accountId, (deltas.get(a.accountId) || 0) - a.netPnl);
        }
      });
    }
    if (updated.status === 'CLOSED' || updated.status === 'PARTIALLY_CLOSED') {
      updated.allocations.forEach((a) => {
        if (a.netPnl) {
          deltas.set(a.accountId, (deltas.get(a.accountId) || 0) + a.netPnl);
        }
      });
    }

    const stamped: Trade = {
      ...updated,
      exitTime:
        updated.status === 'CLOSED' && !updated.exitTime
          ? now
          : updated.exitTime,
      updatedAt: now,
    };

    // Closed trades emit an immutable correction record alongside updating the live projection
    if (existing && existing.status === 'CLOSED') {
      emitSyncBridgeEvent({
        entity: 'trade_correction',
        entityId: `corr-${existing.id}-${Date.now()}`,
        op: 'correction',
        payload: {
          targetTradeId: existing.id,
          previousNetPnl: existing.netPnl,
          correctedFields: stamped,
        },
      });
    } else {
      emitSyncBridgeEvent({
        entity: 'trade',
        entityId: stamped.id,
        op: 'update',
        payload: stamped as unknown as Record<string, unknown>,
      });
    }

    setTrades((prev) => prev.map((t) => (t.id === stamped.id ? stamped : t)));
    applyAccountBalanceDeltas(deltas, now);
    void persistUpsertToCloud('trade', stamped.id, () =>
      SupabaseService.saveTrade(stamped)
    );
  };

  const deleteTrade = (id: string) => {
    const existing = trades.find((t) => t.id === id);
    if (existing && (existing.status === 'CLOSED' || existing.status === 'PARTIALLY_CLOSED')) {
      const deltas = new Map<string, number>();
      existing.allocations.forEach((a) => {
        if (a.netPnl) {
          deltas.set(a.accountId, (deltas.get(a.accountId) || 0) - a.netPnl);
        }
      });
      applyAccountBalanceDeltas(deltas, new Date().toISOString());
    }
    setTrades((prev) => prev.filter((t) => t.id !== id));
    emitSyncBridgeEvent({ entity: 'trade', entityId: id, op: 'delete', payload: { id } });
    void persistDeleteToCloud('trade', id, () => SupabaseService.deleteTrade(id));
  };

  const executePartialClose = (
    tradeId: string,
    allocationId: string,
    closeSize: number,
    closePrice: number,
    commission: number = 0,
    swap: number = 0,
    notes?: string
  ) => {
    const trade = trades.find((t) => t.id === tradeId);
    if (!trade) return;
    const instrument = instruments.find((i) => i.symbol === trade.instrumentSymbol) || instruments[0];

    const now = new Date().toISOString();
    const accountDeltas = new Map<string, number>();

    const updatedAllocations = trade.allocations.map((alloc) => {
      if (alloc.id !== allocationId) return alloc;

      const pnlResult = calculateExecutionPnl(
        trade.direction,
        alloc.entryPrice,
        closePrice,
        closeSize,
        instrument,
        commission,
        swap
      );

      const newExec: TradeExecution = {
        id: `exec-${Date.now()}`,
        tradeId,
        allocationId,
        accountId: alloc.accountId,
        executionType: closeSize >= alloc.allocatedPositionSize ? 'FULL_CLOSE' : 'PARTIAL_CLOSE',
        price: closePrice,
        size: closeSize,
        commission,
        swap,
        realizedPnl: pnlResult.netPnl,
        executionTime: now,
        notes: notes || `Closed ${closeSize} lots at ${closePrice}`,
      };

      const remainingSize = Math.max(0, alloc.allocatedPositionSize - closeSize);
      const isFullyClosed = remainingSize <= 0.0001;
      const entryExecSize =
        alloc.executions?.find((ex) => ex.executionType === 'ENTRY')?.size ||
        alloc.allocatedPositionSize;
      const newRealizedPnl = alloc.realizedPnl + pnlResult.grossPnl;
      const newNetPnl = alloc.netPnl + pnlResult.netPnl;

      if (pnlResult.netPnl) {
        accountDeltas.set(
          alloc.accountId,
          (accountDeltas.get(alloc.accountId) || 0) + pnlResult.netPnl
        );
      }

      return {
        ...alloc,
        allocatedPositionSize: isFullyClosed ? entryExecSize : remainingSize,
        realizedPnl: Math.round(newRealizedPnl * 100) / 100,
        netPnl: Math.round(newNetPnl * 100) / 100,
        commission: alloc.commission + commission,
        swap: alloc.swap + swap,
        exitPrice: closePrice,
        status: isFullyClosed ? ('CLOSED' as const) : ('PARTIALLY_CLOSED' as const),
        executions: [...alloc.executions, newExec],
      };
    });

    const allAllocationsClosed = updatedAllocations.every((a) => a.status === 'CLOSED');
    const totalNetPnl = updatedAllocations.reduce((sum, a) => sum + a.netPnl, 0);
    const totalGrossPnl = updatedAllocations.reduce((sum, a) => sum + a.realizedPnl, 0);

    const updatedTrade: Trade = {
      ...trade,
      allocations: updatedAllocations,
      realizedPnl: Math.round(totalGrossPnl * 100) / 100,
      netPnl: Math.round(totalNetPnl * 100) / 100,
      // R-multiple computed against snapshotted plannedRiskUsd
      realizedR: trade.plannedRiskUsd > 0
        ? Math.round((totalNetPnl / trade.plannedRiskUsd) * 100) / 100
        : 0,
      status: allAllocationsClosed ? 'CLOSED' : 'PARTIALLY_CLOSED',
      exitTime: allAllocationsClosed ? now : trade.exitTime,
      updatedAt: now,
    };

    setTrades((prev) => prev.map((t) => (t.id === tradeId ? updatedTrade : t)));
    applyAccountBalanceDeltas(accountDeltas, now);
    emitSyncBridgeEvent({
      entity: 'trade',
      entityId: updatedTrade.id,
      op: 'update',
      payload: updatedTrade as unknown as Record<string, unknown>,
    });
    void persistUpsertToCloud('trade', updatedTrade.id, () =>
      SupabaseService.saveTrade(updatedTrade)
    );
  };

  const addStrategy = (strategyData: Partial<Strategy>) => {
    const now = new Date().toISOString();
    const newStrategy: Strategy = {
      id: `strat-${Date.now()}`,
      name: strategyData.name || 'New Strategy',
      description: strategyData.description || '',
      marketType: strategyData.marketType || 'Multi-Asset',
      primaryTimeframes: strategyData.primaryTimeframes || ['15M', '1H'],
      marketRegime: strategyData.marketRegime || 'trending',
      entryConditions: strategyData.entryConditions || '',
      exitConditions: strategyData.exitConditions || '',
      stopLossMethodology: strategyData.stopLossMethodology || '',
      targetMethodology: strategyData.targetMethodology || '',
      riskRules: strategyData.riskRules || '',
      checklistItems: strategyData.checklistItems || ['Confirm bias', 'Check risk limit'],
      currentVersion: 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    setStrategies((prev) => [newStrategy, ...prev]);
    void persistUpsertToCloud('strategy', newStrategy.id, () =>
      SupabaseService.saveStrategy(newStrategy)
    );
  };

  const updateStrategy = (updated: Strategy) => {
    const stamped: Strategy = {
      ...updated,
      updatedAt: new Date().toISOString(),
    };
    setStrategies((prev) => prev.map((s) => (s.id === stamped.id ? stamped : s)));
    void persistUpsertToCloud('strategy', stamped.id, () =>
      SupabaseService.saveStrategy(stamped)
    );
  };

  const deleteStrategy = (id: string) => {
    setStrategies((prev) => prev.filter((s) => s.id !== id));
    void persistDeleteToCloud('strategy', id, () => SupabaseService.deleteStrategy(id));
  };

  const addJournalEntry = (entryData: Partial<JournalEntry>) => {
    const prep = entryData.preparationScore ?? 8;
    const disc = entryData.disciplineScore ?? 8;
    const exec = entryData.executionScore ?? 8;
    const rm = entryData.riskManagementScore ?? 8;
    const ec = entryData.emotionalControlScore ?? 8;

    // Calculate decision quality score independent of outcome
    const dqScore = calculateDecisionQualityScore({
      discipline: disc,
      riskManagement: rm,
      execution: exec,
      preparation: prep,
      emotionalControl: ec,
    });

    const newEntry: JournalEntry = {
      id: `j-${entryData.entryDate || new Date().toISOString().split('T')[0]}`,
      entryDate: entryData.entryDate || new Date().toISOString().split('T')[0],
      marketConditions: entryData.marketConditions || 'Normal Market Session',
      macroEnvironment: entryData.macroEnvironment || 'Neutral macro backdrop',
      higherTimeframeBias: entryData.higherTimeframeBias || 'Aligned with HTF structure',
      technicalBias: entryData.technicalBias || '',
      tradingPlan: entryData.tradingPlan || '',
      importantEconomicEvents: entryData.importantEconomicEvents || 'None',
      emotionalState: entryData.emotionalState || 'Disciplined',
      dailySummary: entryData.dailySummary || '',
      lessonsLearned: entryData.lessonsLearned || '',
      disciplineScore: disc,
      preparationScore: prep,
      executionScore: exec,
      riskManagementScore: rm,
      emotionalControlScore: ec,
      decisionQualityScore: dqScore,
      fomoDetected: entryData.fomoDetected ?? false,
      revengeTrading: entryData.revengeTrading ?? false,
      overtrading: entryData.overtrading ?? false,
      movedStopLoss: entryData.movedStopLoss ?? false,
      prematureExit: entryData.prematureExit ?? false,
      ignoredRules: entryData.ignoredRules ?? false,
      isLocked: false,
      updatedAt: new Date().toISOString(),
    };
    setJournalEntries((prev) => [newEntry, ...prev]);
    emitSyncBridgeEvent({ entity: 'journal', entityId: newEntry.id, op: 'create', payload: newEntry as unknown as Record<string, unknown>, baseVersion: 0 });
    void persistUpsertToCloud('journal', newEntry.id, () =>
      SupabaseService.saveJournalEntry(newEntry)
    );
  };

  const updateJournalEntry = (updated: JournalEntry) => {
    const dqScore = calculateDecisionQualityScore({
      discipline: updated.disciplineScore,
      riskManagement: updated.riskManagementScore ?? 8,
      execution: updated.executionScore,
      preparation: updated.preparationScore,
      emotionalControl: updated.emotionalControlScore ?? 8,
    });
    const stamped: JournalEntry = {
      ...updated,
      decisionQualityScore: dqScore,
      updatedAt: new Date().toISOString(),
    };
    setJournalEntries((prev) => prev.map((j) => (j.id === stamped.id ? stamped : j)));
    emitSyncBridgeEvent({ entity: 'journal', entityId: stamped.id, op: 'update', payload: stamped as unknown as Record<string, unknown> });
    void persistUpsertToCloud('journal', stamped.id, () =>
      SupabaseService.saveJournalEntry(stamped)
    );
  };

  const deleteJournalEntry = (id: string) => {
    setJournalEntries((prev) => prev.filter((j) => j.id !== id));
    emitSyncBridgeEvent({ entity: 'journal', entityId: id, op: 'delete', payload: { id } });
    void persistDeleteToCloud('journal', id, () => SupabaseService.deleteJournalEntry(id));
  };

  const dismissAlert = (alertId: string) => {
    setRiskAlerts((prev) => prev.filter((a) => a.id !== alertId));
    void persistDeleteToCloud('alert', alertId, () => SupabaseService.deleteAlert(alertId));
  };

  const updateAccountRulesAndSync = (
    accountId: string,
    transformRules: (rules: AccountRule[]) => AccountRule[]
  ) => {
    const now = new Date().toISOString();
    setAccounts((prev) =>
      prev.map((acc) => {
        if (acc.id !== accountId) return acc;
        const nextAcc: TradingAccount = {
          ...acc,
          updatedAt: now,
          rules: transformRules(acc.rules),
        };
        emitSyncBridgeEvent({ entity: 'risk_rule', entityId: nextAcc.id, op: 'update', payload: { id: nextAcc.id, accountId: nextAcc.id, rules: nextAcc.rules } });
        void persistUpsertToCloud('account', nextAcc.id, () =>
          SupabaseService.saveAccount(nextAcc)
        );
        return nextAcc;
      })
    );
  };

  const updateRule = (accountId: string, updatedRule: AccountRule) => {
    updateAccountRulesAndSync(accountId, (rules) =>
      rules.map((r) =>
        r.id === updatedRule.id
          ? { ...updatedRule, version: (updatedRule.version ?? 1) + 1 }
          : r
      )
    );
  };

  const addRule = (accountId: string, ruleData: Partial<AccountRule>) => {
    const newRule: AccountRule = {
      id: `rule-${Date.now()}`,
      accountId,
      ruleType: ruleData.ruleType || 'daily_loss_limit',
      thresholdValue: ruleData.thresholdValue || 1000,
      thresholdUnit: ruleData.thresholdUnit || 'currency',
      calculationMethod: ruleData.calculationMethod || 'balance_based',
      warningThresholdPct: ruleData.warningThresholdPct || 80,
      isEnabled: true,
      currentStatus: 'SAFE',
      currentMetricValue: 0,
      resetFrequency: ruleData.resetFrequency || 'daily',
      applicableTimezone: 'UTC',
      version: 1,
      effectiveFrom: new Date().toISOString(),
    };

    updateAccountRulesAndSync(accountId, (rules) => [...rules, newRule]);
  };

  const toggleRule = (accountId: string, ruleId: string) => {
    updateAccountRulesAndSync(accountId, (rules) =>
      rules.map((r) =>
        r.id === ruleId
          ? { ...r, isEnabled: !r.isEnabled, version: (r.version ?? 1) + 1 }
          : r
      )
    );
  };

  const deleteRule = (accountId: string, ruleId: string) => {
    updateAccountRulesAndSync(accountId, (rules) =>
      rules.filter((r) => r.id !== ruleId)
    );
    if (isSupabaseConfigured) {
      SupabaseService.deleteRule(ruleId).catch((err) =>
        console.warn('Background Supabase deleteRule error:', err)
      );
    }
  };

  const importTrades = (newTrades: Trade[]) => {
    // Idempotent deduplication: filter out any trades whose id or signature already exists
    const existingIds = new Set(trades.map((t) => t.id));
    const uniqueNew = newTrades.filter((t) => !existingIds.has(t.id));
    setTrades((prev) => [...uniqueNew, ...prev]);
    uniqueNew.forEach((t) => {
      void persistUpsertToCloud('trade', t.id, () => SupabaseService.saveTrade(t));
    });
  };

  const importBackupState = (backup: {
    accounts?: TradingAccount[];
    trades?: Trade[];
    strategies?: Strategy[];
    journalEntries?: JournalEntry[];
    riskAlerts?: RiskAlert[];
  }) => {
    const newAccounts = (Array.isArray(backup.accounts) ? backup.accounts : []).filter(
      (a) => a && a.id && !accounts.some((cur) => cur.id === a.id)
    );
    const newTrades = (Array.isArray(backup.trades) ? backup.trades : []).filter(
      (t) => t && t.id && !trades.some((cur) => cur.id === t.id)
    );
    const newStrategies = (Array.isArray(backup.strategies) ? backup.strategies : []).filter(
      (s) => s && s.id && !strategies.some((cur) => cur.id === s.id)
    );
    const newJournal = (Array.isArray(backup.journalEntries) ? backup.journalEntries : []).filter(
      (j) => j && j.id && !journalEntries.some((cur) => cur.id === j.id)
    );
    const newAlerts = (Array.isArray(backup.riskAlerts) ? backup.riskAlerts : []).filter(
      (al) => al && al.id && !riskAlerts.some((cur) => cur.id === al.id)
    );

    if (newAccounts.length > 0) {
      setAccounts((prev) => [...newAccounts, ...prev]);
      newAccounts.forEach((a) => {
        void persistUpsertToCloud('account', a.id, () => SupabaseService.saveAccount(a));
      });
    }
    if (newTrades.length > 0) {
      setTrades((prev) => [...newTrades, ...prev]);
      newTrades.forEach((t) => {
        void persistUpsertToCloud('trade', t.id, () => SupabaseService.saveTrade(t));
      });
    }
    if (newStrategies.length > 0) {
      setStrategies((prev) => [...newStrategies, ...prev]);
      newStrategies.forEach((s) => {
        void persistUpsertToCloud('strategy', s.id, () => SupabaseService.saveStrategy(s));
      });
    }
    if (newJournal.length > 0) {
      setJournalEntries((prev) => [...newJournal, ...prev]);
      newJournal.forEach((j) => {
        void persistUpsertToCloud('journal', j.id, () => SupabaseService.saveJournalEntry(j));
      });
    }
    if (newAlerts.length > 0) {
      setRiskAlerts((prev) => [...newAlerts, ...prev]);
      newAlerts.forEach((al) => {
        void persistUpsertToCloud('alert', al.id, () => SupabaseService.saveAlert(al));
      });
    }

    return {
      accounts: newAccounts.length,
      trades: newTrades.length,
      strategies: newStrategies.length,
      journalEntries: newJournal.length,
    };
  };

  const resetToDemoData = () => {
    setAccounts(SEED_ACCOUNTS);
    setTrades(SEED_TRADES);
    setStrategies(SEED_STRATEGIES);
    setJournalEntries(SEED_JOURNAL);
    setRiskAlerts(SEED_ALERTS);
    setSelectedAccountId('ALL');
    setEnvironmentFilter('live');
    saveTombstones([]);
    clearOutbox();
    setPendingSyncCount(0);
    localStorage.removeItem(STORAGE_KEY);
  };

  const clearDemoData = () => {
    const seedAccountIds = new Set(SEED_ACCOUNTS.map((a) => a.id));
    const seedTradeIds = new Set(SEED_TRADES.map((t) => t.id));
    const seedStrategyIds = new Set(SEED_STRATEGIES.map((s) => s.id));
    const seedJournalIds = new Set(SEED_JOURNAL.map((j) => j.id));
    const seedAlertIds = new Set(SEED_ALERTS.map((al) => al.id));

    const removedAccounts = accounts.filter((a) => a.isDemo || seedAccountIds.has(a.id));
    const removedTrades = trades.filter(
      (t) =>
        seedTradeIds.has(t.id) ||
        t.allocations.some((a) => seedAccountIds.has(a.accountId)) ||
        t.environment === 'demo' ||
        t.id.startsWith('tr-seed')
    );
    const removedStrategies = strategies.filter((s) => seedStrategyIds.has(s.id));
    const removedJournals = journalEntries.filter((j) => seedJournalIds.has(j.id));
    const removedAlerts = riskAlerts.filter(
      (al) => seedAlertIds.has(al.id) || seedAccountIds.has(al.accountId)
    );

    const now = new Date().toISOString();
    const tombstonesToApply: SyncTombstone[] = [
      ...removedAccounts.map((a) => ({ id: a.id, entityType: 'account' as const, deletedAt: now })),
      ...removedTrades.map((t) => ({ id: t.id, entityType: 'trade' as const, deletedAt: now })),
      ...removedStrategies.map((s) => ({ id: s.id, entityType: 'strategy' as const, deletedAt: now })),
      ...removedJournals.map((j) => ({ id: j.id, entityType: 'journal' as const, deletedAt: now })),
      ...removedAlerts.map((al) => ({ id: al.id, entityType: 'alert' as const, deletedAt: now })),
    ];

    tombstonesToApply.forEach((tb) => recordTombstone(tb.entityType, tb.id));

    const nextAccounts = accounts.filter((a) => !a.isDemo && !seedAccountIds.has(a.id));
    const nextTrades = trades.filter(
      (t) =>
        !seedTradeIds.has(t.id) &&
        !t.allocations.some((a) => seedAccountIds.has(a.accountId)) &&
        t.environment !== 'demo' &&
        !t.id.startsWith('tr-seed')
    );
    const nextStrategies = strategies.filter((s) => !seedStrategyIds.has(s.id));
    const nextJournal = journalEntries.filter((j) => !seedJournalIds.has(j.id));
    const nextAlerts = riskAlerts.filter(
      (al) => !seedAlertIds.has(al.id) && !seedAccountIds.has(al.accountId)
    );

    setAccounts(nextAccounts);
    setTrades(nextTrades);
    setStrategies(nextStrategies);
    setJournalEntries(nextJournal);
    setRiskAlerts(nextAlerts);
    setSelectedAccountId('ALL');

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        accounts: nextAccounts,
        trades: nextTrades,
        strategies: nextStrategies,
        journalEntries: nextJournal,
        riskAlerts: nextAlerts,
      })
    );

    if (isSupabaseConfigured && tombstonesToApply.length > 0) {
      void SupabaseService.applyTombstones(tombstonesToApply);
    }
  };

  const clearAllUserData = () => {
    const now = new Date().toISOString();
    const tombstonesToApply: SyncTombstone[] = [
      ...latestStateRef.current.accounts.map((a) => ({ id: a.id, entityType: 'account' as const, deletedAt: now })),
      ...latestStateRef.current.trades.map((t) => ({ id: t.id, entityType: 'trade' as const, deletedAt: now })),
      ...latestStateRef.current.strategies.map((s) => ({ id: s.id, entityType: 'strategy' as const, deletedAt: now })),
      ...latestStateRef.current.journalEntries.map((j) => ({ id: j.id, entityType: 'journal' as const, deletedAt: now })),
      ...latestStateRef.current.riskAlerts.map((al) => ({ id: al.id, entityType: 'alert' as const, deletedAt: now })),
    ];

    tombstonesToApply.forEach((tb) => recordTombstone(tb.entityType, tb.id));

    setAccounts([]);
    setTrades([]);
    setStrategies([]);
    setJournalEntries([]);
    setRiskAlerts([]);
    setSelectedAccountId('ALL');
    clearOutbox();
    setPendingSyncCount(0);
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        accounts: [],
        trades: [],
        strategies: [],
        journalEntries: [],
        riskAlerts: [],
      })
    );

    if (isSupabaseConfigured && tombstonesToApply.length > 0) {
      void SupabaseService.applyTombstones(tombstonesToApply);
    }
  };

  return (
    <TradingContext.Provider
      value={{
        baseCurrency: appConfig.app.defaultBaseCurrency,
        accounts,
        selectedAccountId,
        setSelectedAccountId,
        selectedAccount,
        periodFilter,
        setPeriodFilter,
        environmentFilter,
        setEnvironmentFilter,
        trades,
        filteredTrades,
        strategies,
        instruments,
        journalEntries,
        riskAlerts,
        isLoaded,
        isPnlHidden,
        setIsPnlHidden,
        togglePnlPrivacy,
        addAccount,
        updateAccount,
        deleteAccount,
        addTrade,
        updateTrade,
        deleteTrade,
        executePartialClose,
        addStrategy,
        updateStrategy,
        deleteStrategy,
        addJournalEntry,
        updateJournalEntry,
        deleteJournalEntry,
        dismissAlert,
        updateRule,
        addRule,
        toggleRule,
        deleteRule,
        importTrades,
        importBackupState,
        resetToDemoData,
        clearDemoData,
        clearAllUserData,
        portfolioMetrics,
        isCloudConfigured: isSupabaseConfigured,
        syncStatus,
        lastSyncedAt,
        pendingSyncCount,
        syncWithCloud,
      }}
    >
      {children}
    </TradingContext.Provider>
  );
};

export const useTrading = () => {
  const context = useContext(TradingContext);
  if (!context) {
    throw new Error('useTrading must be used within a TradingProvider');
  }
  return context;
};

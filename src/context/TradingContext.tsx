'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
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

  dismissAlert: (alertId: string) => void;
  updateRule: (accountId: string, rule: AccountRule) => void;
  addRule: (accountId: string, rule: Partial<AccountRule>) => void;
  toggleRule: (accountId: string, ruleId: string) => void;
  deleteRule: (accountId: string, ruleId: string) => void;

  importTrades: (newTrades: Trade[]) => void;
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

  // Load state from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.accounts && parsed.accounts.length > 0) {
          // Merge rich seed rules if stored accounts have missing/outdated rules
          const hydratedAccounts = parsed.accounts.map((acc: TradingAccount) => {
            const seed = SEED_ACCOUNTS.find((s) => s.id === acc.id);
            if (seed && (!acc.rules || acc.rules.length < seed.rules.length)) {
              return { ...acc, rules: seed.rules };
            }
            if (!acc.rules || acc.rules.length === 0) {
              return {
                ...acc,
                rules: generatePersonalizedRules(acc.id, acc.accountType, acc.brokerOrFirm, acc.accountSize),
              };
            }
            return acc;
          });
          setAccounts(hydratedAccounts);
        }
        if (parsed.trades && parsed.trades.length > 0) setTrades(parsed.trades);
        if (parsed.strategies && parsed.strategies.length > 0) setStrategies(parsed.strategies);
        if (parsed.journalEntries && parsed.journalEntries.length > 0) setJournalEntries(parsed.journalEntries);
        if (parsed.riskAlerts) setRiskAlerts(parsed.riskAlerts);
      }
    } catch (e) {
      console.warn('Failed to parse stored EdgeLedger data', e);
    } finally {
      setIsLoaded(true);
    }
  }, []);

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

  // Actions
  const addAccount = (accountData: Partial<TradingAccount>) => {
    const size = Number(accountData.accountSize) || 100000;
    const accountId = `acc-${Date.now()}`;
    const accountType = accountData.accountType || 'prop_evaluation';
    const brokerOrFirm = accountData.brokerOrFirm || 'Prop Desk';

    const newAccount: TradingAccount = {
      id: accountId,
      userId: 'user-default',
      name: accountData.name || `${brokerOrFirm} $${(size / 1000).toFixed(0)}k`,
      brokerOrFirm,
      accountType,
      currency: accountData.currency || 'USD',
      accountSize: size,
      startingBalance: size,
      currentBalance: size,
      currentEquity: size,
      highWaterMark: size,
      challengePhase: accountData.challengePhase || 'Phase 1',
      status: 'active',
      isDemo: accountData.isDemo ?? false,
      positionMatchingMode: accountData.positionMatchingMode || 'hedging',
      rules: generatePersonalizedRules(accountId, accountType, brokerOrFirm, size),
      notes: accountData.notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setAccounts((prev) => [newAccount, ...prev]);
  };

  const updateAccount = (updated: TradingAccount) => {
    setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  };

  const deleteAccount = (id: string) => {
    setAccounts((prev) => prev.filter((a) => a.id !== id));
    if (selectedAccountId === id) setSelectedAccountId('ALL');
  };

  const addTrade = (tradeData: Partial<Trade>) => {
    const now = new Date().toISOString();
    const tradeId = `tr-${Date.now()}`;
    const targetAccount = selectedAccount || accounts[0];
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
            accountId: targetAccount.id,
            accountName: targetAccount.name,
            allocatedPositionSize: 1.0,
            allocatedRiskUsd: riskUsd,
            allocatedRiskPct: Math.round((riskUsd / targetAccount.currentEquity) * 1000) / 10,
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
                accountId: targetAccount.id,
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
      realizedPnl: 0,
      netPnl: 0,
      realizedR: 0,
      totalCommission: 10,
      totalSwap: 0,
      totalFees: 0,
      entryTime: tradeData.entryTime || now,
      exitTime: tradeData.exitTime,
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
  };

  const updateTrade = (updated: Trade) => {
    // Validates that closed trade cannot reopen
    const existing = trades.find((t) => t.id === updated.id);
    if (existing && existing.status === 'CLOSED' && updated.status !== 'CLOSED') {
      throw new Error('A closed trade cannot be reopened. Record a new trade execution instead.');
    }
    setTrades((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  const deleteTrade = (id: string) => {
    setTrades((prev) => prev.filter((t) => t.id !== id));
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
      const newRealizedPnl = alloc.realizedPnl + pnlResult.grossPnl;
      const newNetPnl = alloc.netPnl + pnlResult.netPnl;

      // Update account balance and equity in ledger
      setAccounts((prevAccs) =>
        prevAccs.map((acc) => {
          if (acc.id !== alloc.accountId) return acc;
          const newBal = acc.currentBalance + pnlResult.netPnl;
          const newEq = acc.currentEquity + pnlResult.netPnl;
          const newHwm = Math.max(acc.highWaterMark, newEq);
          return {
            ...acc,
            currentBalance: Math.round(newBal * 100) / 100,
            currentEquity: Math.round(newEq * 100) / 100,
            highWaterMark: Math.round(newHwm * 100) / 100,
            updatedAt: now,
          };
        })
      );

      return {
        ...alloc,
        allocatedPositionSize: remainingSize,
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
  };

  const addStrategy = (strategyData: Partial<Strategy>) => {
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
      createdAt: new Date().toISOString(),
    };
    setStrategies((prev) => [newStrategy, ...prev]);
  };

  const updateStrategy = (updated: Strategy) => {
    setStrategies((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  const deleteStrategy = (id: string) => {
    setStrategies((prev) => prev.filter((s) => s.id !== id));
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
    };
    setJournalEntries((prev) => [newEntry, ...prev]);
  };

  const updateJournalEntry = (updated: JournalEntry) => {
    setJournalEntries((prev) => prev.map((j) => (j.id === updated.id ? updated : j)));
  };

  const dismissAlert = (alertId: string) => {
    setRiskAlerts((prev) => prev.filter((a) => a.id !== alertId));
  };

  const updateRule = (accountId: string, updatedRule: AccountRule) => {
    setAccounts((prev) =>
      prev.map((acc) => {
        if (acc.id !== accountId) return acc;
        return {
          ...acc,
          rules: acc.rules.map((r) => (r.id === updatedRule.id ? updatedRule : r)),
        };
      })
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

    setAccounts((prev) =>
      prev.map((acc) => {
        if (acc.id !== accountId) return acc;
        return {
          ...acc,
          rules: [...acc.rules, newRule],
        };
      })
    );
  };

  const toggleRule = (accountId: string, ruleId: string) => {
    setAccounts((prev) =>
      prev.map((acc) => {
        if (acc.id !== accountId) return acc;
        return {
          ...acc,
          rules: acc.rules.map((r) =>
            r.id === ruleId ? { ...r, isEnabled: !r.isEnabled } : r
          ),
        };
      })
    );
  };

  const deleteRule = (accountId: string, ruleId: string) => {
    setAccounts((prev) =>
      prev.map((acc) => {
        if (acc.id !== accountId) return acc;
        return {
          ...acc,
          rules: acc.rules.filter((r) => r.id !== ruleId),
        };
      })
    );
  };

  const importTrades = (newTrades: Trade[]) => {
    // Idempotent deduplication: filter out any trades whose id or signature already exists
    const existingIds = new Set(trades.map((t) => t.id));
    const uniqueNew = newTrades.filter((t) => !existingIds.has(t.id));
    setTrades((prev) => [...uniqueNew, ...prev]);
  };

  const resetToDemoData = () => {
    setAccounts(SEED_ACCOUNTS);
    setTrades(SEED_TRADES);
    setStrategies(SEED_STRATEGIES);
    setJournalEntries(SEED_JOURNAL);
    setRiskAlerts(SEED_ALERTS);
    setSelectedAccountId('ALL');
    setEnvironmentFilter('live');
    localStorage.removeItem(STORAGE_KEY);
  };

  const clearDemoData = () => {
    // Remove all demo accounts and their associated trades
    const demoAccountIds = new Set(accounts.filter((a) => a.isDemo).map((a) => a.id));
    setAccounts((prev) => prev.filter((a) => !a.isDemo));
    setTrades((prev) =>
      prev.filter((t) => !t.allocations.some((a) => demoAccountIds.has(a.accountId)) && t.environment !== 'demo')
    );
    if (demoAccountIds.has(selectedAccountId)) {
      setSelectedAccountId('ALL');
    }
  };

  const clearAllUserData = () => {
    setAccounts([]);
    setTrades([]);
    setJournalEntries([]);
    setRiskAlerts([]);
    setSelectedAccountId('ALL');
    localStorage.removeItem(STORAGE_KEY);
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
        dismissAlert,
        updateRule,
        addRule,
        toggleRule,
        deleteRule,
        importTrades,
        resetToDemoData,
        clearDemoData,
        clearAllUserData,
        portfolioMetrics,
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

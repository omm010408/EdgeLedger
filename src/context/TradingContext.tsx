'use client';

import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import {
  TradingAccount,
  Trade,
  InstrumentSpecification,
  AccountRule,
  TradeAllocation,
  TradeExecution
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
  evaluateAccountRule
} from '../lib/calculations/financialEngine';

interface TradingContextType {
  accounts: TradingAccount[];
  selectedAccountId: string; // 'ALL' or specific account id
  setSelectedAccountId: (id: string) => void;
  selectedAccount: TradingAccount | null;
  trades: Trade[];
  filteredTrades: Trade[];
  strategies: Strategy[];
  instruments: InstrumentSpecification[];
  journalEntries: JournalEntry[];
  riskAlerts: RiskAlert[];
  isLoaded: boolean;

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

  importTrades: (newTrades: Trade[]) => void;
  resetToDemoData: () => void;

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

const STORAGE_KEY = 'edgeledger_v1_store';

export const TradingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [accounts, setAccounts] = useState<TradingAccount[]>(SEED_ACCOUNTS);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('ALL');
  const [trades, setTrades] = useState<Trade[]>(SEED_TRADES);
  const [strategies, setStrategies] = useState<Strategy[]>(SEED_STRATEGIES);
  const [instruments] = useState<InstrumentSpecification[]>(SEED_INSTRUMENTS);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(SEED_JOURNAL);
  const [riskAlerts, setRiskAlerts] = useState<RiskAlert[]>(SEED_ALERTS);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  // Load state from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.accounts && parsed.accounts.length > 0) setAccounts(parsed.accounts);
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

  // Trades filtered by selected account
  const filteredTrades = useMemo(() => {
    if (selectedAccountId === 'ALL') return trades;
    return trades.filter((t) =>
      t.allocations.some((alloc) => alloc.accountId === selectedAccountId)
    );
  }, [trades, selectedAccountId]);

  // Portfolio & Account calculations
  const portfolioMetrics = useMemo(() => {
    const relevantTrades = filteredTrades;
    const baseStats = calculateTradingStatistics(relevantTrades);

    // Sum balances & equities
    let totalBal = 0;
    let totalEq = 0;
    let openRisk = 0;

    const targetAccounts = selectedAccountId === 'ALL'
      ? accounts
      : accounts.filter((a) => a.id === selectedAccountId);

    targetAccounts.forEach((acc) => {
      totalBal += acc.currentBalance;
      totalEq += acc.currentEquity;
    });

    // Open trades risk
    const openTrades = relevantTrades.filter((t) => t.status === 'OPEN');
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

      if (t.status === 'CLOSED') {
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
  }, [filteredTrades, accounts, selectedAccountId]);

  // Actions
  const addAccount = (accountData: Partial<TradingAccount>) => {
    const size = Number(accountData.accountSize) || 100000;
    const newAccount: TradingAccount = {
      id: `acc-${Date.now()}`,
      userId: 'user-default',
      name: accountData.name || 'New Trading Account',
      brokerOrFirm: accountData.brokerOrFirm || 'Prop Desk',
      accountType: accountData.accountType || 'prop_evaluation',
      currency: accountData.currency || 'USD',
      accountSize: size,
      startingBalance: size,
      currentBalance: size,
      currentEquity: size,
      highWaterMark: size,
      challengePhase: accountData.challengePhase || 'Phase 1',
      status: 'active',
      rules: [
        {
          id: `rule-${Date.now()}-1`,
          accountId: `acc-${Date.now()}`,
          ruleType: 'daily_loss_limit',
          thresholdValue: Math.round(size * 0.05),
          thresholdUnit: 'currency',
          calculationMethod: 'equity_based',
          warningThresholdPct: 70,
          isEnabled: true,
          currentStatus: 'SAFE',
          currentMetricValue: 0,
          resetFrequency: 'daily',
          applicableTimezone: 'UTC',
        },
        {
          id: `rule-${Date.now()}-2`,
          accountId: `acc-${Date.now()}`,
          ruleType: 'max_overall_loss',
          thresholdValue: Math.round(size * 0.10),
          thresholdUnit: 'currency',
          calculationMethod: 'static',
          warningThresholdPct: 80,
          isEnabled: true,
          currentStatus: 'SAFE',
          currentMetricValue: 0,
          resetFrequency: 'none',
          applicableTimezone: 'UTC',
        },
      ],
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
    const instrument = instruments.find((i) => i.symbol === tradeData.instrumentSymbol) || instruments[0];

    const targetAccount = selectedAccount || accounts[0];
    const riskUsd = tradeData.plannedRiskUsd || 500;
    const entryPrice = tradeData.entryPrice || 100;
    const stopLoss = tradeData.stopLoss || 95;

    // Create single or multi-allocation
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
      direction: tradeData.direction || 'BUY',
      status: tradeData.status || 'OPEN',
      timeframe: tradeData.timeframe || '15M',
      session: tradeData.session || 'London',
      setupType: tradeData.setupType || 'Market Structure Shift',
      entryPrice,
      stopLoss,
      takeProfit: tradeData.takeProfit,
      plannedRiskUsd: riskUsd,
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
      marketConditions: tradeData.marketConditions || 'Normal',
      screenshots: tradeData.screenshots || [],
      tags: tradeData.tags || ['Execution'],
      allocations: defaultAllocations,
      isRuleCompliant: tradeData.isRuleCompliant ?? true,
      createdAt: now,
      updatedAt: now,
    };

    setTrades((prev) => [newTrade, ...prev]);

    // Update account risk metrics and open positions
    setAccounts((prev) =>
      prev.map((acc) => {
        const alloc = defaultAllocations.find((a) => a.accountId === acc.id);
        if (!alloc) return acc;
        return {
          ...acc,
          updatedAt: now,
        };
      })
    );
  };

  const updateTrade = (updated: Trade) => {
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

      // Update account balance and equity
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
        status: isFullyClosed ? ('CLOSED' as const) : ('OPEN' as const),
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
      realizedR: trade.plannedRiskUsd > 0
        ? Math.round((totalNetPnl / trade.plannedRiskUsd) * 100) / 100
        : 0,
      status: allAllocationsClosed ? 'CLOSED' : 'OPEN',
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
      disciplineScore: entryData.disciplineScore ?? 8,
      preparationScore: entryData.preparationScore ?? 8,
      executionScore: entryData.executionScore ?? 8,
      fomoDetected: entryData.fomoDetected ?? false,
      revengeTrading: entryData.revengeTrading ?? false,
      overtrading: entryData.overtrading ?? false,
      movedStopLoss: entryData.movedStopLoss ?? false,
      prematureExit: entryData.prematureExit ?? false,
      ignoredRules: entryData.ignoredRules ?? false,
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
      warningThresholdPct: ruleData.warningThresholdPct || 70,
      isEnabled: true,
      currentStatus: 'SAFE',
      currentMetricValue: 0,
      resetFrequency: ruleData.resetFrequency || 'daily',
      applicableTimezone: 'UTC',
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

  const importTrades = (newTrades: Trade[]) => {
    setTrades((prev) => [...newTrades, ...prev]);
  };

  const resetToDemoData = () => {
    setAccounts(SEED_ACCOUNTS);
    setTrades(SEED_TRADES);
    setStrategies(SEED_STRATEGIES);
    setJournalEntries(SEED_JOURNAL);
    setRiskAlerts(SEED_ALERTS);
    setSelectedAccountId('ALL');
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <TradingContext.Provider
      value={{
        accounts,
        selectedAccountId,
        setSelectedAccountId,
        selectedAccount,
        trades,
        filteredTrades,
        strategies,
        instruments,
        journalEntries,
        riskAlerts,
        isLoaded,
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
        importTrades,
        resetToDemoData,
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

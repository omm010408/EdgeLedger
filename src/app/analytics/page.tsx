'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Columns2,
  Download,
  Filter,
  Printer,
  X,
} from 'lucide-react';
import { useTrading } from '@/context/TradingContext';
import type { Trade, TradingAccount } from '@/lib/types/financial';
import {
  ANALYTICS_METRIC_DEFINITIONS,
  type AnalyticsFilterState,
  type AnalyticsPeriodFilter,
  type CurveValueMode,
  type DeskRuleMonitor,
  buildEquityAndDrawdownSeries,
  computeBreakdownRows,
  computeDeskComparisonStats,
  computeEdgeHeatmap,
  computeFirmRuleMonitors,
  computeRDistribution,
  computeReconciliationConflicts,
  computeSampleGuard,
  computeStrategyAttribution,
  computeStreaksAndClustering,
  detectTradeQualitySupport,
  filterTradesByAnalyticsControls,
  getScopedTradePnl,
  getShortDeskLabelFromAccount,
  getTradeDateKey,
  getTradeWeekdayLabel,
  isSwingTrade,
} from '@/lib/analytics/analyticsEngine';
import {
  CurrencyText,
  SampleStatusPill,
  downloadCsvFile,
  formatCurrencySigned,
  formatPercentSigned,
  formatRSigned,
} from '@/components/analytics/AnalyticsShared';
import {
  DirectionSymbolBreakdownModule,
  EdgeHeatmapModule,
  EquityDrawdownModule,
  FirmRuleMonitorModule,
  RDistributionModule,
  StrategyAttributionModule,
  StreaksClusterModule,
} from '@/components/analytics/AnalyticsCharts';

type CompareMode = 'net' | 'ret' | 'win';

const RULE_OVERRIDES_STORAGE_KEY = 'edgeledger_firm_rule_overrides_v1';

function getAccountDotColor(acc: TradingAccount, index: number): string {
  const idLower = acc.id.toLowerCase();
  const nameLower = acc.name.toLowerCase();
  if (idLower.includes('apex') || nameLower.includes('apex')) return 'var(--tw-a-apex)';
  if (idLower.includes('ftmo') || nameLower.includes('ftmo')) return 'var(--tw-a-ftmo)';
  if (idLower.includes('ic') || nameLower.includes('ic markets')) return 'var(--tw-a-ic)';
  if (idLower.includes('aqua') || nameLower.includes('aqua')) return 'var(--tw-a-aqua)';
  const fallback = [
    'var(--tw-a-apex)',
    'var(--tw-a-ftmo)',
    'var(--tw-a-ic)',
    'var(--tw-a-aqua)',
    'var(--tw-s2)',
  ];
  return fallback[index % fallback.length];
}

export default function AnalyticsPage() {
  const {
    accounts,
    selectedAccountId,
    setSelectedAccountId,
    trades,
    strategies,
    periodFilter,
    setPeriodFilter,
    isPnlHidden,
    isLoaded,
    syncStatus,
    lastSyncedAt,
  } = useTrading();

  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(() =>
    selectedAccountId && selectedAccountId !== 'ALL' ? [selectedAccountId] : []
  );
  const [analyticsPeriod, setAnalyticsPeriod] = useState<AnalyticsPeriodFilter>(periodFilter);
  const [customStartDate, setCustomStartDate] = useState<string>('2024-01-01');
  const [customEndDate, setCustomEndDate] = useState<string>('2026-12-31');
  const [compareMode, setCompareMode] = useState<CompareMode>('net');
  const [excludeSwingFromSession, setExcludeSwingFromSession] = useState<boolean>(true);
  const [curveMode, setCurveMode] = useState<CurveValueMode>('equity');
  const [drilldown, setDrilldown] = useState<AnalyticsFilterState['drilldown']>(undefined);

  const [compareOpen, setCompareOpen] = useState<boolean>(false);
  const [compareDeskA, setCompareDeskA] = useState<string>('');
  const [compareDeskB, setCompareDeskB] = useState<string>('');

  const [ruleOverrides, setRuleOverrides] = useState<
    Record<string, Partial<DeskRuleMonitor['config']>>
  >(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = window.localStorage.getItem(RULE_OVERRIDES_STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    setAnalyticsPeriod(periodFilter);
  }, [periodFilter]);

  useEffect(() => {
    if (selectedAccountId === 'ALL') {
      setSelectedAccountIds([]);
    } else if (selectedAccountId) {
      setSelectedAccountIds([selectedAccountId]);
    }
  }, [selectedAccountId]);

  useEffect(() => {
    if (accounts.length >= 1 && !compareDeskA) {
      setCompareDeskA(accounts[0].id);
    }
    if (accounts.length >= 2 && !compareDeskB) {
      setCompareDeskB(accounts[1].id);
    }
  }, [accounts, compareDeskA, compareDeskB]);

  const updateDeskRuleOverride = (
    accountId: string,
    patch: Partial<DeskRuleMonitor['config']>
  ) => {
    setRuleOverrides((prev) => {
      const next = {
        ...prev,
        [accountId]: { ...(prev[accountId] || {}), ...patch },
      };
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(RULE_OVERRIDES_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
      }
      return next;
    });
  };

  const resetDeskRuleOverride = (accountId: string) => {
    setRuleOverrides((prev) => {
      const next = { ...prev };
      delete next[accountId];
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(RULE_OVERRIDES_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
      }
      return next;
    });
  };

  const toggleDeskSelection = (accountId: string) => {
    setSelectedAccountIds((prev) => {
      const exists = prev.includes(accountId);
      const next = exists ? prev.filter((id) => id !== accountId) : [...prev, accountId];
      if (next.length === 0) {
        setSelectedAccountId('ALL');
      } else if (next.length === 1) {
        setSelectedAccountId(next[0]);
      }
      return next;
    });
  };

  const selectAllDesks = () => {
    setSelectedAccountIds([]);
    setSelectedAccountId('ALL');
  };

  const handlePeriodSelect = (nextPeriod: AnalyticsPeriodFilter) => {
    setAnalyticsPeriod(nextPeriod);
    if (nextPeriod === 'Week' || nextPeriod === 'Month' || nextPeriod === 'All time') {
      setPeriodFilter(nextPeriod);
    }
  };

  const filterState: AnalyticsFilterState = useMemo(
    () => ({
      selectedAccountIds,
      period: analyticsPeriod,
      customStartDate,
      customEndDate,
      excludeSwingFromSession,
      drilldown: undefined,
    }),
    [selectedAccountIds, analyticsPeriod, customStartDate, customEndDate, excludeSwingFromSession]
  );

  const liveScopedClosedTrades = useMemo(
    () => filterTradesByAnalyticsControls(trades, accounts, filterState),
    [trades, accounts, filterState]
  );

  const lastKnownSnapshotRef = useRef<{
    closedTrades: Trade[];
    timestampLabel: string;
  }>({ closedTrades: [], timestampLabel: new Date().toLocaleString() });

  useEffect(() => {
    if (syncStatus !== 'error' && isLoaded) {
      lastKnownSnapshotRef.current = {
        closedTrades: liveScopedClosedTrades,
        timestampLabel: lastSyncedAt
          ? new Date(lastSyncedAt).toLocaleString()
          : new Date().toLocaleString(),
      };
    }
  }, [liveScopedClosedTrades, syncStatus, isLoaded, lastSyncedAt]);

  const scopedClosedTrades =
    syncStatus === 'error' && liveScopedClosedTrades.length === 0
      ? lastKnownSnapshotRef.current.closedTrades
      : liveScopedClosedTrades;

  const ledgerTrades = useMemo(() => {
    if (!drilldown) return scopedClosedTrades;
    return filterTradesByAnalyticsControls(trades, accounts, {
      ...filterState,
      drilldown,
    });
  }, [scopedClosedTrades, trades, accounts, filterState, drilldown]);

  const sampleGuard = useMemo(
    () => computeSampleGuard(scopedClosedTrades),
    [scopedClosedTrades]
  );

  const periodClosedAllDesks = useMemo(
    () =>
      filterTradesByAnalyticsControls(trades, accounts, {
        ...filterState,
        selectedAccountIds: [],
      }),
    [trades, accounts, filterState]
  );

  const deskComparisonStats = useMemo(
    () => computeDeskComparisonStats(accounts, periodClosedAllDesks),
    [accounts, periodClosedAllDesks]
  );

  const visibleDesks = useMemo(
    () =>
      selectedAccountIds.length === 0
        ? accounts
        : accounts.filter((a) => selectedAccountIds.includes(a.id)),
    [accounts, selectedAccountIds]
  );

  const visibleDeskStats = useMemo(
    () =>
      selectedAccountIds.length === 0
        ? deskComparisonStats
        : deskComparisonStats.filter((d) => selectedAccountIds.includes(d.id)),
    [deskComparisonStats, selectedAccountIds]
  );

  const dateRangeLabel = useMemo(() => {
    if (scopedClosedTrades.length === 0) return analyticsPeriod;
    const dates = scopedClosedTrades.map(getTradeDateKey).sort();
    const first = dates[0];
    const last = dates[dates.length - 1];
    return first === last ? first : `${first} to ${last}`;
  }, [scopedClosedTrades, analyticsPeriod]);

  const reconciliation = useMemo(
    () =>
      computeReconciliationConflicts({
        allClosedTrades: periodClosedAllDesks,
        deskStats: deskComparisonStats,
        selectedAccountIds,
        allAccountsCount: accounts.length,
        reportYear: new Date().getFullYear(),
      }),
    [periodClosedAllDesks, deskComparisonStats, selectedAccountIds, accounts.length]
  );

  const headlineMetrics = useMemo(() => {
    let netPnl = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let wins = 0;
    let totalR = 0;
    let rWins = 0;
    let rLosses = 0;
    let winCount = 0;
    let lossCount = 0;
    let longNet = 0;
    let shortNet = 0;

    for (const t of scopedClosedTrades) {
      const p = getScopedTradePnl(t, selectedAccountIds, accounts.length);
      const rVal = Number.isFinite(t.realizedR) ? t.realizedR : 0;
      netPnl += p;
      totalR += rVal;
      if (t.direction === 'BUY') longNet += p;
      else shortNet += p;
      if (p > 0) {
        wins++;
        winCount++;
        grossProfit += p;
        rWins += rVal;
      } else if (p < 0) {
        lossCount++;
        grossLoss += Math.abs(p);
        rLosses += Math.abs(rVal);
      }
    }

    const n = scopedClosedTrades.length;
    const startCap = visibleDesks.reduce((s, a) => s + a.startingBalance, 0);
    const totalEquity = visibleDesks.reduce((s, a) => s + a.currentEquity, 0);
    const derivedReturnPct = startCap > 0 ? (netPnl / startCap) * 100 : 0;
    const reportedReturnPct = startCap > 0 ? ((totalEquity - startCap) / startCap) * 100 : 0;
    const winRatePct = n > 0 ? (wins / n) * 100 : 0;
    const expectancyUsd = n > 0 ? netPnl / n : 0;
    const expectancyR = n > 0 ? totalR / n : 0;
    const avgWinUsd = winCount > 0 ? grossProfit / winCount : 0;
    const avgLossUsd = lossCount > 0 ? grossLoss / lossCount : 0;
    const avgWinR = winCount > 0 ? rWins / winCount : 0;
    const avgLossR = lossCount > 0 ? rLosses / lossCount : 0;

    let profitFactorLabel = '—';
    if (n === 0) {
      profitFactorLabel = '—';
    } else if (grossLoss === 0 && grossProfit > 0) {
      profitFactorLabel = 'No losing trades';
    } else if (sampleGuard.isInsufficientForRatio) {
      profitFactorLabel = 'Insufficient sample';
    } else {
      profitFactorLabel = (grossProfit / grossLoss).toFixed(2);
    }

    return {
      n,
      netPnl,
      longNet,
      shortNet,
      grossProfit,
      grossLoss,
      wins,
      winCount,
      lossCount,
      startCap,
      totalEquity,
      derivedReturnPct,
      reportedReturnPct,
      winRatePct,
      expectancyUsd,
      expectancyR,
      avgWinUsd,
      avgLossUsd,
      avgWinR,
      avgLossR,
      profitFactorLabel,
      winRateLabel: sampleGuard.isInsufficientForRatio ? 'Insufficient sample' : `${winRatePct.toFixed(1)}%`,
      sharpeLabel: sampleGuard.hasEnoughTradingDays ? 'Active' : 'Needs 30 trading days',
    };
  }, [scopedClosedTrades, selectedAccountIds, accounts.length, visibleDesks, sampleGuard]);

  // Structured Reconciliation Rows (Stated | Derived | Gap)
  const reconciliationRows = useMemo(() => {
    const rows: Array<{
      item: string;
      stated: string;
      derived: string;
      gap: string;
      isPnl?: boolean;
    }> = [];

    if (
      selectedAccountIds.length === 0 ||
      selectedAccountIds.length >= accounts.length
    ) {
      rows.push({
        item: 'Consolidated vs desk sum',
        stated: formatCurrencySigned(reconciliation.consolidatedNet, false),
        derived: formatCurrencySigned(reconciliation.deskAllocationSum, false),
        gap: formatCurrencySigned(reconciliation.netGap, true),
        isPnl: true,
      });
    }

    for (const d of visibleDeskStats) {
      if (Math.abs(d.equityConflictGap) >= 0.01) {
        rows.push({
          item: `${d.shortLabel} equity`,
          stated: formatCurrencySigned(d.currentEquity, false),
          derived: formatCurrencySigned(d.impliedEquity, false),
          gap: formatCurrencySigned(d.equityConflictGap, true),
          isPnl: true,
        });
      }
    }

    rows.push({
      item: 'Combined return',
      stated: formatPercentSigned(headlineMetrics.reportedReturnPct),
      derived: formatPercentSigned(headlineMetrics.derivedReturnPct),
      gap: `${(headlineMetrics.reportedReturnPct - headlineMetrics.derivedReturnPct >= 0 ? '+' : '−')}${Math.abs(
        headlineMetrics.reportedReturnPct - headlineMetrics.derivedReturnPct
      ).toFixed(2)} pp`,
      isPnl: false,
    });

    rows.push({
      item: 'Ledger dates',
      stated: dateRangeLabel,
      derived: `report ${new Date().toISOString().slice(0, 10)}`,
      gap: '—',
      isPnl: false,
    });

    return rows;
  }, [
    selectedAccountIds.length,
    accounts.length,
    reconciliation,
    visibleDeskStats,
    headlineMetrics.reportedReturnPct,
    headlineMetrics.derivedReturnPct,
    dateRangeLabel,
  ]);

  const equityDrawdown = useMemo(
    () => buildEquityAndDrawdownSeries(accounts, scopedClosedTrades, selectedAccountIds),
    [accounts, scopedClosedTrades, selectedAccountIds]
  );

  const firmRuleMonitors = useMemo(
    () => computeFirmRuleMonitors(visibleDesks, scopedClosedTrades, ruleOverrides),
    [visibleDesks, scopedClosedTrades, ruleOverrides]
  );

  const rDist = useMemo(
    () => computeRDistribution(scopedClosedTrades, selectedAccountIds, accounts.length),
    [scopedClosedTrades, selectedAccountIds, accounts.length]
  );

  const edgeHeatmap = useMemo(
    () => computeEdgeHeatmap(scopedClosedTrades, excludeSwingFromSession),
    [scopedClosedTrades, excludeSwingFromSession]
  );

  const strategyAttribution = useMemo(
    () => computeStrategyAttribution(strategies, scopedClosedTrades, selectedAccountIds, accounts.length),
    [strategies, scopedClosedTrades, selectedAccountIds, accounts.length]
  );

  const streaksCluster = useMemo(
    () => computeStreaksAndClustering(scopedClosedTrades, selectedAccountIds, accounts.length),
    [scopedClosedTrades, selectedAccountIds, accounts.length]
  );

  const directionBreakdown = useMemo(
    () =>
      computeBreakdownRows(
        scopedClosedTrades,
        (t) => ({ key: t.direction, label: t.direction === 'BUY' ? 'Long (BUY)' : 'Short (SELL)' }),
        selectedAccountIds,
        accounts.length
      ),
    [scopedClosedTrades, selectedAccountIds, accounts.length]
  );

  const symbolBreakdown = useMemo(
    () =>
      computeBreakdownRows(
        scopedClosedTrades,
        (t) => ({ key: t.instrumentSymbol, label: t.instrumentSymbol }),
        selectedAccountIds,
        accounts.length
      ),
    [scopedClosedTrades, selectedAccountIds, accounts.length]
  );

  const tradeQuality = useMemo(
    () => detectTradeQualitySupport(scopedClosedTrades),
    [scopedClosedTrades]
  );

  const sessionColumns = useMemo(() => {
    const names = ['London', 'New York', 'Asian', 'Sydney'] as const;
    const tradesForSessions = excludeSwingFromSession
      ? scopedClosedTrades.filter((t) => !isSwingTrade(t))
      : scopedClosedTrades;

    const map = new Map<string, { total: number; count: number }>();
    for (const n of names) map.set(n, { total: 0, count: 0 });

    for (const t of tradesForSessions) {
      const s = t.session === 'London Close' ? 'New York' : t.session;
      const cur = map.get(s);
      if (cur) {
        cur.total += getScopedTradePnl(t, selectedAccountIds, accounts.length);
        cur.count += 1;
      }
    }
    const maxAbs = Math.max(
      1,
      ...Array.from(map.values()).map((v) => Math.abs(v.total))
    );
    return names.map((name) => {
      const entry = map.get(name) || { total: 0, count: 0 };
      return {
        name,
        total: entry.total,
        count: entry.count,
        heightPx: entry.count === 0 ? 2 : Math.max(16, Math.round((Math.abs(entry.total) / maxAbs) * 186)),
      };
    });
  }, [scopedClosedTrades, excludeSwingFromSession, selectedAccountIds, accounts.length]);

  const weekdayColumns = useMemo(() => {
    const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;
    const map = new Map<string, { total: number; count: number }>();
    for (const n of names) map.set(n, { total: 0, count: 0 });
    for (const t of scopedClosedTrades) {
      const w = getTradeWeekdayLabel(t);
      const cur = map.get(w);
      if (cur) {
        cur.total += getScopedTradePnl(t, selectedAccountIds, accounts.length);
        cur.count += 1;
      }
    }
    const maxAbs = Math.max(
      1,
      ...Array.from(map.values()).map((v) => Math.abs(v.total))
    );
    return names.map((name) => {
      const entry = map.get(name) || { total: 0, count: 0 };
      return {
        name,
        total: entry.total,
        count: entry.count,
        heightPx: entry.count === 0 ? 2 : Math.max(16, Math.round((Math.abs(entry.total) / maxAbs) * 186)),
      };
    });
  }, [scopedClosedTrades, selectedAccountIds, accounts.length]);

  const barScaleBounds = useMemo(() => {
    if (visibleDeskStats.length === 0) return { min: -500, max: 6500 };
    if (compareMode === 'win') return { min: 0, max: 100 };
    const vals = visibleDeskStats.map((d) =>
      compareMode === 'net' ? d.netPnl : d.returnPct
    );
    const minVal = Math.min(0, ...vals);
    const maxVal = Math.max(0, ...vals);
    const pad = Math.max((maxVal - minVal) * 0.1, compareMode === 'net' ? 300 : 1);
    return { min: minVal === 0 ? 0 : minVal - pad, max: maxVal + pad };
  }, [visibleDeskStats, compareMode]);

  const deskAStat = deskComparisonStats.find((d) => d.id === compareDeskA);
  const deskBStat = deskComparisonStats.find((d) => d.id === compareDeskB);

  const hasAquaDeskInState = accounts.some((a) =>
    a.name.toLowerCase().includes('aqua') || a.id.toLowerCase().includes('aqua')
  );

  const exportFullLedgerCsv = () => {
    const headers = [
      'Trade ID',
      'Date',
      'Weekday',
      'Session',
      'Symbol',
      'Direction',
      'Strategy',
      'Realized R',
      'Scoped Net USD',
      'Status',
    ];
    const rows = ledgerTrades.map((t) => [
      t.id,
      getTradeDateKey(t),
      getTradeWeekdayLabel(t),
      t.session || 'Unassigned',
      t.instrumentSymbol,
      t.direction,
      t.strategyName || t.strategyId || '—',
      (Number.isFinite(t.realizedR) ? t.realizedR : 0).toFixed(2),
      getScopedTradePnl(t, selectedAccountIds, accounts.length).toFixed(2),
      t.status,
    ]);
    downloadCsvFile('edgeledger-analytics-ledger.csv', headers, rows);
  };

  const sharpeMeterPct = Math.min(100, Math.round((sampleGuard.tradingDaysCount / 30) * 100));

  return (
    <div className="tw-page-wrap">
      <section className="tw-page-head">
        <div>
          <div className="tw-eyebrow">EdgeLedger · Quantitative desk</div>
          <h1 className="tw-page-title">Performance analytics</h1>
          <p className="tw-page-lede">
            Multi-desk attribution, equity and drawdown, firm-rule monitoring and R-multiple analysis. Every figure shows its sample size.
          </p>
        </div>
        <div>
          <SampleStatusPill
            n={headlineMetrics.n}
            insufficientLabel={sampleGuard.isInsufficientForRatio ? 'Insufficient sample (< 5) for ratios' : undefined}
          />
        </div>
      </section>

      <main className="tw-bento-12" aria-label="EdgeLedger Quantitative Analytics">
        {!isLoaded && (
          <div className="tw-bento-tile tw-ana-banner" role="status" aria-live="polite">
            <span>Loading EdgeLedger desk dataset and computing analytics...</span>
          </div>
        )}

        {syncStatus === 'error' && (
          <div className="tw-ana-banner warn" role="alert">
            <span>
              <AlertTriangle size={15} style={{ display: 'inline', marginRight: 6 }} aria-hidden="true" />
              Cloud sync interrupted. Showing last known computed snapshot from{' '}
              <strong>{lastKnownSnapshotRef.current.timestampLabel}</strong>.
            </span>
          </div>
        )}

        {/* Controls */}
        <section className="tw-bento-tile tw-ana-controls-bar" aria-label="Analytics controls">
          <div className="tw-ana-controls-row">
            <div className="tw-ana-desk-pills" role="group" aria-label="Desks">
              <button
                type="button"
                className="tw-ana-chipbtn"
                aria-pressed={selectedAccountIds.length === 0}
                onClick={selectAllDesks}
              >
                All desks ({accounts.length})
              </button>
              {accounts.map((acc, idx) => {
                const isSelected = selectedAccountIds.includes(acc.id);
                return (
                  <button
                    key={acc.id}
                    type="button"
                    className="tw-ana-chipbtn"
                    aria-pressed={isSelected}
                    onClick={() => toggleDeskSelection(acc.id)}
                  >
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: '50%',
                        background: getAccountDotColor(acc, idx),
                        display: 'inline-block',
                        flexShrink: 0,
                      }}
                      aria-hidden="true"
                    />
                    <span>{getShortDeskLabelFromAccount(acc)}</span>
                  </button>
                );
              })}
            </div>

            <div className="tw-seg" role="group" aria-label="Period">
              {(['Week', 'Month', 'All time', 'Custom'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={analyticsPeriod === p ? 'on' : ''}
                  aria-pressed={analyticsPeriod === p}
                  onClick={() => handlePeriodSelect(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="tw-ana-controls-row">
            <div className="tw-ana-desk-pills">
              {analyticsPeriod === 'Custom' && (
                <div className="tw-ana-custom-dates">
                  <label>
                    <span className="sr-only">Custom start date</span>
                    <input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      aria-label="Custom range start date"
                    />
                  </label>
                  <span>to</span>
                  <label>
                    <span className="sr-only">Custom end date</span>
                    <input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      aria-label="Custom range end date"
                    />
                  </label>
                </div>
              )}

              <div className="tw-seg" role="group" aria-label="Metric">
                <button
                  type="button"
                  className={compareMode === 'net' ? 'on' : ''}
                  aria-pressed={compareMode === 'net'}
                  onClick={() => setCompareMode('net')}
                >
                  Net P&amp;L
                </button>
                <button
                  type="button"
                  className={compareMode === 'ret' ? 'on' : ''}
                  aria-pressed={compareMode === 'ret'}
                  onClick={() => setCompareMode('ret')}
                >
                  Growth %
                </button>
                <button
                  type="button"
                  className={compareMode === 'win' ? 'on' : ''}
                  aria-pressed={compareMode === 'win'}
                  onClick={() => setCompareMode('win')}
                >
                  Win rate
                </button>
              </div>
            </div>

            <div className="tw-ana-desk-pills">
              <button
                type="button"
                className="tw-ana-chip-btn"
                aria-pressed={excludeSwingFromSession}
                onClick={() => setExcludeSwingFromSession((v) => !v)}
              >
                {excludeSwingFromSession
                  ? 'Swing rule: excluded from sessions'
                  : 'Swing rule: counted in sessions'}
              </button>

              <button
                type="button"
                className="tw-ana-chip-btn"
                aria-pressed={compareOpen}
                onClick={() => setCompareOpen((v) => !v)}
              >
                <Columns2 size={14} aria-hidden="true" />
                <span>Compare 2 desks</span>
              </button>

              <button type="button" className="tw-ana-icon-btn" onClick={exportFullLedgerCsv}>
                <Download size={13} aria-hidden="true" />
                <span>Export CSV</span>
              </button>

              <button
                type="button"
                className="tw-ana-icon-btn"
                onClick={() => typeof window !== 'undefined' && window.print()}
              >
                <Printer size={13} aria-hidden="true" />
                <span>Print summary</span>
              </button>
            </div>
          </div>

          {drilldown && (
            <div className="tw-ana-controls-row">
              <div className="tw-ana-desk-pills" role="status">
                <span className="tw-ana-chip-btn on">
                  <Filter size={13} aria-hidden="true" />
                  <span>Active Filter: {drilldown.label}</span>
                  <button
                    type="button"
                    aria-label={`Remove filter ${drilldown.label}`}
                    onClick={() => setDrilldown(undefined)}
                    style={{
                      background: 'transparent',
                      border: 0,
                      color: 'inherit',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    <X size={14} />
                  </button>
                </span>
                <span className="tw-ana-mod-sub">
                  Showing {ledgerTrades.length} matching closed trade(s) in Scoped Trade Ledger below.
                </span>
              </div>
            </div>
          )}
        </section>

        {scopedClosedTrades.length === 0 ? (
          <section className="tw-bento-tile tw-ana-span12" aria-label="Empty analytics state">
            <h2 className="tw-h">No closed trades match the selected scope</h2>
            <p className="tw-ana-mod-sub" style={{ marginTop: 8 }}>
              Select &ldquo;All time&rdquo; or enable additional trading desks above, or record a closed trade in the journal.
            </p>
            <div style={{ marginTop: 14 }}>
              <Link href="/trades" className="tw-ana-chip-btn on">
                Open Trade Log
              </Link>
            </div>
          </section>
        ) : (
          <>
            {/* HERO (7 cols) + RECONCILIATION TABLE (5 cols) */}
            <article className="tw-bento-tile tw-ana-hero-v2 tw-ana-span7" aria-label="Consolidated portfolio performance">
              <div>
                <div className="tw-alab">
                  {selectedAccountIds.length === 1 && visibleDesks[0]
                    ? `${getShortDeskLabelFromAccount(visibleDesks[0])} · Single-desk view`
                    : selectedAccountIds.length > 1
                    ? `${selectedAccountIds.length} Selected desks`
                    : 'All desks consolidated'}{' '}
                  · {dateRangeLabel}
                </div>
                <div className="tw-abig">
                  <CurrencyText amount={headlineMetrics.netPnl} isPnlHidden={isPnlHidden} />
                </div>
                <p>
                  Reported return <span className="num">{formatPercentSigned(headlineMetrics.reportedReturnPct)}</span> on allocated equity. Derived ledger return is{' '}
                  <span className="num">{formatPercentSigned(headlineMetrics.derivedReturnPct)}</span> (
                  <CurrencyText amount={headlineMetrics.netPnl} isPnlHidden={isPnlHidden} signed={false} /> ÷{' '}
                  <CurrencyText amount={headlineMetrics.startCap} isPnlHidden={isPnlHidden} signed={false} />
                  ). See reconciliation.
                </p>
              </div>
              <div className="tw-ana-hero-stats">
                <div>
                  <small>Trades</small>
                  <strong>
                    {headlineMetrics.n} · {headlineMetrics.wins}W / {headlineMetrics.lossCount}L
                  </strong>
                </div>
                <div>
                  <small>Expectancy</small>
                  <strong>{formatRSigned(headlineMetrics.expectancyR)}</strong>
                </div>
                <div>
                  <small>Long / short net</small>
                  <strong>
                    <CurrencyText amount={headlineMetrics.longNet} isPnlHidden={isPnlHidden} /> /{' '}
                    <CurrencyText amount={headlineMetrics.shortNet} isPnlHidden={isPnlHidden} />
                  </strong>
                </div>
              </div>
            </article>

            <article className={`tw-bento-tile tw-ana-recon-v2 tw-ana-span5 ${reconciliation.messages.length === 0 ? 'clean' : ''}`} aria-labelledby="rec-h">
              <div>
                <div className="tw-ana-lab">Data integrity</div>
                <h2 id="rec-h" style={{ margin: '6px 0 10px', fontSize: 18, fontWeight: 600 }}>
                  Reconciliation · {reconciliation.messages.length} open conflict{reconciliation.messages.length === 1 ? '' : 's'}
                </h2>
                <div className="tw-ana-recon-table-wrap">
                  <table className="tw-ana-recon-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th className="n">Stated</th>
                        <th className="n">Derived</th>
                        <th className="n">Gap</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reconciliationRows.map((row, i) => (
                        <tr key={i}>
                          <td>{row.item}</td>
                          <td className={`n ${row.isPnl && isPnlHidden ? 'tw-pnl-blur' : ''}`}>{row.stated}</td>
                          <td className={`n ${row.isPnl && isPnlHidden ? 'tw-pnl-blur' : ''}`}>{row.derived}</td>
                          <td className={`n ${row.isPnl && isPnlHidden ? 'tw-pnl-blur' : ''}`}>{row.gap}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="tw-ana-mod-sub" style={{ marginTop: 8 }}>
                {!hasAquaDeskInState
                  ? 'Aqua_Funded_01 ($5,021.37) is listed under Open Decisions when absent from seed. Resolve open conflicts at source; this page does not pick a winner.'
                  : 'Open ledger vs equity conflicts remain visible transparently without overwriting source records.'}
              </p>
            </article>

            {/* PER-DESK ATTRIBUTION & INLINE TWO-DESK COMPARE */}
            <article className="tw-bento-tile tw-ana-span12" aria-labelledby="desk-h">
              <div className="tw-ana-mod-head">
                <div className="tw-ana-mod-titles">
                  <div className="tw-ana-lab">Per-desk attribution</div>
                  <h2 id="desk-h" className="tw-h" style={{ marginTop: 4 }}>
                    {compareMode === 'net'
                      ? 'Net realized P&L'
                      : compareMode === 'ret'
                      ? 'Growth on start capital (%)'
                      : 'Win rate (%)'}
                  </h2>
                  <p className="tw-ana-mod-sub">
                    Each bar starts at zero. Hatched bars have fewer than 5 trades.
                  </p>
                </div>
                <div className="tw-ana-mod-actions">
                  <SampleStatusPill n={headlineMetrics.n} />
                  <button
                    type="button"
                    className="tw-ana-icon-btn"
                    onClick={() =>
                      downloadCsvFile(
                        'edgeledger-desk-comparison.csv',
                        ['Desk', 'Start Capital', 'Current Equity', 'n', 'Win Rate', 'Profit Factor', 'Ledger Net USD', 'Return %'],
                        visibleDeskStats.map((d) => [
                          d.name,
                          d.startingBalance.toFixed(2),
                          d.currentEquity.toFixed(2),
                          d.n,
                          d.n < 5 ? 'Insufficient sample' : `${d.winRate.toFixed(1)}%`,
                          d.profitFactorDisplay,
                          d.netPnl.toFixed(2),
                          d.returnPct.toFixed(2),
                        ])
                      )
                    }
                  >
                    <span>CSV</span>
                  </button>
                </div>
              </div>

              <div className="tw-ana-rows">
                {visibleDeskStats.map((d, idx) => {
                  const val =
                    compareMode === 'net' ? d.netPnl : compareMode === 'ret' ? d.returnPct : d.winRate;
                  const span = barScaleBounds.max - barScaleBounds.min || 1;
                  const zeroPct = Math.max(0, Math.min(100, ((0 - barScaleBounds.min) / span) * 100));
                  const valPct = Math.max(0, Math.min(100, ((val - barScaleBounds.min) / span) * 100));
                  const leftPct = Math.min(zeroPct, valPct);
                  const widthPct = d.n === 0 ? 0 : Math.max(1.5, Math.abs(valPct - zeroPct));
                  const dotColor = getAccountDotColor(
                    accounts.find((a) => a.id === d.id) || accounts[0],
                    idx
                  );
                  const isNeg = val < 0;
                  const isLow = d.n > 0 && d.n < 5;
                  const winDisplay =
                    d.n === 0 ? '—' : d.n < 5 ? 'Insufficient sample' : `${d.winRate.toFixed(1)}%`;

                  return (
                    <div key={d.id} className="tw-ana-drow">
                      <div className="tw-anm">
                        <span
                          style={{
                            width: 9,
                            height: 9,
                            borderRadius: '50%',
                            background: dotColor,
                            flexShrink: 0,
                          }}
                          aria-hidden="true"
                        />
                        <span>{d.shortLabel}</span>
                        <small>n={d.n}</small>
                      </div>
                      <div className="tw-ana-rail" role="img" aria-label={`${d.shortLabel}: ${d.n} trades`}>
                        <span className="tw-ana-zero" style={{ left: `${zeroPct}%` }} />
                        {d.n > 0 && (
                          <span
                            className={`tw-ana-bar ${isLow ? 'low' : ''}`}
                            style={{
                              left: `${leftPct}%`,
                              width: `${widthPct}%`,
                              backgroundColor: dotColor,
                            }}
                          />
                        )}
                      </div>
                      <div className={`tw-ana-dval ${isNeg ? 'tw-neg' : val > 0 ? 'tw-pos' : ''}`}>
                        {compareMode === 'net' ? (
                          <CurrencyText amount={d.netPnl} isPnlHidden={isPnlHidden} />
                        ) : compareMode === 'ret' ? (
                          formatPercentSigned(d.returnPct)
                        ) : (
                          winDisplay
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="tw-ana-table-wrap">
                <table className="tw-ana-table">
                  <thead>
                    <tr>
                      <th>Desk</th>
                      <th>Start Capital</th>
                      <th>Reported Equity</th>
                      <th>Implied Equity</th>
                      <th>n</th>
                      <th>Win Rate</th>
                      <th>Profit Factor</th>
                      <th>Ledger Net</th>
                      <th>Return</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleDeskStats.map((d) => (
                      <tr key={d.id}>
                        <td>{d.name}</td>
                        <td>
                          <CurrencyText amount={d.startingBalance} isPnlHidden={isPnlHidden} signed={false} />
                        </td>
                        <td>
                          <CurrencyText amount={d.currentEquity} isPnlHidden={isPnlHidden} signed={false} />
                        </td>
                        <td>
                          <CurrencyText amount={d.impliedEquity} isPnlHidden={isPnlHidden} signed={false} />
                        </td>
                        <td>{d.n}</td>
                        <td>{d.n === 0 ? '—' : d.n < 5 ? 'Insufficient sample' : `${d.winRate.toFixed(1)}%`}</td>
                        <td>{d.profitFactorDisplay}</td>
                        <td className={d.netPnl > 0 ? 'tw-pos' : d.netPnl < 0 ? 'tw-neg' : ''}>
                          <CurrencyText amount={d.netPnl} isPnlHidden={isPnlHidden} />
                        </td>
                        <td className={d.returnPct > 0 ? 'tw-pos' : d.returnPct < 0 ? 'tw-neg' : ''}>
                          {formatPercentSigned(d.returnPct)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {compareOpen && accounts.length >= 2 && (
                <div className="tw-ana-cmp-box" aria-label="Compare two desks side by side">
                  <div className="tw-ana-compare-grid">
                    <label>
                      <span className="tw-ana-lab">Desk A</span>
                      <select
                        className="tw-ana-select"
                        value={compareDeskA}
                        onChange={(e) => setCompareDeskA(e.target.value)}
                      >
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="tw-ana-lab">Desk B</span>
                      <select
                        className="tw-ana-select"
                        value={compareDeskB}
                        onChange={(e) => setCompareDeskB(e.target.value)}
                      >
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {deskAStat && deskBStat && (
                    <div className="tw-ana-table-wrap" style={{ marginTop: 8 }}>
                      <table className="tw-ana-table">
                        <thead>
                          <tr>
                            <th>Metric</th>
                            <th>{deskAStat.shortLabel}</th>
                            <th>{deskBStat.shortLabel}</th>
                            <th>Difference (A − B)</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>Start capital</td>
                            <td>
                              <CurrencyText amount={deskAStat.startingBalance} isPnlHidden={isPnlHidden} signed={false} />
                            </td>
                            <td>
                              <CurrencyText amount={deskBStat.startingBalance} isPnlHidden={isPnlHidden} signed={false} />
                            </td>
                            <td>
                              <CurrencyText amount={deskAStat.startingBalance - deskBStat.startingBalance} isPnlHidden={isPnlHidden} />
                            </td>
                          </tr>
                          <tr>
                            <td>Net realized</td>
                            <td>
                              <CurrencyText amount={deskAStat.netPnl} isPnlHidden={isPnlHidden} />
                            </td>
                            <td>
                              <CurrencyText amount={deskBStat.netPnl} isPnlHidden={isPnlHidden} />
                            </td>
                            <td>
                              <CurrencyText amount={deskAStat.netPnl - deskBStat.netPnl} isPnlHidden={isPnlHidden} />
                            </td>
                          </tr>
                          <tr>
                            <td>Growth</td>
                            <td>{formatPercentSigned(deskAStat.returnPct)}</td>
                            <td>{formatPercentSigned(deskBStat.returnPct)}</td>
                            <td>{(deskAStat.returnPct - deskBStat.returnPct).toFixed(2)} pp</td>
                          </tr>
                          <tr>
                            <td>Trades (n)</td>
                            <td>{deskAStat.n}</td>
                            <td>{deskBStat.n}</td>
                            <td>{deskAStat.n - deskBStat.n}</td>
                          </tr>
                          <tr>
                            <td>Win rate</td>
                            <td>{deskAStat.n < 5 ? 'Insufficient sample' : `${deskAStat.winRate.toFixed(1)}%`}</td>
                            <td>{deskBStat.n < 5 ? 'Insufficient sample' : `${deskBStat.winRate.toFixed(1)}%`}</td>
                            <td>
                              {deskAStat.n >= 5 && deskBStat.n >= 5
                                ? `${(deskAStat.winRate - deskBStat.winRate).toFixed(1)} pp`
                                : '—'}
                            </td>
                          </tr>
                          <tr>
                            <td>Profit factor</td>
                            <td>{deskAStat.profitFactorDisplay}</td>
                            <td>{deskBStat.profitFactorDisplay}</td>
                            <td>—</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </article>

            {/* SIX HEADLINE KPI CARDS WITH SAMPLE GUARDS & SHARPE PROGRESS METER */}
            <div className="tw-ana-kpis" aria-label="Headline statistics">
              <article className="tw-bento-tile tw-ana-kpi">
                <div className="tw-ana-lab">Win rate · N={headlineMetrics.n}</div>
                <div className={`tw-kv ${sampleGuard.isInsufficientForRatio ? 'small' : ''}`}>
                  {headlineMetrics.winRateLabel}
                </div>
                <div className="tw-ks">
                  {headlineMetrics.wins}W / {headlineMetrics.lossCount}L ·{' '}
                  {sampleGuard.isInsufficientForRatio ? 'needs 5 trades' : 'verified sample'}
                </div>
              </article>

              <article className="tw-bento-tile tw-ana-kpi">
                <div className="tw-ana-lab">Profit factor · N={headlineMetrics.n}</div>
                <div className={`tw-kv ${sampleGuard.isInsufficientForRatio || headlineMetrics.lossCount === 0 ? 'small' : ''}`}>
                  {headlineMetrics.profitFactorLabel}
                </div>
                <div className="tw-ks">
                  {sampleGuard.isInsufficientForRatio
                    ? 'Needs 5 trades or any losses to compare'
                    : 'Never capped on zero-loss desks'}
                </div>
              </article>

              <article className="tw-bento-tile tw-ana-kpi">
                <div className="tw-ana-lab">Expectancy · N={headlineMetrics.n}</div>
                <div className={`tw-kv ${headlineMetrics.expectancyUsd >= 0 ? 'tw-pos' : 'tw-neg'}`}>
                  <CurrencyText amount={headlineMetrics.expectancyUsd} isPnlHidden={isPnlHidden} />
                </div>
                <div className="tw-ks">{formatRSigned(headlineMetrics.expectancyR)} per trade</div>
              </article>

              <article className="tw-bento-tile tw-ana-kpi">
                <div className="tw-ana-lab">Average win · N={headlineMetrics.winCount}</div>
                <div className="tw-kv tw-pos">
                  <CurrencyText amount={headlineMetrics.avgWinUsd} isPnlHidden={isPnlHidden} />
                </div>
                <div className="tw-ks">{formatRSigned(headlineMetrics.avgWinR)} mean winner</div>
              </article>

              <article className="tw-bento-tile tw-ana-kpi">
                <div className="tw-ana-lab">Average loss · N={headlineMetrics.lossCount}</div>
                <div className="tw-kv tw-neg">
                  <CurrencyText amount={-headlineMetrics.avgLossUsd} isPnlHidden={isPnlHidden} />
                </div>
                <div className="tw-ks">
                  {headlineMetrics.lossCount > 0 ? formatRSigned(-headlineMetrics.avgLossR) : '0 losing trades'}
                </div>
              </article>

              <article className="tw-bento-tile tw-ana-kpi">
                <div className="tw-ana-lab">Sharpe / Sortino</div>
                <div className="tw-kv small">{headlineMetrics.sharpeLabel}</div>
                <div className="tw-ana-meter" aria-label={`${sampleGuard.tradingDaysCount} of 30 daily returns`}>
                  <span style={{ width: `${sharpeMeterPct}%` }} />
                </div>
                <div className="tw-ks">{sampleGuard.tradingDaysCount} of 30 daily returns</div>
              </article>
            </div>

            {/* SESSION & WEEKDAY ATTRIBUTION BARS */}
            <article className="tw-bento-tile tw-ana-span6" aria-labelledby="sess-h">
              <div className="tw-ana-mod-head">
                <div className="tw-ana-mod-titles">
                  <div className="tw-ana-lab">Attribution</div>
                  <h2 id="sess-h" className="tw-h" style={{ marginTop: 4 }}>
                    Net P&amp;L by session
                  </h2>
                </div>
                <span className="tw-ana-unit-tag">USD · click to filter</span>
              </div>

              <div className="tw-ana-cols-v2">
                {sessionColumns.map((col) => {
                  const isActive = drilldown?.type === 'session' && drilldown.value === col.name;
                  return (
                    <button
                      key={col.name}
                      type="button"
                      className="tw-ana-col-v2"
                      onClick={() =>
                        col.count > 0 &&
                        setDrilldown(
                          isActive
                            ? undefined
                            : { type: 'session', value: col.name, label: `Session: ${col.name}` }
                        )
                      }
                      style={{
                        border: isActive ? '1px solid var(--tw-focus)' : '1px solid transparent',
                        cursor: col.count > 0 ? 'pointer' : 'default',
                      }}
                    >
                      {col.count === 0 ? (
                        <span className="tw-none-v2">No trades</span>
                      ) : (
                        <span className="tw-cv-v2">
                          <CurrencyText amount={col.total} isPnlHidden={isPnlHidden} />
                        </span>
                      )}
                      <div
                        className="tw-cb-v2"
                        style={{
                          height: `${col.heightPx}px`,
                          background: col.count === 0 ? 'transparent' : col.total < 0 ? 'var(--tw-loss)' : 'var(--tw-s1)',
                          borderBottom: col.count === 0 ? '2px dashed var(--tw-line-strong)' : undefined,
                        }}
                      />
                      <span className="tw-cc-v2">
                        {col.name}
                        <br />
                        <span className="num">n={col.count}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <p className="tw-ana-mod-sub" style={{ marginTop: 12 }}>
                {excludeSwingFromSession
                  ? `Swing rule on: ${edgeHeatmap.excludedSwingTrades.length} swing trade(s) excluded from session attribution.`
                  : 'Swing rule off: swing trades are counted under their recorded session.'}
              </p>
            </article>

            <article className="tw-bento-tile tw-ana-span6" aria-labelledby="wd-h">
              <div className="tw-ana-mod-head">
                <div className="tw-ana-mod-titles">
                  <div className="tw-ana-lab">Calendar</div>
                  <h2 id="wd-h" className="tw-h" style={{ marginTop: 4 }}>
                    Net P&amp;L by weekday
                  </h2>
                </div>
                <span className="tw-ana-unit-tag">Computed from ledger timestamps</span>
              </div>

              <div className="tw-ana-cols-v2">
                {weekdayColumns.map((col) => {
                  const isActive = drilldown?.type === 'weekday' && drilldown.value === col.name;
                  return (
                    <button
                      key={col.name}
                      type="button"
                      className="tw-ana-col-v2"
                      onClick={() =>
                        col.count > 0 &&
                        setDrilldown(
                          isActive
                            ? undefined
                            : { type: 'weekday', value: col.name, label: `Weekday: ${col.name}` }
                        )
                      }
                      style={{
                        border: isActive ? '1px solid var(--tw-focus)' : '1px solid transparent',
                        cursor: col.count > 0 ? 'pointer' : 'default',
                      }}
                    >
                      {col.count === 0 ? (
                        <span className="tw-none-v2">No trades</span>
                      ) : (
                        <span className="tw-cv-v2">
                          <CurrencyText amount={col.total} isPnlHidden={isPnlHidden} />
                        </span>
                      )}
                      <div
                        className="tw-cb-v2"
                        style={{
                          height: `${col.heightPx}px`,
                          background: col.count === 0 ? 'transparent' : col.total < 0 ? 'var(--tw-loss)' : 'var(--tw-s3)',
                          borderBottom: col.count === 0 ? '2px dashed var(--tw-line-strong)' : undefined,
                        }}
                      />
                      <span className="tw-cc-v2">
                        {col.name}
                        <br />
                        <span className="num">n={col.count}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <p className="tw-ana-mod-sub" style={{ marginTop: 12 }}>
                Click any weekday bar above to cross-filter the Scoped Trade Ledger below.
              </p>
            </article>

            {/* MODULES 1-7 */}
            <EquityDrawdownModule
              combined={equityDrawdown.combined}
              perDesk={equityDrawdown.perDesk}
              curveMode={curveMode}
              onChangeCurveMode={setCurveMode}
              isPnlHidden={isPnlHidden}
              dateRangeLabel={dateRangeLabel}
            />

            <FirmRuleMonitorModule
              monitors={firmRuleMonitors}
              onUpdateConfig={updateDeskRuleOverride}
              onResetConfig={resetDeskRuleOverride}
            />

            <RDistributionModule
              bins={rDist.bins}
              meanR={rDist.meanR}
              medianR={rDist.medianR}
              expectancyUsd={rDist.expectancyUsd}
              n={rDist.n}
              isPnlHidden={isPnlHidden}
              activeDrilldown={drilldown}
              onSelectDrilldown={setDrilldown}
              dateRangeLabel={dateRangeLabel}
            />

            <EdgeHeatmapModule
              weekdays={edgeHeatmap.weekdays}
              sessions={edgeHeatmap.sessions}
              cells={edgeHeatmap.cells}
              excludedSwingCount={edgeHeatmap.excludedSwingTrades.length}
              excludeSwingFromSession={excludeSwingFromSession}
              onToggleExcludeSwing={setExcludeSwingFromSession}
              isPnlHidden={isPnlHidden}
              activeDrilldown={drilldown}
              onSelectDrilldown={setDrilldown}
              dateRangeLabel={dateRangeLabel}
            />

            <StrategyAttributionModule
              rows={strategyAttribution}
              totalN={headlineMetrics.n}
              isPnlHidden={isPnlHidden}
              activeDrilldown={drilldown}
              onSelectDrilldown={setDrilldown}
            />

            <StreaksClusterModule stats={streaksCluster} n={headlineMetrics.n} />

            <DirectionSymbolBreakdownModule
              directionRows={directionBreakdown}
              symbolRows={symbolBreakdown}
              n={headlineMetrics.n}
              isPnlHidden={isPnlHidden}
              activeDrilldown={drilldown}
              onSelectDrilldown={setDrilldown}
            />

            {/* INTERACTIVE DRILL-DOWN TRADE LEDGER */}
            <section className="tw-bento-tile tw-ana-span12" aria-label="Filtered trade ledger">
              <div className="tw-ana-mod-head">
                <div className="tw-ana-mod-titles">
                  <div className="tw-ana-mod-toprow">
                    <h2 className="tw-h">Scoped Trade Ledger</h2>
                    <span className="tw-ana-n-chip">{ledgerTrades.length} trade(s)</span>
                    {drilldown && (
                      <button
                        type="button"
                        className="tw-ana-chip-btn on"
                        onClick={() => setDrilldown(undefined)}
                      >
                        <span>Filter: {drilldown.label}</span>
                        <X size={13} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <p className="tw-ana-mod-sub">
                    Interactive drill-down list synchronized with all filters and clicked chart elements above.
                  </p>
                </div>
                <div className="tw-ana-mod-actions">
                  <button type="button" className="tw-ana-icon-btn" onClick={exportFullLedgerCsv}>
                    <Download size={13} aria-hidden="true" />
                    <span>CSV</span>
                  </button>
                </div>
              </div>

              <div className="tw-ana-table-wrap">
                <table className="tw-ana-table">
                  <thead>
                    <tr>
                      <th>Trade</th>
                      <th>Date</th>
                      <th>Weekday</th>
                      <th>Session</th>
                      <th>Symbol</th>
                      <th>Dir</th>
                      <th>Strategy</th>
                      <th>R</th>
                      <th>Scoped Net P&amp;L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerTrades.map((t) => {
                      const pnl = getScopedTradePnl(t, selectedAccountIds, accounts.length);
                      const rVal = Number.isFinite(t.realizedR) ? t.realizedR : 0;
                      return (
                        <tr key={t.id}>
                          <td>{t.id}</td>
                          <td>{getTradeDateKey(t)}</td>
                          <td>{getTradeWeekdayLabel(t)}</td>
                          <td>{isSwingTrade(t) ? `${t.session || '—'} (Swing)` : t.session || '—'}</td>
                          <td>{t.instrumentSymbol}</td>
                          <td>{t.direction}</td>
                          <td>{t.strategyName || t.strategyId || '—'}</td>
                          <td>{formatRSigned(rVal)}</td>
                          <td className={pnl >= 0 ? 'tw-pos' : 'tw-neg'}>
                            <CurrencyText amount={pnl} isPnlHidden={isPnlHidden} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* MODULE 8 & OPEN DECISIONS */}
            <section className="tw-bento-tile tw-ana-span6" aria-label="Trade quality needs fields and open decisions">
              <div className="tw-ana-lab">8 · Trade quality gate</div>
              <h2 className="tw-h" style={{ marginTop: 4 }}>
                Needs Fields &amp; Open Decisions
              </h2>
              <div className="tw-ana-recon" style={{ marginTop: 12 }}>
                <h3>Needs Fields — Module 8 Hidden</h3>
                <ul>
                  <li>
                    MAE, MFE, and Capture Ratio cannot be computed because closed trades lack required excursion fields:{' '}
                    <code>{tradeQuality.missingFields.join(', ')}</code>.
                  </li>
                </ul>
              </div>
              <div className="tw-ana-recon" style={{ marginTop: 12 }}>
                <h3>Open Decisions Log</h3>
                <ul>
                  {!hasAquaDeskInState && (
                    <li>
                      <strong>Aqua_Funded_01 (equity $5,021.37):</strong> Included dynamically when present in live account context; absent from default 3-desk seed (<code>SEED_ACCOUNTS</code>).
                    </li>
                  )}
                  <li>
                    <strong>$60.00 Consolidation Gap:</strong> Consolidated net differs from per-desk allocation sum until reconciled at source.
                  </li>
                  <li>
                    <strong>Swing Session Attribution Rule:</strong> Default ON excludes swing setups (<code>HTF Orderflow</code>) from intraday sessions; toggleable in top controls.
                  </li>
                </ul>
              </div>
            </section>

            <section className="tw-bento-tile tw-ana-span6" aria-label="Metric definitions reference">
              <div className="tw-ana-lab">Documentation</div>
              <h2 className="tw-h" style={{ marginTop: 4 }}>
                Metric Definitions &amp; Sample Rules
              </h2>
              <p className="tw-ana-mod-sub" style={{ marginTop: 4 }}>
                Shared source of truth synced with <code>docs/analytics-metrics.md</code>
              </p>
              <div className="tw-ana-table-wrap">
                <table className="tw-ana-table">
                  <thead>
                    <tr>
                      <th>Metric</th>
                      <th>Formula</th>
                      <th>Unit</th>
                      <th>Sample Rule</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ANALYTICS_METRIC_DEFINITIONS.slice(0, 7).map((def) => (
                      <tr key={def.id}>
                        <td>{def.name}</td>
                        <td style={{ whiteSpace: 'normal', maxWidth: 220 }}>{def.formula}</td>
                        <td>{def.unit}</td>
                        <td style={{ whiteSpace: 'normal', maxWidth: 180 }}>{def.sampleRule}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <footer className="tw-ana-foot-note">
              Figures come from one ledger dataset. Ratios are hidden under 5 trades and confidence claims are withheld under 30. Open conflicts are listed above and are not resolved by this page.
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

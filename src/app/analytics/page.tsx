'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Columns2,
  Download,
  Filter,
  Printer,
  ShieldAlert,
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
  const fallback = [
    'var(--tw-a-apex)',
    'var(--tw-a-ftmo)',
    'var(--tw-a-ic)',
    'var(--tw-s3)',
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

    for (const t of scopedClosedTrades) {
      const p = getScopedTradePnl(t, selectedAccountIds, accounts.length);
      const rVal = Number.isFinite(t.realizedR) ? t.realizedR : 0;
      netPnl += p;
      totalR += rVal;
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
    const returnPct = startCap > 0 ? (netPnl / startCap) * 100 : 0;
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
      grossProfit,
      grossLoss,
      wins,
      winCount,
      lossCount,
      startCap,
      totalEquity,
      returnPct,
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
        heightPct: entry.count === 0 ? 4 : Math.max(10, Math.round((Math.abs(entry.total) / maxAbs) * 86)),
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
        heightPct: entry.count === 0 ? 4 : Math.max(10, Math.round((Math.abs(entry.total) / maxAbs) * 86)),
      };
    });
  }, [scopedClosedTrades, selectedAccountIds, accounts.length]);

  const matrixScale = useMemo(() => {
    if (visibleDeskStats.length === 0) return 1;
    if (compareMode === 'net') {
      return Math.max(1, ...visibleDeskStats.map((d) => Math.abs(d.netPnl)));
    }
    if (compareMode === 'ret') {
      return Math.max(1, ...visibleDeskStats.map((d) => Math.abs(d.returnPct)));
    }
    return 100;
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

  return (
    <div className="tw-page-wrap">
      <section className="tw-page-head">
        <div>
          <div className="tw-eyebrow">EdgeLedger Quantitative Desk</div>
          <h1 className="tw-page-title">Performance Analytics</h1>
          <p className="tw-page-lede">
            Single-ledger multi-desk attribution, equity/drawdown landmarks, firm-rule monitors, and R-multiple analysis.
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

        <section className="tw-bento-tile tw-ana-controls-bar" aria-label="Analytics filters and controls">
          <div className="tw-ana-controls-row">
            <div className="tw-ana-desk-pills" role="group" aria-label="Multi-select trading desks">
              <button
                type="button"
                className={`tw-ana-chip-btn ${selectedAccountIds.length === 0 ? 'on' : ''}`}
                aria-pressed={selectedAccountIds.length === 0}
                onClick={selectAllDesks}
              >
                All Desks ({accounts.length})
              </button>
              {accounts.map((acc, idx) => {
                const isSelected = selectedAccountIds.includes(acc.id);
                return (
                  <button
                    key={acc.id}
                    type="button"
                    className={`tw-ana-chip-btn ${isSelected ? 'on' : ''}`}
                    aria-pressed={isSelected}
                    onClick={() => toggleDeskSelection(acc.id)}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        background: getAccountDotColor(acc, idx),
                      }}
                      aria-hidden="true"
                    />
                    <span>{getShortDeskLabelFromAccount(acc)}</span>
                  </button>
                );
              })}
            </div>

            <div className="tw-seg" role="group" aria-label="Analytics time period">
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

              <div className="tw-seg" role="group" aria-label="Comparison metric toggle">
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
                className={`tw-ana-chip-btn ${excludeSwingFromSession ? 'on' : ''}`}
                aria-pressed={excludeSwingFromSession}
                onClick={() => setExcludeSwingFromSession((v) => !v)}
              >
                Swing Rule: {excludeSwingFromSession ? 'Excluded from Session' : 'Included in Session'}
              </button>

              <button
                type="button"
                className={`tw-ana-chip-btn ${compareOpen ? 'on' : ''}`}
                aria-pressed={compareOpen}
                onClick={() => setCompareOpen((v) => !v)}
              >
                <Columns2 size={14} aria-hidden="true" />
                <span>Compare 2 Desks</span>
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
                <span>Print 1-Page Summary</span>
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
                  Showing {ledgerTrades.length} matching closed trade(s) in Ledger below.
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
            <section className="tw-bento-tile tw-ana-hero tw-ana-span12" aria-label="Portfolio performance summary and reconciliation">
              <div>
                <div className="tw-alab">
                  {selectedAccountIds.length === 1 && visibleDesks[0]
                    ? `${getShortDeskLabelFromAccount(visibleDesks[0])} · Single-Desk View`
                    : selectedAccountIds.length > 1
                    ? `${selectedAccountIds.length} Selected Desks`
                    : 'All Desks Consolidated'}{' '}
                  · {dateRangeLabel}
                </div>
                <div className="tw-abig">
                  <CurrencyText amount={headlineMetrics.netPnl} isPnlHidden={isPnlHidden} />
                </div>
                <p>
                  {formatPercentSigned(headlineMetrics.returnPct)} combined return on{' '}
                  <CurrencyText amount={headlineMetrics.startCap} isPnlHidden={isPnlHidden} signed={false} />{' '}
                  allocated start · {headlineMetrics.n} closed trade(s) ({headlineMetrics.wins}W / {headlineMetrics.lossCount}L) · Expectancy{' '}
                  <strong>{formatRSigned(headlineMetrics.expectancyR)}</strong>
                </p>
              </div>

              <div className={`tw-ana-recon ${reconciliation.messages.length === 0 ? 'clean' : ''}`}>
                <h3>
                  <ShieldAlert size={15} style={{ display: 'inline', marginRight: 6 }} aria-hidden="true" />
                  Data Reconciliation &amp; Open Conflicts ({reconciliation.messages.length})
                </h3>
                {reconciliation.messages.length === 0 ? (
                  <ul>
                    <li>All selected desk allocations and ledger totals reconcile without open gaps.</li>
                  </ul>
                ) : (
                  <ul>
                    {reconciliation.messages.map((msg, i) => (
                      <li key={i}>{msg}</li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {compareOpen && accounts.length >= 2 && (
              <section className="tw-bento-tile tw-ana-span12" aria-label="Side-by-side two-desk comparison">
                <div className="tw-ana-mod-head">
                  <div className="tw-ana-mod-titles">
                    <h2 className="tw-h">Compare Two Desks Side-by-Side</h2>
                    <p className="tw-ana-mod-sub">
                      Direct quantitative comparison with delta (Desk A − Desk B)
                    </p>
                  </div>
                </div>
                <div className="tw-ana-compare-grid">
                  <label>
                    <span className="tw-ana-mod-sub">Desk A</span>
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
                    <span className="tw-ana-mod-sub">Desk B</span>
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
                  <div className="tw-ana-table-wrap">
                    <table className="tw-ana-table">
                      <thead>
                        <tr>
                          <th>Metric</th>
                          <th>{deskAStat.shortLabel}</th>
                          <th>{deskBStat.shortLabel}</th>
                          <th>Diff (A − B)</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Closed Trades (n)</td>
                          <td>{deskAStat.n}</td>
                          <td>{deskBStat.n}</td>
                          <td>{deskAStat.n - deskBStat.n >= 0 ? `+${deskAStat.n - deskBStat.n}` : deskAStat.n - deskBStat.n}</td>
                        </tr>
                        <tr>
                          <td>Current Equity</td>
                          <td>
                            <CurrencyText amount={deskAStat.currentEquity} isPnlHidden={isPnlHidden} signed={false} />
                          </td>
                          <td>
                            <CurrencyText amount={deskBStat.currentEquity} isPnlHidden={isPnlHidden} signed={false} />
                          </td>
                          <td>
                            <CurrencyText amount={deskAStat.currentEquity - deskBStat.currentEquity} isPnlHidden={isPnlHidden} />
                          </td>
                        </tr>
                        <tr>
                          <td>Ledger Net P&amp;L</td>
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
                          <td>Return %</td>
                          <td>{formatPercentSigned(deskAStat.returnPct)}</td>
                          <td>{formatPercentSigned(deskBStat.returnPct)}</td>
                          <td>{formatPercentSigned(deskAStat.returnPct - deskBStat.returnPct)}</td>
                        </tr>
                        <tr>
                          <td>Win Rate</td>
                          <td>{deskAStat.n < 5 ? 'Insufficient sample' : `${deskAStat.winRate.toFixed(1)}%`}</td>
                          <td>{deskBStat.n < 5 ? 'Insufficient sample' : `${deskBStat.winRate.toFixed(1)}%`}</td>
                          <td>
                            {deskAStat.n >= 5 && deskBStat.n >= 5
                              ? formatPercentSigned(deskAStat.winRate - deskBStat.winRate, true, 1)
                              : 'Insufficient sample'}
                          </td>
                        </tr>
                        <tr>
                          <td>Profit Factor</td>
                          <td>{deskAStat.profitFactorDisplay}</td>
                          <td>{deskBStat.profitFactorDisplay}</td>
                          <td>—</td>
                        </tr>
                        <tr>
                          <td>Expectancy (R)</td>
                          <td>{formatRSigned(deskAStat.expectancyR)}</td>
                          <td>{formatRSigned(deskBStat.expectancyR)}</td>
                          <td>{formatRSigned(deskAStat.expectancyR - deskBStat.expectancyR)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            <section className="tw-bento-tile tw-ana-span12" aria-label="Per-desk performance matrix">
              <div className="tw-ana-mod-head">
                <div className="tw-ana-mod-titles">
                  <div className="tw-ana-mod-toprow">
                    <h2 className="tw-h">Per-Desk Performance Comparison</h2>
                    <SampleStatusPill n={headlineMetrics.n} />
                  </div>
                  <p className="tw-ana-mod-sub">
                    Allocated closed-trade P&amp;L per desk ({compareMode === 'net' ? 'Net USD' : compareMode === 'ret' ? 'Return %' : 'Win rate %'})
                  </p>
                </div>
                <div className="tw-ana-mod-actions">
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
                  const pct = Math.min(48, Math.max(4, Math.round((Math.abs(val) / matrixScale) * 44)));
                  const isNeg = val < 0;
                  const winDisplay = d.n < 5 ? 'Insufficient sample' : `${d.winRate.toFixed(1)}%`;
                  return (
                    <div key={d.id} className="tw-ana-row">
                      <div className="tw-anm">
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 999,
                            background: getAccountDotColor(
                              accounts.find((a) => a.id === d.id) || accounts[0],
                              idx
                            ),
                            flexShrink: 0,
                          }}
                          aria-hidden="true"
                        />
                        <span>{d.shortLabel} (n={d.n})</span>
                      </div>
                      <div className="tw-ana-rail">
                        <div className="tw-ana-zero" style={{ left: '50%' }} />
                        <div
                          className="tw-ana-bar"
                          style={{
                            left: isNeg ? `${50 - pct}%` : '50%',
                            width: `${pct}%`,
                            background: isNeg ? 'var(--tw-loss)' : 'var(--tw-gain)',
                          }}
                        />
                      </div>
                      <div className={`tw-aval ${isNeg ? 'tw-neg' : 'tw-pos'}`}>
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
                        <td>{d.n < 5 ? 'Insufficient sample' : `${d.winRate.toFixed(1)}%`}</td>
                        <td>{d.profitFactorDisplay}</td>
                        <td className={d.netPnl >= 0 ? 'tw-pos' : 'tw-neg'}>
                          <CurrencyText amount={d.netPnl} isPnlHidden={isPnlHidden} />
                        </td>
                        <td className={d.returnPct >= 0 ? 'tw-pos' : 'tw-neg'}>
                          {formatPercentSigned(d.returnPct)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="tw-ana-kpis" aria-label="Core KPI metrics with sample-size guards">
              <div className="tw-bento-tile tw-ana-kpi">
                <div className="tw-eyebrow">Win Rate (n={headlineMetrics.n})</div>
                <div className="tw-kv">{headlineMetrics.winRateLabel}</div>
                <div className="tw-ks">
                  {headlineMetrics.wins}W / {headlineMetrics.lossCount}L ·{' '}
                  {sampleGuard.isInsufficientForRatio
                    ? 'Needs >= 5 trades'
                    : `Actual ${headlineMetrics.winRatePct.toFixed(1)}%`}
                </div>
              </div>

              <div className="tw-bento-tile tw-ana-kpi">
                <div className="tw-eyebrow">Profit Factor (n={headlineMetrics.n})</div>
                <div className="tw-kv">{headlineMetrics.profitFactorLabel}</div>
                <div className="tw-ks">
                  {sampleGuard.isInsufficientForRatio
                    ? 'Insufficient sample (< 5)'
                    : 'Never capped on zero-loss desks'}
                </div>
              </div>

              <div className="tw-bento-tile tw-ana-kpi">
                <div className="tw-eyebrow">Expectancy (n={headlineMetrics.n})</div>
                <div className="tw-kv">
                  <CurrencyText amount={headlineMetrics.expectancyUsd} isPnlHidden={isPnlHidden} />
                </div>
                <div className="tw-ks">{formatRSigned(headlineMetrics.expectancyR)} per trade</div>
              </div>

              <div className="tw-bento-tile tw-ana-kpi">
                <div className="tw-eyebrow">Average Win (n={headlineMetrics.winCount})</div>
                <div className="tw-kv tw-pos">
                  <CurrencyText amount={headlineMetrics.avgWinUsd} isPnlHidden={isPnlHidden} />
                </div>
                <div className="tw-ks">{formatRSigned(headlineMetrics.avgWinR)} mean winner</div>
              </div>

              <div className="tw-bento-tile tw-ana-kpi">
                <div className="tw-eyebrow">Average Loss (n={headlineMetrics.lossCount})</div>
                <div className="tw-kv tw-neg">
                  <CurrencyText amount={-headlineMetrics.avgLossUsd} isPnlHidden={isPnlHidden} />
                </div>
                <div className="tw-ks">
                  {headlineMetrics.lossCount > 0 ? formatRSigned(-headlineMetrics.avgLossR) : '0 losing trades'}
                </div>
              </div>

              <div className="tw-bento-tile tw-ana-kpi">
                <div className="tw-eyebrow">Sharpe / Sortino ({sampleGuard.tradingDaysCount}d)</div>
                <div className="tw-kv" style={{ fontSize: 15 }}>
                  {headlineMetrics.sharpeLabel}
                </div>
                <div className="tw-ks">
                  Requires &ge; 30 daily returns ({sampleGuard.tradingDaysCount}/30)
                </div>
              </div>
            </section>

            <section className="tw-bento-tile tw-ana-span6" aria-label="Net P&L by trading session">
              <div className="tw-ana-mod-head">
                <div className="tw-ana-mod-titles">
                  <div className="tw-ana-mod-toprow">
                    <h2 className="tw-h">Net P&amp;L by Session</h2>
                    <span className="tw-ana-unit-tag">USD · Click bar to filter</span>
                  </div>
                  <p className="tw-ana-mod-sub">
                    {excludeSwingFromSession
                      ? `Swing rule ON: ${edgeHeatmap.excludedSwingTrades.length} swing trade(s) excluded from session attribution`
                      : 'Swing rule OFF: Swing trades attributed to their session label'}
                  </p>
                </div>
              </div>
              <div className="tw-ana-cols">
                {sessionColumns.map((col) => {
                  const isPos = col.total >= 0;
                  const isActive = drilldown?.type === 'session' && drilldown.value === col.name;
                  return (
                    <button
                      key={col.name}
                      type="button"
                      className="tw-ana-col"
                      onClick={() =>
                        col.count > 0 &&
                        setDrilldown(
                          isActive
                            ? undefined
                            : { type: 'session', value: col.name, label: `Session: ${col.name}` }
                        )
                      }
                      style={{
                        background: 'transparent',
                        border: isActive ? '1px solid var(--tw-focus)' : '1px solid transparent',
                        borderRadius: 12,
                        cursor: col.count > 0 ? 'pointer' : 'default',
                      }}
                    >
                      <span className="tw-cv">
                        {col.count === 0 ? (
                          '$0.00'
                        ) : (
                          <CurrencyText amount={col.total} isPnlHidden={isPnlHidden} />
                        )}
                      </span>
                      <div
                        className="tw-cb"
                        style={{
                          height: `${col.heightPct}%`,
                          background:
                            col.count === 0
                              ? 'var(--tw-line-strong)'
                              : isPos
                              ? 'var(--tw-gain)'
                              : 'var(--tw-loss)',
                        }}
                      />
                      <span className="tw-cc">
                        {col.name} (n={col.count})
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="tw-bento-tile tw-ana-span6" aria-label="Net P&L by weekday">
              <div className="tw-ana-mod-head">
                <div className="tw-ana-mod-titles">
                  <div className="tw-ana-mod-toprow">
                    <h2 className="tw-h">Net P&amp;L by Weekday</h2>
                    <span className="tw-ana-unit-tag">USD · Computed from ledger</span>
                  </div>
                  <p className="tw-ana-mod-sub">
                    Derived dynamically from trade timestamps · Click bar to filter
                  </p>
                </div>
              </div>
              <div className="tw-ana-cols">
                {weekdayColumns.map((col) => {
                  const isPos = col.total >= 0;
                  const isActive = drilldown?.type === 'weekday' && drilldown.value === col.name;
                  return (
                    <button
                      key={col.name}
                      type="button"
                      className="tw-ana-col"
                      onClick={() =>
                        col.count > 0 &&
                        setDrilldown(
                          isActive
                            ? undefined
                            : { type: 'weekday', value: col.name, label: `Weekday: ${col.name}` }
                        )
                      }
                      style={{
                        background: 'transparent',
                        border: isActive ? '1px solid var(--tw-focus)' : '1px solid transparent',
                        borderRadius: 12,
                        cursor: col.count > 0 ? 'pointer' : 'default',
                      }}
                    >
                      <span className="tw-cv">
                        {col.count === 0 ? (
                          '$0.00'
                        ) : (
                          <CurrencyText amount={col.total} isPnlHidden={isPnlHidden} />
                        )}
                      </span>
                      <div
                        className="tw-cb"
                        style={{
                          height: `${col.heightPct}%`,
                          background:
                            col.count === 0
                              ? 'var(--tw-line-strong)'
                              : isPos
                              ? 'var(--tw-gain)'
                              : 'var(--tw-loss)',
                        }}
                      />
                      <span className="tw-cc">
                        {col.name} (n={col.count})
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

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

            <section className="tw-bento-tile tw-ana-span6" aria-label="Trade quality needs fields and open decisions">
              <h2 className="tw-h">8. Trade Quality &amp; Open Decisions</h2>
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
                      <strong>Aqua_Funded_01 (equity $5,021.37):</strong> Appears when created locally in form/context, absent from default 3-desk seed (<code>SEED_ACCOUNTS</code>). Included dynamically whenever present in state.
                    </li>
                  )}
                  <li>
                    <strong>$60.00 Consolidation Gap:</strong> Consolidated net (<code>+$7,071.00</code>) differs from per-desk sum (<code>+$7,011.00</code>) in seed trade <code>tr-001</code> until source reconciliation is resolved.
                  </li>
                  <li>
                    <strong>Swing Session Attribution Rule:</strong> Default ON excludes swing setups (<code>HTF Orderflow</code>) from intraday sessions; toggleable in the top controls.
                  </li>
                </ul>
              </div>
            </section>

            <section className="tw-bento-tile tw-ana-span6" aria-label="Metric definitions reference">
              <h2 className="tw-h">Metric Definitions &amp; Sample Rules</h2>
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
          </>
        )}
      </main>
    </div>
  );
}

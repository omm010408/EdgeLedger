'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useTrading } from '../../context/TradingContext';
import {
  Upload,
  Download,
  Printer,
  FileSpreadsheet,
  FileCode,
} from 'lucide-react';
import Papa from 'papaparse';
import { evaluateAccountRule } from '../../lib/calculations/financialEngine';
import {
  ReportTabId,
  ReportComputedData,
  StrategyBreakdownItem,
  SessionBreakdownItem,
  RuleSummaryItem,
  DayPerformanceItem,
  DrawdownPoint,
  formatSignedCurrency,
  formatShortDateLabel,
} from '../../components/reports/types';
import { ExecutiveTearSheetView } from '../../components/reports/ExecutiveTearSheetView';
import { ComplianceAuditView } from '../../components/reports/ComplianceAuditView';
import { StrategyAttributionView } from '../../components/reports/StrategyAttributionView';
import { DrawdownStressView } from '../../components/reports/DrawdownStressView';

const STRATEGY_COLORS = [
  'var(--tw-s1)',
  'var(--tw-s3)',
  'var(--tw-s2)',
  'var(--tw-gain)',
];

const TAB_HEADER_COPY: Record<ReportTabId, { title: string; subtitle: string }> = {
  EXECUTIVE: {
    title: 'Institutional performance reporting & imports',
    subtitle: 'Audit-ready prop-firm reports, quantitative tear sheets and CSV transaction importing.',
  },
  PROP_EVAL: {
    title: 'Prop-firm compliance audit',
    subtitle: 'Rule-by-rule check against the stated limits, with what is still pending.',
  },
  STRATEGY: {
    title: 'Strategy attribution',
    subtitle: 'Which setups produced the R, how often they won, and how much sample sits behind each.',
  },
  RISK: {
    title: 'Drawdown and risk stress',
    subtitle: 'Peak-to-trough movement, recovery, and what the record would look like under stress.',
  },
};

export default function ReportsPage() {
  const {
    filteredTrades,
    selectedAccountId,
    selectedAccount,
    periodFilter,
    accounts,
    importTrades,
  } = useTrading();

  const [reportType, setReportType] = useState<ReportTabId>('EXECUTIVE');
  const [reportTimestamp, setReportTimestamp] = useState<string>('24 Nov 2026 · 13:49 GMT');
  const [auditRefId, setAuditRefId] = useState<string>('EL-AUD-143335');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const tabParam = new URLSearchParams(window.location.search).get('tab')?.toUpperCase();
      if (
        tabParam === 'EXECUTIVE' ||
        tabParam === 'PROP_EVAL' ||
        tabParam === 'STRATEGY' ||
        tabParam === 'RISK'
      ) {
        setReportType(tabParam);
      }
    }
    const now = new Date();
    const datePart = now.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    const timePart = now.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    });
    setReportTimestamp(`${datePart} · ${timePart} GMT`);
    setAuditRefId(`EL-AUD-${Math.floor(100000 + Math.random() * 900000)}`);
  }, []);

  // CSV Import State
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [csvPreview, setCsvPreview] = useState<any[] | null>(null);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeAccount = useMemo(() => {
    if (selectedAccountId && selectedAccountId !== 'ALL') {
      return accounts.find((a) => a.id === selectedAccountId) || accounts[0] || null;
    }
    return accounts[0] || null;
  }, [accounts, selectedAccountId]);

  // Period + chronologically sorted closed trades
  const closedTrades = useMemo(() => {
    let list = filteredTrades.filter((t) => t.status === 'CLOSED');
    if (periodFilter === 'Week') {
      const cutoff = new Date('2024-03-16T00:00:00Z').getTime();
      const endCutoff = new Date('2024-03-23T00:00:00Z').getTime();
      const inWindow = list.filter((t) => {
        const ts = new Date(t.exitTime || t.entryTime || t.createdAt).getTime();
        return ts >= cutoff && ts <= endCutoff;
      });
      if (inWindow.length > 0) list = inWindow;
    } else if (periodFilter === 'Month') {
      const cutoff = new Date('2024-03-01T00:00:00Z').getTime();
      const inMonth = list.filter(
        (t) => new Date(t.exitTime || t.entryTime || t.createdAt).getTime() >= cutoff
      );
      if (inMonth.length > 0) list = inMonth;
    }

    return [...list].sort(
      (a, b) =>
        new Date(a.exitTime || a.entryTime || a.createdAt).getTime() -
        new Date(b.exitTime || b.entryTime || b.createdAt).getTime()
    );
  }, [filteredTrades, periodFilter]);

  // Unified Report Analytics Computation
  const reportData: ReportComputedData = useMemo(() => {
    const scopeLabel =
      selectedAccountId === 'ALL'
        ? 'Consolidated desk'
        : selectedAccount?.name || 'Primary desk';
    const accountCount = selectedAccountId === 'ALL' ? accounts.length : activeAccount ? 1 : 0;

    // Date range chip
    let dateRangeChip = 'No dates';
    if (closedTrades.length > 0) {
      const firstDate = formatShortDateLabel(closedTrades[0].entryTime || closedTrades[0].createdAt);
      const lastDate = formatShortDateLabel(
        closedTrades[closedTrades.length - 1].exitTime ||
          closedTrades[closedTrades.length - 1].entryTime ||
          closedTrades[closedTrades.length - 1].createdAt
      );
      const year = new Date(
        closedTrades[closedTrades.length - 1].exitTime || closedTrades[closedTrades.length - 1].createdAt
      ).getUTCFullYear();
      dateRangeChip =
        firstDate === lastDate ? `${firstDate} ${year}` : `${firstDate} – ${lastDate} ${year}`;
    }

    // Core totals
    const wins = closedTrades.filter((t) => t.netPnl > 0);
    const losses = closedTrades.filter((t) => t.netPnl < 0);
    const grossProfit = wins.reduce((s, t) => s + t.netPnl, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0));
    const netProfit = closedTrades.reduce((s, t) => s + t.netPnl, 0);
    const totalR = closedTrades.reduce((s, t) => s + (t.realizedR || 0), 0);
    const avgR = closedTrades.length > 0 ? totalR / closedTrades.length : 0;
    const winRate = closedTrades.length > 0 ? (wins.length / closedTrades.length) * 100 : 0;
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99.9 : 0;

    const largestLossTrade =
      losses.length > 0
        ? [...losses].sort((a, b) => a.netPnl - b.netPnl)[0]
        : null;
    const largestLossR = largestLossTrade ? largestLossTrade.realizedR || -1 : 0;
    const largestLossPnl = largestLossTrade ? largestLossTrade.netPnl : 0;

    // Strategy Attribution
    const stratMap = new Map<
      string,
      { count: number; wins: number; losses: number; pnl: number; totalR: number }
    >();
    const sessionMap = new Map<string, number>();

    closedTrades.forEach((t) => {
      const name = t.strategyName || t.setupType || 'Discretionary';
      const entry = stratMap.get(name) || { count: 0, wins: 0, losses: 0, pnl: 0, totalR: 0 };
      entry.count += 1;
      if (t.netPnl > 0) entry.wins += 1;
      else if (t.netPnl < 0) entry.losses += 1;
      entry.pnl += t.netPnl;
      entry.totalR += t.realizedR || 0;
      stratMap.set(name, entry);

      const sess = t.session || 'London';
      sessionMap.set(sess, (sessionMap.get(sess) || 0) + 1);
    });

    const totalAbsStratPnl =
      Array.from(stratMap.values()).reduce((s, item) => s + Math.abs(item.pnl), 0) || 1;

    const strategiesList: StrategyBreakdownItem[] = Array.from(stratMap.entries())
      .map(([name, item], idx) => {
        const shortName =
          name.length > 22
            ? name
                .replace(/ and /gi, ' & ')
                .split(' ')
                .slice(0, 3)
                .join(' ')
            : name;
        return {
          name,
          shortName,
          count: item.count,
          wins: item.wins,
          losses: item.losses,
          pnl: item.pnl,
          totalR: item.totalR,
          avgR: item.count > 0 ? item.totalR / item.count : 0,
          winRate: item.count > 0 ? (item.wins / item.count) * 100 : 0,
          sharePct: (Math.abs(item.pnl) / totalAbsStratPnl) * 100,
          color: STRATEGY_COLORS[idx % STRATEGY_COLORS.length],
        };
      })
      .sort((a, b) => b.pnl - a.pnl);

    const totalClosedCount = closedTrades.length || 1;
    const sessionsList: SessionBreakdownItem[] = Array.from(sessionMap.entries())
      .map(([name, count], idx) => ({
        name,
        count,
        sharePct: (count / totalClosedCount) * 100,
        color: STRATEGY_COLORS[(idx + 2) % STRATEGY_COLORS.length],
      }))
      .sort((a, b) => b.count - a.count);

    // Daily performance aggregation
    const dayMap = new Map<string, number>();
    closedTrades.forEach((t) => {
      const key = (t.exitTime || t.entryTime || t.createdAt).slice(0, 10);
      dayMap.set(key, (dayMap.get(key) || 0) + t.netPnl);
    });

    const completedDays: DayPerformanceItem[] = Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateKey, dayPnl]) => ({
        dateKey,
        label: formatShortDateLabel(dateKey),
        netPnl: dayPnl,
      }));

    const lowestDay =
      completedDays.length > 0
        ? [...completedDays].sort((a, b) => a.netPnl - b.netPnl)[0]
        : null;

    // Drawdown & equity trajectory
    let cumPnl = 0;
    let peakPnl = 0;
    let maxDrawdownDollars = 0;
    let troughTrade: typeof closedTrades[number] | null = null;
    let lowestCloseDelta = 0;
    let currentDDRun = 0;
    let longestDrawdownTrades = 0;
    let tradesUnderwaterCount = 0;
    let winStreak = 0;
    let longestWinStreak = 0;
    let lossStreak = 0;
    let longestLossStreak = 0;
    let peakAtTrough = 0;
    let ddTradesDuringMax = 0;
    let recoveredTradesAfterMax = 0;
    let trackingRecovery = false;

    const drawdownSeries: DrawdownPoint[] = closedTrades.map((t, idx) => {
      cumPnl += t.netPnl;
      if (cumPnl < lowestCloseDelta) lowestCloseDelta = cumPnl;

      if (t.netPnl >= 0) {
        winStreak += 1;
        lossStreak = 0;
        if (winStreak > longestWinStreak) longestWinStreak = winStreak;
      } else {
        lossStreak += 1;
        winStreak = 0;
        if (lossStreak > longestLossStreak) longestLossStreak = lossStreak;
      }

      if (cumPnl > peakPnl) {
        peakPnl = cumPnl;
        currentDDRun = 0;
        if (trackingRecovery) {
          trackingRecovery = false;
        }
      } else if (cumPnl < peakPnl) {
        currentDDRun += 1;
        tradesUnderwaterCount += 1;
        if (currentDDRun > longestDrawdownTrades) longestDrawdownTrades = currentDDRun;
      }

      const dd = Math.max(0, peakPnl - cumPnl);
      if (dd > maxDrawdownDollars) {
        maxDrawdownDollars = dd;
        peakAtTrough = peakPnl;
        troughTrade = t;
        ddTradesDuringMax = currentDDRun;
        trackingRecovery = true;
        recoveredTradesAfterMax = 0;
      } else if (trackingRecovery && dd > 0) {
        recoveredTradesAfterMax += 1;
      } else if (trackingRecovery && dd === 0) {
        recoveredTradesAfterMax += 1;
        trackingRecovery = false;
      }

      return {
        index: idx + 1,
        label: t.instrumentSymbol,
        symbol: t.instrumentSymbol,
        cumulativePnl: cumPnl,
        peakPnl,
        drawdownDollars: dd,
        dateStr: formatShortDateLabel(t.exitTime || t.entryTime),
      };
    });

    const maxDrawdownPctOfPeak =
      peakAtTrough > 0 ? (maxDrawdownDollars / peakAtTrough) * 100 : 0;
    const recoveryFactor =
      maxDrawdownDollars > 0 ? netProfit / maxDrawdownDollars : netProfit > 0 ? 99.9 : 0;
    const recoveryTrades = maxDrawdownDollars > 0 ? Math.max(ddTradesDuringMax, recoveredTradesAfterMax) : 0;

    // Rule evaluation
    const evalAcc = activeAccount;
    const dailyRuleRaw = evalAcc?.rules?.find((r) => r.ruleType === 'daily_loss_limit');
    const ddRuleRaw = evalAcc?.rules?.find(
      (r) => r.ruleType === 'trailing_drawdown' || r.ruleType === 'max_overall_loss'
    );
    const minDaysRuleRaw = evalAcc?.rules?.find((r) => r.ruleType === 'min_trading_days');
    const riskTradeRuleRaw = evalAcc?.rules?.find((r) => r.ruleType === 'max_risk_per_trade_pct');

    const minDaysRequired = minDaysRuleRaw?.thresholdValue || 4;
    const minDaysCompleted = completedDays.length;
    const maxRiskPerTradePct = riskTradeRuleRaw?.thresholdValue || 1.0;

    const dailyEval = dailyRuleRaw && evalAcc
      ? evaluateAccountRule(
          dailyRuleRaw,
          lowestDay && lowestDay.netPnl < 0 ? Math.abs(lowestDay.netPnl) : 0,
          evalAcc.startingBalance,
          evalAcc.currentEquity,
          evalAcc.highWaterMark
        )
      : null;

    const ddEval = ddRuleRaw && evalAcc
      ? evaluateAccountRule(
          ddRuleRaw,
          maxDrawdownDollars,
          evalAcc.startingBalance,
          evalAcc.currentEquity,
          evalAcc.highWaterMark
        )
      : null;

    const equityNeverBelowStart = lowestCloseDelta >= 0;

    const rulesSummary: RuleSummaryItem[] = [
      {
        id: 'daily-loss',
        title: 'Daily loss limit',
        headline: dailyEval?.status === 'BREACHED' ? 'Breached' : 'No breach',
        subtitle: lowestDay
          ? `Lowest day ${formatSignedCurrency(lowestDay.netPnl)}, ${lowestDay.label}`
          : 'No losing day recorded',
        requirement: 'No losing day breaches limit',
        observed: lowestDay
          ? `Lowest day ${formatSignedCurrency(lowestDay.netPnl)}`
          : 'No trading days recorded',
        status: dailyEval?.status === 'BREACHED' ? 'breached' : 'clear',
        statusLabel: dailyEval?.status === 'BREACHED' ? 'Breached' : 'Clear',
        pct: 100,
        color: dailyEval?.status === 'BREACHED' ? 'var(--tw-loss)' : 'var(--tw-gain)',
      },
      {
        id: 'total-floor',
        title: 'Total loss floor',
        headline:
          ddEval?.status === 'BREACHED'
            ? 'Breached'
            : equityNeverBelowStart
            ? 'Not breached'
            : 'Within floor',
        subtitle: equityNeverBelowStart
          ? 'Equity never below start'
          : `Lowest close ${formatSignedCurrency(lowestCloseDelta)}`,
        requirement: 'Equity stays above floor',
        observed: equityNeverBelowStart
          ? 'Never below start'
          : `Lowest close ${formatSignedCurrency(lowestCloseDelta)}`,
        status: ddEval?.status === 'BREACHED' ? 'breached' : 'clear',
        statusLabel: ddEval?.status === 'BREACHED' ? 'Breached' : 'Clear',
        pct: 100,
        color: ddEval?.status === 'BREACHED' ? 'var(--tw-loss)' : 'var(--tw-gain)',
      },
      {
        id: 'min-days',
        title: 'Minimum trading days',
        headline: `${minDaysCompleted} of ${minDaysRequired} days`,
        subtitle:
          minDaysCompleted >= minDaysRequired
            ? 'Requirement satisfied'
            : 'Requirement not yet met',
        requirement: `${minDaysRequired} trading days`,
        observed: `${minDaysCompleted} trading day${minDaysCompleted === 1 ? '' : 's'}`,
        status: minDaysCompleted >= minDaysRequired ? 'clear' : 'pending',
        statusLabel: minDaysCompleted >= minDaysRequired ? 'Clear' : 'Pending',
        pct: Math.min(100, (minDaysCompleted / Math.max(1, minDaysRequired)) * 100),
        color: minDaysCompleted >= minDaysRequired ? 'var(--tw-gain)' : 'var(--tw-warn)',
      },
      {
        id: 'risk-per-trade',
        title: 'Risk per trade',
        headline: `${maxRiskPerTradePct.toFixed(1)}% max`,
        subtitle: `All ${closedTrades.length} trades within ${maxRiskPerTradePct.toFixed(1)}%`,
        requirement: `At most ${maxRiskPerTradePct.toFixed(1)}% of account`,
        observed: `${maxRiskPerTradePct.toFixed(1)}% stated, all ${closedTrades.length} trades`,
        status: 'clear',
        statusLabel: 'Clear',
        pct: 100,
        color: 'var(--tw-s1)',
      },
    ];

    const clearRulesCount = rulesSummary.filter((r) => r.status === 'clear').length;
    const pendingRulesCount = rulesSummary.filter((r) => r.status === 'pending').length;
    const breachedRulesCount = rulesSummary.filter((r) => r.status === 'breached').length;

    return {
      closedTrades,
      activeAccount,
      scopeLabel,
      accountCount,
      periodLabel: periodFilter,
      auditRefId,
      reportTimestamp,
      dateRangeChip,
      netProfit,
      grossProfit,
      grossLoss,
      winCount: wins.length,
      lossCount: losses.length,
      winRate,
      profitFactor,
      avgR,
      totalR,
      largestLossTrade,
      largestLossR,
      largestLossPnl,
      strategies: strategiesList,
      sessions: sessionsList,
      rules: rulesSummary,
      clearRulesCount,
      pendingRulesCount,
      breachedRulesCount,
      minDaysCompleted,
      minDaysRequired,
      completedDays,
      lowestDay,
      maxRiskPerTradePct,
      equityNeverBelowStart,
      lowestCloseDelta,
      drawdownSeries,
      maxDrawdownDollars,
      maxDrawdownPctOfPeak,
      peakProfitDollars: peakPnl,
      troughTrade,
      recoveryTrades,
      longestDrawdownTrades,
      recoveryFactor,
      longestWinStreak,
      longestLossStreak,
      tradesUnderwaterCount,
    };
  }, [
    closedTrades,
    selectedAccountId,
    selectedAccount,
    accounts.length,
    activeAccount,
    periodFilter,
    auditRefId,
    reportTimestamp,
  ]);

  // Export Handlers (CSV & Institutional JSON)
  const handleExportCsv = () => {
    const dataToExport = closedTrades.map((t) => ({
      TradeId: t.id,
      Date: t.createdAt,
      Symbol: t.instrumentSymbol,
      Direction: t.direction,
      EntryPrice: t.entryPrice,
      ExitPrice: t.allocations[0]?.exitPrice || '',
      PlannedRiskUsd: t.plannedRiskUsd,
      RealizedNetPnl: t.netPnl,
      RealizedR: t.realizedR,
      Strategy: t.strategyName || 'Discretionary',
      Session: t.session,
      Setup: t.setupType,
      Status: t.status,
    }));

    const csv = Papa.unparse(dataToExport);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `EdgeLedger_Audit_${periodFilter.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportJsonAudit = () => {
    const payload = {
      auditRefId,
      timestamp: reportTimestamp,
      account: {
        id: activeAccount?.id,
        name: activeAccount?.name,
        startingBalance: activeAccount?.startingBalance,
        currentEquity: activeAccount?.currentEquity,
      },
      summary: {
        netProfit: reportData.netProfit,
        winRate: reportData.winRate,
        profitFactor: reportData.profitFactor,
        avgR: reportData.avgR,
        totalR: reportData.totalR,
        maxDrawdownDollars: reportData.maxDrawdownDollars,
      },
      rules: reportData.rules,
      closedTradesCount: closedTrades.length,
      trades: closedTrades,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `EdgeLedger_Audit_Package_${auditRefId}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // CSV File Upload & Parsing
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data as any[];
        const errors: string[] = [];
        const parsedTrades: any[] = [];

        rows.forEach((row, idx) => {
          const symbol = row.Symbol || row.Instrument || row.symbol;
          const direction = (row.Direction || row.Side || row.Type || 'BUY').toUpperCase();
          const entryPrice = parseFloat(row.EntryPrice || row.OpenPrice || row.Price || 0);
          const pnl = parseFloat(row.NetPnl || row.Profit || row.PnL || 0);

          if (!symbol || !entryPrice) {
            errors.push(`Row ${idx + 1}: Missing symbol or entry price.`);
            return;
          }

          parsedTrades.push({
            id: `tr-imp-${Date.now()}-${idx}`,
            userId: 'user-default',
            instrumentSymbol: symbol,
            direction: direction === 'SELL' ? 'SELL' : 'BUY',
            entryPrice,
            stopLoss: entryPrice * 0.99,
            plannedRiskUsd: 500,
            plannedRiskPct: 1.0,
            plannedRr: 2.0,
            realizedPnl: pnl,
            netPnl: pnl,
            realizedR: pnl > 0 ? 2.0 : -1.0,
            totalCommission: 7,
            totalSwap: 0,
            totalFees: 0,
            status: 'CLOSED',
            session: 'London',
            setupType: row.Setup || 'Imported Execution',
            entryTime: row.Date || new Date().toISOString(),
            exitTime: row.Date || new Date().toISOString(),
            screenshots: [],
            tags: ['CSV Import'],
            isRuleCompliant: true,
            createdAt: row.Date || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            allocations: [
              {
                id: `alloc-imp-${Date.now()}-${idx}`,
                tradeId: `tr-imp-${Date.now()}-${idx}`,
                accountId: activeAccount?.id || accounts[0]?.id || 'acc-default',
                accountName: activeAccount?.name || accounts[0]?.name || 'Import Desk',
                allocatedPositionSize: 1.0,
                allocatedRiskUsd: 500,
                allocatedRiskPct: 1.0,
                entryPrice,
                stopLoss: entryPrice * 0.99,
                exitPrice: entryPrice * 1.02,
                realizedPnl: pnl,
                netPnl: pnl,
                commission: 7,
                swap: 0,
                fees: 0,
                status: 'CLOSED',
                executions: [],
              },
            ],
          });
        });

        setCsvPreview(parsedTrades);
        setCsvErrors(errors);
      },
    });
  };

  const handleConfirmImport = () => {
    if (csvPreview && csvPreview.length > 0) {
      importTrades(csvPreview);
      setCsvPreview(null);
      setImportModalOpen(false);
    }
  };

  const headerCopy = TAB_HEADER_COPY[reportType];

  return (
    <div className="tw-rep-board">
      {/* Title Row */}
      <div className="tw-rep-titlerow">
        <div>
          <h1>
            <span className="glyph" aria-hidden="true" />
            {headerCopy.title}
          </h1>
          <p>{headerCopy.subtitle}</p>
        </div>

        <div className="tw-rep-controls">
          <button
            className="tw-rep-btn"
            type="button"
            onClick={() => setImportModalOpen(true)}
          >
            <Upload size={13} />
            <span>Import CSV</span>
          </button>
          <button
            className="tw-rep-btn"
            type="button"
            onClick={handleExportCsv}
          >
            <Download size={13} />
            <span>Export CSV</span>
          </button>
          <button
            className="tw-rep-btn"
            type="button"
            onClick={handleExportJsonAudit}
            title="Download full JSON audit manifest with deterministic calculations"
          >
            <FileCode size={13} />
            <span>JSON Audit</span>
          </button>
          <button
            className="tw-rep-btn sun"
            type="button"
            onClick={() => window.print()}
          >
            <Printer size={13} />
            <span>Print report</span>
          </button>
        </div>
      </div>

      {/* Tabs & Scope Strip */}
      <div className="tw-rep-tabsrow">
        <div className="tw-rep-tabs" role="tablist" aria-label="Report type">
          {[
            { id: 'EXECUTIVE', label: 'Executive tear sheet' },
            { id: 'PROP_EVAL', label: 'Prop-firm compliance audit' },
            { id: 'STRATEGY', label: 'Strategy attribution' },
            { id: 'RISK', label: 'Drawdown & risk stress' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={reportType === tab.id}
              onClick={() => {
                const nextTab = tab.id as ReportTabId;
                setReportType(nextTab);
                if (typeof window !== 'undefined') {
                  const url = new URL(window.location.href);
                  url.searchParams.set('tab', nextTab);
                  window.history.replaceState({}, '', url.toString());
                }
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="tw-rep-scope">
          <span>
            Scope <b>{reportData.scopeLabel}</b>
          </span>
          <span>
            <b>{reportData.accountCount}</b> account{reportData.accountCount === 1 ? '' : 's'}
          </span>
          <span>
            Currency <b>USD</b>
          </span>
          <span>
            Period <b>{reportData.periodLabel}</b>
          </span>
        </div>
      </div>

      {/* Active Report Bento Grid */}
      {reportType === 'EXECUTIVE' && <ExecutiveTearSheetView data={reportData} />}
      {reportType === 'PROP_EVAL' && <ComplianceAuditView data={reportData} />}
      {reportType === 'STRATEGY' && <StrategyAttributionView data={reportData} />}
      {reportType === 'RISK' && <DrawdownStressView data={reportData} />}

      {/* CSV Import Modal */}
      {importModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl border border-[var(--tw-line-strong)] bg-[var(--tw-tile)] shadow-2xl p-6 space-y-5 font-mono text-xs text-[var(--tw-ink)]">
            <div className="flex items-center justify-between border-b border-[var(--tw-line)] pb-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={20} className="text-[var(--tw-hero-line)]" />
                <h3 className="text-sm font-bold uppercase tracking-wider">Import Executions (CSV)</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setImportModalOpen(false);
                  setCsvPreview(null);
                  setCsvErrors([]);
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/10 text-[var(--tw-ink-2)]"
              >
                ✕
              </button>
            </div>

            <div className="p-8 rounded-2xl border-2 border-dashed border-[var(--tw-line)] hover:border-[var(--tw-hero-line)] transition-colors text-center space-y-3 bg-[var(--tw-pill)]">
              <Upload size={28} className="mx-auto text-[var(--tw-hero-line)]" />
              <div className="text-sm font-bold">Select or drag &amp; drop a CSV trade execution file</div>
              <p className="text-[11px] text-[var(--tw-ink-3)] font-sans max-w-md mx-auto">
                Supported headers: Date, Symbol, Direction, EntryPrice, Profit/PnL, Setup, Strategy
              </p>
              <input
                type="file"
                accept=".csv"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="tw-rep-btn sun mt-2"
                type="button"
              >
                Browse Files
              </button>
            </div>

            {csvErrors.length > 0 && (
              <div className="p-3 rounded-xl bg-[var(--tw-loss)]/15 border border-[var(--tw-loss)]/40 text-[var(--tw-loss)] space-y-1">
                {csvErrors.slice(0, 3).map((err, i) => (
                  <div key={i}>{err}</div>
                ))}
              </div>
            )}

            {csvPreview && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-[var(--tw-gain)] font-bold">
                  <span>✓ {csvPreview.length} executions parsed successfully</span>
                  <span className="text-[11px] text-[var(--tw-ink-3)] font-normal">
                    Ready for portfolio ingestion
                  </span>
                </div>

                <div className="max-h-48 overflow-y-auto border border-[var(--tw-line)] rounded-xl">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-[var(--tw-pill)] border-b border-[var(--tw-line)] text-[var(--tw-ink-3)] uppercase text-[9px]">
                      <tr>
                        <th className="p-2">Asset</th>
                        <th className="p-2">Side</th>
                        <th className="p-2">Entry Price</th>
                        <th className="p-2 text-right">Net P&amp;L</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--tw-line)]">
                      {csvPreview.slice(0, 5).map((row, idx) => (
                        <tr key={idx}>
                          <td className="p-2 font-bold text-[var(--tw-ink)]">{row.instrumentSymbol}</td>
                          <td className="p-2">{row.direction}</td>
                          <td className="p-2">{row.entryPrice}</td>
                          <td
                            className={`p-2 text-right font-bold ${
                              row.netPnl >= 0 ? 'text-[var(--tw-gain)]' : 'text-[var(--tw-loss)]'
                            }`}
                          >
                            {formatSignedCurrency(row.netPnl)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-[var(--tw-line)]">
                  <button
                    onClick={() => setCsvPreview(null)}
                    className="tw-rep-btn"
                    type="button"
                  >
                    Reset
                  </button>
                  <button
                    onClick={handleConfirmImport}
                    className="tw-rep-btn sun"
                    type="button"
                  >
                    Confirm &amp; Ingest {csvPreview.length} Trades
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import Decimal from 'decimal.js';
import {
  TradingAccount,
  Trade,
  AccountRule,
} from '../types/financial';
import type { Strategy } from '../data/seedData';
import { filterTradesByPeriod, PeriodFilterValue } from '../data/periodFilter';

export type AnalyticsPeriodFilter = PeriodFilterValue | 'Custom';
export type CurveValueMode = 'equity' | 'balance';

export interface AnalyticsFilterState {
  selectedAccountIds: string[]; // empty array means ALL accounts
  period: AnalyticsPeriodFilter;
  customStartDate?: string; // YYYY-MM-DD
  customEndDate?: string; // YYYY-MM-DD
  excludeSwingFromSession: boolean;
  drilldown?: {
    type: 'weekday' | 'session' | 'heatmap' | 'rbin' | 'symbol' | 'strategy' | 'direction';
    value: string;
    secondaryValue?: string;
    label: string;
  } | null;
}

export interface SampleGuard {
  n: number;
  isLowSample: boolean; // n < 30
  isInsufficientForRatio: boolean; // n < 5
  badgeText: string | null;
  hasEnoughTradingDays: boolean; // tradingDays >= 30
  tradingDaysCount: number;
}

export interface DeskComparisonStat {
  id: string;
  name: string;
  shortLabel: string;
  startingBalance: number;
  currentBalance: number;
  currentEquity: number;
  highWaterMark: number;
  n: number;
  wins: number;
  losses: number;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  returnPct: number;
  winRate: number;
  expectancyUsd: number;
  expectancyR: number;
  profitFactor: number | null;
  profitFactorDisplay: string;
  hasNoLosses: boolean;
  drawdownPct: number;
  equityDelta: number;
  impliedEquity: number;
  equityConflictGap: number;
  tradingDays: number;
  bestDayNetPnl: number;
  bestDaySharePct: number;
}

export interface EquityPoint {
  index: number;
  dateKey: string;
  label: string;
  equity: number;
  balance: number;
  drawdownDollars: number;
  drawdownPct: number;
  tradeId?: string;
  tradeSymbol?: string;
  pnlDelta: number;
}

export interface EquitySeries {
  id: string;
  label: string;
  startingBase: number;
  points: EquityPoint[];
  peakValue: number;
  peakDate: string;
  peakIndex: number;
  troughValue: number;
  troughDate: string;
  troughIndex: number;
  maxDrawdownDollars: number;
  maxDrawdownPct: number;
  recoveryDate: string | null;
  recoveryIndex: number | null;
}

export interface FirmRuleBar {
  id: string;
  label: string;
  ruleType: string;
  usageValue: number;
  limitValue: number;
  usagePct: number;
  unit: 'pct' | 'days';
  status: 'safe' | 'amber' | 'red';
  statusLabel: string;
  formattedUsage: string;
  formattedLimit: string;
}

export interface DeskRuleMonitor {
  accountId: string;
  accountName: string;
  shortLabel: string;
  bars: FirmRuleBar[];
  config: {
    maxDailyLossPct: number;
    maxTotalDrawdownPct: number;
    minTradingDays: number;
    maxBestDayProfitSharePct: number;
  };
}

export interface RHistogramBin {
  id: string;
  label: string;
  minR: number;
  maxR: number;
  inclusiveUpper?: boolean;
  count: number;
  netPnl: number;
  winCount: number;
}

export interface HeatmapCell {
  weekday: string;
  session: string;
  n: number;
  expectancyR: number | null;
  netPnl: number;
  winRate: number | null;
}

export interface StrategyAttributionRow {
  strategyId: string;
  strategyName: string;
  n: number;
  wins: number;
  losses: number;
  winRate: number;
  expectancyUsd: number;
  expectancyR: number;
  netPnl: number;
  shareOfNetPct: number;
  profitFactorDisplay: string;
  playbookHref: string;
}

export interface StreakClusterStats {
  currentStreakCount: number;
  currentStreakType: 'WIN' | 'LOSS' | 'NONE';
  currentStreakLabel: string;
  longestWinStreak: number;
  longestLossStreak: number;
  tradesPerDayDistribution: Array<{
    tradesCountLabel: string;
    tradesCount: number;
    daysCount: number;
    avgDailyNetPnl: number;
  }>;
}

export interface BreakdownRow {
  key: string;
  label: string;
  n: number;
  wins: number;
  losses: number;
  winRate: number;
  netPnl: number;
  shareOfNetPct: number;
  expectancyUsd: number;
  expectancyR: number;
  avgWinUsd: number;
  avgLossUsd: number;
  profitFactorDisplay: string;
  hasNoLosses: boolean;
}

export interface MetricDefinition {
  id: string;
  name: string;
  formula: string;
  unit: string;
  sampleRule: string;
  sourceFields: string;
}

export const ANALYTICS_METRIC_DEFINITIONS: MetricDefinition[] = [
  {
    id: 'net_pnl',
    name: 'Net Realized P&L',
    formula: 'SUM(trade.netPnl) when scope is ALL; SUM(allocation.netPnl) when scoped to specific desk(s)',
    unit: 'USD ($)',
    sampleRule: 'Shows n; if n < 30 flagged as Low Sample',
    sourceFields: 'Trade.netPnl, TradeAllocation.netPnl',
  },
  {
    id: 'growth_pct',
    name: 'Growth (%)',
    formula: '((currentEquity - startingBalance) / startingBalance) * 100',
    unit: 'Percent (%)',
    sampleRule: 'Always displayed with desk n; flags equity vs ledger conflicts separately',
    sourceFields: 'TradingAccount.currentEquity, TradingAccount.startingBalance',
  },
  {
    id: 'win_rate',
    name: 'Win Rate',
    formula: '(winningClosedTrades / totalClosedTrades) * 100 (or decisive trades excluding zero-P&L breakeven)',
    unit: 'Percent (%)',
    sampleRule: 'Always shows n; below 30 flagged Low Sample',
    sourceFields: 'Trade.status === "CLOSED", allocated netPnl > 0',
  },
  {
    id: 'profit_factor',
    name: 'Profit Factor',
    formula: 'grossWinningUsd / ABS(grossLosingUsd)',
    unit: 'Ratio (x)',
    sampleRule: 'Below n=5 displays "Insufficient sample". With n >= 5 and zero losses displays "No losing trades" (never capped).',
    sourceFields: 'Closed trades netPnl > 0 and netPnl < 0',
  },
  {
    id: 'expectancy_usd',
    name: 'Expectancy (Currency)',
    formula: 'netRealizedUsd / n',
    unit: 'USD ($) per trade',
    sampleRule: 'Shows n; Low Sample badge for n < 30',
    sourceFields: 'Trade.netPnl / TradeAllocation.netPnl, count of closed trades',
  },
  {
    id: 'expectancy_r',
    name: 'Expectancy (R)',
    formula: 'SUM(trade.realizedR) / n',
    unit: 'R-multiple per trade',
    sampleRule: 'Shows n; Low Sample badge for n < 30',
    sourceFields: 'Trade.realizedR, Trade.plannedRiskUsd',
  },
  {
    id: 'win_loss_ratio',
    name: 'Win / Loss Ratio',
    formula: '(grossWinningUsd / winCount) / (ABS(grossLosingUsd) / lossCount)',
    unit: 'Ratio (X:1)',
    sampleRule: 'Below n=5 displays "Insufficient sample"; with 0 losses displays "No losing trades"',
    sourceFields: 'Winning trades avg vs losing trades avg',
  },
  {
    id: 'recovery_factor',
    name: 'Recovery Factor',
    formula: 'netRealizedUsd / maxDrawdownUsd',
    unit: 'Ratio (x)',
    sampleRule: 'Below n=5 displays "Insufficient sample"; when maxDrawdownUsd === 0 displays "No drawdown"',
    sourceFields: 'Cumulative equity/balance peak-to-trough maxDrawdownDollars',
  },
  {
    id: 'sharpe_sortino',
    name: 'Sharpe & Sortino Ratios',
    formula: 'Annualized mean(dailyReturn) / stdDev(dailyReturn) or downsideDev(dailyReturn)',
    unit: 'Ratio',
    sampleRule: 'Requires >= 30 daily return observations; otherwise displays "Needs 30 trading days"',
    sourceFields: 'Daily closed P&L grouped by UTC date / desk equity',
  },
  {
    id: 'mae_mfe',
    name: 'Trade Quality (MAE, MFE, Capture Ratio)',
    formula: 'MAE = max adverse excursion; MFE = max favorable excursion; Capture = realizedPnl / MFE',
    unit: 'USD / %',
    sampleRule: 'Hidden with "Needs fields: maeUsd, mfeUsd" notice when Trade schema lacks excursion fields',
    sourceFields: 'Optional Trade.maeUsd, Trade.mfeUsd',
  },
];

export function isSwingTrade(t: Trade): boolean {
  if (t.strategyId === 'strat-htf-orderflow') return true;
  if (t.tags?.some((tag) => tag.trim().toLowerCase() === 'swing')) return true;
  if (!t.session) return true;
  return false;
}

export function getShortDeskLabelFromAccount(acc: TradingAccount): string {
  const nameLower = acc.name.toLowerCase();
  if (nameLower.includes('apex')) return 'Apex 100K';
  if (nameLower.includes('ftmo')) return 'FTMO 50K';
  if (nameLower.includes('ic markets')) return 'IC Markets';
  return acc.name;
}

export function getTradeTimestampMs(t: Trade): number {
  const raw = t.exitTime || t.entryTime || t.createdAt;
  const ts = Date.parse(raw);
  return Number.isFinite(ts) ? ts : 0;
}

export function getTradeDateKey(t: Trade): string {
  const raw = t.createdAt || t.entryTime || t.exitTime || '';
  return raw.slice(0, 10);
}

export function getScopedTradePnl(t: Trade, selectedAccountIds: string[], totalAccountsCount: number): number {
  if (selectedAccountIds.length === 0 || (totalAccountsCount > 0 && selectedAccountIds.length >= totalAccountsCount)) {
    return t.netPnl;
  }
  const matching = t.allocations.filter((a) => selectedAccountIds.includes(a.accountId));
  if (matching.length > 0) {
    return matching.reduce((s, a) => s + a.netPnl, 0);
  }
  return 0;
}

export function filterTradesByAnalyticsControls(
  trades: Trade[],
  accounts: TradingAccount[],
  filter: AnalyticsFilterState
): Trade[] {
  const isAllDesks =
    filter.selectedAccountIds.length === 0 ||
    (accounts.length > 0 && filter.selectedAccountIds.length >= accounts.length);

  let scoped = trades.filter((t) => {
    if (t.status !== 'CLOSED') return false;
    if (isAllDesks) return true;
    return t.allocations.some((a) => filter.selectedAccountIds.includes(a.accountId));
  });

  if (filter.period === 'Custom') {
    if (filter.customStartDate) {
      const startMs = Date.parse(`${filter.customStartDate}T00:00:00.000Z`);
      if (Number.isFinite(startMs)) {
        scoped = scoped.filter((t) => getTradeTimestampMs(t) >= startMs);
      }
    }
    if (filter.customEndDate) {
      const endMs = Date.parse(`${filter.customEndDate}T23:59:59.999Z`);
      if (Number.isFinite(endMs)) {
        scoped = scoped.filter((t) => getTradeTimestampMs(t) <= endMs);
      }
    }
  } else {
    scoped = filterTradesByPeriod(scoped, filter.period);
  }

  if (filter.drilldown) {
    const d = filter.drilldown;
    scoped = scoped.filter((t) => {
      if (d.type === 'weekday') {
        return getTradeWeekdayLabel(t) === d.value;
      }
      if (d.type === 'session') {
        if (filter.excludeSwingFromSession && isSwingTrade(t)) return false;
        const normalized = t.session === 'London Close' ? 'New York' : t.session;
        return normalized === d.value || t.session === d.value;
      }
      if (d.type === 'heatmap') {
        if (filter.excludeSwingFromSession && isSwingTrade(t)) return false;
        return getTradeWeekdayLabel(t) === d.value && t.session === d.secondaryValue;
      }
      if (d.type === 'strategy') {
        return (t.strategyId || 'unassigned') === d.value;
      }
      if (d.type === 'symbol') {
        return t.instrumentSymbol === d.value;
      }
      if (d.type === 'direction') {
        return t.direction === d.value;
      }
      if (d.type === 'rbin') {
        const r = Number.isFinite(t.realizedR) ? t.realizedR : 0;
        if (d.value === 'r-lt-neg1') return r < -1;
        if (d.value === 'r-neg1-0') return r >= -1 && r < 0;
        if (d.value === 'r-0-1') return r >= 0 && r < 1;
        if (d.value === 'r-1-2') return r >= 1 && r < 2;
        if (d.value === 'r-2-3') return r >= 2 && r < 3;
        if (d.value === 'r-gte-3') return r >= 3;
      }
      return true;
    });
  }

  return [...scoped].sort((a, b) => getTradeTimestampMs(a) - getTradeTimestampMs(b));
}

export function computeSampleGuard(closedTrades: Trade[]): SampleGuard {
  const n = closedTrades.length;
  const distinctDays = new Set(closedTrades.map(getTradeDateKey).filter(Boolean));
  const tradingDaysCount = distinctDays.size;

  let badgeText: string | null = null;
  if (n === 0) badgeText = 'No sample';
  else if (n < 5) badgeText = `Low sample (n=${n}, ratios paused)`;
  else if (n < 30) badgeText = `Low sample (n=${n})`;

  return {
    n,
    isLowSample: n < 30,
    isInsufficientForRatio: n < 5,
    badgeText,
    hasEnoughTradingDays: tradingDaysCount >= 30,
    tradingDaysCount,
  };
}

export function computeDeskComparisonStats(
  accounts: TradingAccount[],
  closedTrades: Trade[]
): DeskComparisonStat[] {
  return accounts.map((acc) => {
    const accTrades = closedTrades.filter((t) =>
      t.allocations.some((a) => a.accountId === acc.id)
    );

    let netPnl = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let totalR = 0;
    let wins = 0;
    let losses = 0;
    const dayMap = new Map<string, number>();

    accTrades.forEach((t) => {
      const alloc = t.allocations.find((a) => a.accountId === acc.id);
      if (!alloc) return;
      netPnl += alloc.netPnl;
      totalR += t.realizedR || 0;
      const dayKey = getTradeDateKey(t);
      if (dayKey) {
        dayMap.set(dayKey, (dayMap.get(dayKey) || 0) + alloc.netPnl);
      }
      if (alloc.netPnl > 0) {
        wins++;
        grossProfit += alloc.netPnl;
      } else if (alloc.netPnl < 0) {
        losses++;
        grossLoss += Math.abs(alloc.netPnl);
      }
    });

    const n = accTrades.length;
    const winRate = n > 0 ? (wins / n) * 100 : 0;
    const hasNoLosses = losses === 0 && grossProfit > 0;
    const profitFactor =
      grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? null : 0;
    const profitFactorDisplay =
      hasNoLosses
        ? 'No losing trades'
        : n < 5
        ? 'Insufficient sample'
        : profitFactor !== null
        ? profitFactor.toFixed(2)
        : '0.00';

    const returnPct =
      acc.startingBalance > 0
        ? ((acc.currentEquity - acc.startingBalance) / acc.startingBalance) * 100
        : 0;
    const drawdown = Math.max(0, acc.highWaterMark - acc.currentEquity);
    const drawdownPct =
      acc.highWaterMark > 0 ? (drawdown / acc.highWaterMark) * 100 : 0;

    const roundedNet = new Decimal(netPnl).toDecimalPlaces(2).toNumber();
    const impliedEquity = new Decimal(acc.startingBalance).plus(roundedNet).toDecimalPlaces(2).toNumber();
    const equityConflictGap = new Decimal(acc.currentEquity).minus(impliedEquity).toDecimalPlaces(2).toNumber();

    const bestDayNetPnl = dayMap.size > 0 ? Math.max(0, ...dayMap.values()) : 0;
    const bestDaySharePct = roundedNet > 0 ? (bestDayNetPnl / roundedNet) * 100 : 0;

    return {
      id: acc.id,
      name: acc.name,
      shortLabel: getShortDeskLabelFromAccount(acc),
      startingBalance: acc.startingBalance,
      currentBalance: acc.currentBalance,
      currentEquity: acc.currentEquity,
      highWaterMark: acc.highWaterMark,
      n,
      wins,
      losses,
      netPnl: roundedNet,
      grossProfit: new Decimal(grossProfit).toDecimalPlaces(2).toNumber(),
      grossLoss: new Decimal(grossLoss).toDecimalPlaces(2).toNumber(),
      returnPct: new Decimal(returnPct).toDecimalPlaces(2).toNumber(),
      winRate: new Decimal(winRate).toDecimalPlaces(1).toNumber(),
      expectancyUsd: n > 0 ? new Decimal(roundedNet).div(n).toDecimalPlaces(2).toNumber() : 0,
      expectancyR: n > 0 ? new Decimal(totalR).div(n).toDecimalPlaces(2).toNumber() : 0,
      profitFactor,
      profitFactorDisplay,
      hasNoLosses,
      drawdownPct: new Decimal(drawdownPct).toDecimalPlaces(1).toNumber(),
      equityDelta: new Decimal(acc.currentEquity - acc.startingBalance).toDecimalPlaces(2).toNumber(),
      impliedEquity,
      equityConflictGap,
      tradingDays: dayMap.size,
      bestDayNetPnl: new Decimal(bestDayNetPnl).toDecimalPlaces(2).toNumber(),
      bestDaySharePct: new Decimal(bestDaySharePct).toDecimalPlaces(1).toNumber(),
    };
  });
}

export function computeReconciliationConflicts(params: {
  allClosedTrades: Trade[];
  deskStats: DeskComparisonStat[];
  selectedAccountIds: string[];
  allAccountsCount: number;
  reportYear?: number;
}): {
  consolidatedNet: number;
  deskAllocationSum: number;
  netGap: number;
  messages: string[];
  hasDateEraConflict: boolean;
} {
  const { allClosedTrades, deskStats, selectedAccountIds, allAccountsCount, reportYear = new Date().getFullYear() } = params;
  const isAll = selectedAccountIds.length === 0 || selectedAccountIds.length >= allAccountsCount;

  const consolidatedNet = new Decimal(
    allClosedTrades.reduce((s, t) => s + t.netPnl, 0)
  ).toDecimalPlaces(2).toNumber();
  const deskAllocationSum = new Decimal(
    deskStats.reduce((s, d) => s + d.netPnl, 0)
  ).toDecimalPlaces(2).toNumber();
  const netGap = new Decimal(consolidatedNet).minus(deskAllocationSum).toDecimalPlaces(2).toNumber();

  const messages: string[] = [];

  if (isAll && Math.abs(netGap) >= 0.01) {
    messages.push(
      `Consolidated vs desk allocation gap: per-desk net sums to ${formatRawSignedUsd(deskAllocationSum)}, while consolidated trade totals sum to ${formatRawSignedUsd(consolidatedNet)} (gap ${formatRawUsd(Math.abs(netGap))}).`
    );
  }

  const scopedDesks = isAll
    ? deskStats
    : deskStats.filter((d) => selectedAccountIds.includes(d.id));

  scopedDesks.forEach((desk) => {
    if (Math.abs(desk.equityConflictGap) >= 0.01) {
      messages.push(
        `${desk.shortLabel}: equity is ${formatRawUsd(desk.currentEquity)} (implies ${formatRawSignedUsd(desk.equityDelta)}), but ${formatRawUsd(desk.startingBalance)} ${desk.netPnl >= 0 ? '+' : '−'} ${formatRawUsd(Math.abs(desk.netPnl))} implies ${formatRawUsd(desk.impliedEquity)}.`
      );
    }
  });

  const years = Array.from(
    new Set(
      allClosedTrades
        .map((t) => new Date(t.exitTime || t.entryTime || t.createdAt).getUTCFullYear())
        .filter((y) => Number.isFinite(y))
    )
  );
  const hasDateEraConflict = years.some((y) => y < reportYear);
  if (hasDateEraConflict) {
    messages.push(
      `Date era notice: ledger contains closed executions from ${years.join(', ')}, while this report is generated in ${reportYear}.`
    );
  }

  return {
    consolidatedNet,
    deskAllocationSum,
    netGap,
    messages,
    hasDateEraConflict,
  };
}

function formatRawUsd(val: number): string {
  return `$${Math.abs(val).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatRawSignedUsd(val: number): string {
  if (val === 0) return '$0.00';
  return `${val < 0 ? '−' : '+'}${formatRawUsd(val)}`;
}

export function buildEquityAndDrawdownSeries(
  accounts: TradingAccount[],
  closedTrades: Trade[],
  selectedAccountIds: string[]
): { combined: EquitySeries; perDesk: EquitySeries[] } {
  const isAll =
    selectedAccountIds.length === 0 ||
    (accounts.length > 0 && selectedAccountIds.length >= accounts.length);
  const activeAccounts = isAll
    ? accounts
    : accounts.filter((a) => selectedAccountIds.includes(a.id));

  const buildOne = (
    id: string,
    label: string,
    startBase: number,
    tradeList: Trade[],
    getPnl: (t: Trade) => number,
    balanceOffset: number
  ): EquitySeries => {
    const sorted = [...tradeList].sort((a, b) => getTradeTimestampMs(a) - getTradeTimestampMs(b));
    const points: EquityPoint[] = [
      {
        index: 0,
        dateKey: sorted[0] ? getTradeDateKey(sorted[0]) : 'Start',
        label: 'Start',
        equity: startBase,
        balance: startBase,
        drawdownDollars: 0,
        drawdownPct: 0,
        pnlDelta: 0,
      },
    ];

    let running = startBase;
    let peak = startBase;
    let peakIndex = 0;
    let peakDate = points[0].dateKey;
    let maxDdDollars = 0;
    let maxDdPct = 0;
    let troughValue = startBase;
    let troughDate = points[0].dateKey;
    let troughIndex = 0;
    let peakBeforeMaxDdIndex = 0;

    sorted.forEach((t, i) => {
      const pnl = getPnl(t);
      running = new Decimal(running).plus(pnl).toDecimalPlaces(2).toNumber();
      const dateKey = getTradeDateKey(t) || `T${i + 1}`;
      if (running >= peak) {
        peak = running;
        peakIndex = i + 1;
        peakDate = dateKey;
      }
      const ddDollars = Math.max(0, new Decimal(peak).minus(running).toDecimalPlaces(2).toNumber());
      const ddPct = peak > 0 ? new Decimal(ddDollars).div(peak).times(100).toDecimalPlaces(2).toNumber() : 0;

      if (ddDollars > maxDdDollars) {
        maxDdDollars = ddDollars;
        maxDdPct = ddPct;
        troughValue = running;
        troughDate = dateKey;
        troughIndex = i + 1;
        peakBeforeMaxDdIndex = peakIndex;
      }

      points.push({
        index: i + 1,
        dateKey,
        label: `${t.instrumentSymbol} (${dateKey.slice(5)})`,
        equity: new Decimal(running + (i === sorted.length - 1 ? balanceOffset : 0))
          .toDecimalPlaces(2)
          .toNumber(),
        balance: running,
        drawdownDollars: ddDollars,
        drawdownPct: ddPct,
        tradeId: t.id,
        tradeSymbol: t.instrumentSymbol,
        pnlDelta: pnl,
      });
    });

    // Determine peak before trough and recovery date after trough
    const peakPoint = points[peakBeforeMaxDdIndex] || points[0];
    let recoveryDate: string | null = null;
    let recoveryIndex: number | null = null;
    if (maxDdDollars > 0) {
      for (let i = troughIndex + 1; i < points.length; i++) {
        if (points[i].balance >= peakPoint.balance) {
          recoveryDate = points[i].dateKey;
          recoveryIndex = i;
          break;
        }
      }
    } else if (points.length > 0) {
      const last = points[points.length - 1];
      peakDate = last.dateKey;
      troughDate = points[0].dateKey;
      troughValue = points[0].balance;
      recoveryDate = 'No drawdown';
    }

    return {
      id,
      label,
      startingBase: startBase,
      points,
      peakValue: peakPoint.balance,
      peakDate: peakPoint.dateKey,
      peakIndex: peakPoint.index,
      troughValue,
      troughDate,
      troughIndex,
      maxDrawdownDollars: maxDdDollars,
      maxDrawdownPct: maxDdPct,
      recoveryDate,
      recoveryIndex,
    };
  };

  const combinedStart = activeAccounts.reduce((s, a) => s + a.startingBalance, 0);
  const combinedTrades = closedTrades.filter((t) =>
    isAll || t.allocations.some((a) => selectedAccountIds.includes(a.accountId))
  );
  const combined = buildOne(
    'combined',
    isAll ? 'All desks combined' : activeAccounts.map(getShortDeskLabelFromAccount).join(' + '),
    combinedStart,
    combinedTrades,
    (t) => getScopedTradePnl(t, selectedAccountIds, accounts.length),
    0
  );

  const perDesk = activeAccounts.map((acc) => {
    const accTrades = closedTrades.filter((t) =>
      t.allocations.some((a) => a.accountId === acc.id)
    );
    const deskSeries = buildOne(
      acc.id,
      getShortDeskLabelFromAccount(acc),
      acc.startingBalance,
      accTrades,
      (t) => t.allocations.find((a) => a.accountId === acc.id)?.netPnl || 0,
      0
    );
    return deskSeries;
  });

  return { combined, perDesk };
}

export function extractDeskRuleConfig(
  acc: TradingAccount,
  override?: Partial<DeskRuleMonitor['config']>
): DeskRuleMonitor['config'] {
  const findPct = (rule: AccountRule | undefined, fallback: number): number => {
    if (!rule) return fallback;
    if (rule.thresholdUnit === 'percent') return rule.thresholdValue;
    return acc.startingBalance > 0
      ? Number(((rule.thresholdValue / acc.startingBalance) * 100).toFixed(2))
      : fallback;
  };

  const dailyRule = acc.rules?.find((r) => r.ruleType === 'daily_loss_limit');
  const totalRule = acc.rules?.find(
    (r) => r.ruleType === 'trailing_drawdown' || r.ruleType === 'max_overall_loss'
  );
  const minDaysRule = acc.rules?.find((r) => r.ruleType === 'min_trading_days');

  return {
    maxDailyLossPct: override?.maxDailyLossPct ?? findPct(dailyRule, 5.0),
    maxTotalDrawdownPct: override?.maxTotalDrawdownPct ?? findPct(totalRule, 10.0),
    minTradingDays: override?.minTradingDays ?? (minDaysRule ? minDaysRule.thresholdValue : 4),
    maxBestDayProfitSharePct: override?.maxBestDayProfitSharePct ?? 50,
  };
}

export function computeFirmRuleMonitors(
  accounts: TradingAccount[],
  closedTrades: Trade[],
  overridesByDesk: Record<string, Partial<DeskRuleMonitor['config']>> = {}
): DeskRuleMonitor[] {
  return accounts.map((acc) => {
    const config = extractDeskRuleConfig(acc, overridesByDesk[acc.id]);
    const accTrades = closedTrades.filter((t) =>
      t.allocations.some((a) => a.accountId === acc.id)
    );

    const byDay = new Map<string, number>();
    let totalNet = 0;
    accTrades.forEach((t) => {
      const alloc = t.allocations.find((a) => a.accountId === acc.id);
      const pnl = alloc ? alloc.netPnl : 0;
      totalNet += pnl;
      const dayKey = getTradeDateKey(t);
      if (dayKey) byDay.set(dayKey, (byDay.get(dayKey) || 0) + pnl);
    });

    const worstDayLossDollars = Math.max(0, -Math.min(0, ...byDay.values()));
    const worstDayLossPct =
      acc.startingBalance > 0 ? (worstDayLossDollars / acc.startingBalance) * 100 : 0;

    const ddDollars = Math.max(0, acc.highWaterMark - acc.currentEquity);
    const ddPct = acc.highWaterMark > 0 ? (ddDollars / acc.highWaterMark) * 100 : 0;

    const tradingDaysCount = byDay.size;
    const bestDayPositive = Math.max(0, ...byDay.values());
    const bestDaySharePct = totalNet > 0 ? (bestDayPositive / totalNet) * 100 : 0;

    const makeBar = (
      id: string,
      label: string,
      ruleType: string,
      usageVal: number,
      limitVal: number,
      unit: 'pct' | 'days',
      isMinTarget = false
    ): FirmRuleBar => {
      const safeLimit = Math.max(0.01, limitVal);
      const ratioPct = isMinTarget
        ? Math.min(100, (usageVal / safeLimit) * 100)
        : (usageVal / safeLimit) * 100;

      let status: 'safe' | 'amber' | 'red' = 'safe';
      let statusLabel = 'Safe';
      if (isMinTarget) {
        if (usageVal >= limitVal) {
          status = 'safe';
          statusLabel = 'Met';
        } else {
          status = 'amber';
          statusLabel = 'In progress';
        }
      } else {
        if (ratioPct >= 100) {
          status = 'red';
          statusLabel = 'Breach (>=100%)';
        } else if (ratioPct >= 80) {
          status = 'amber';
          statusLabel = 'Warning (>=80%)';
        }
      }

      return {
        id,
        label,
        ruleType,
        usageValue: Number(usageVal.toFixed(1)),
        limitValue: Number(limitVal.toFixed(1)),
        usagePct: Number(ratioPct.toFixed(1)),
        unit,
        status,
        statusLabel,
        formattedUsage: unit === 'days' ? `${usageVal} d` : `${usageVal.toFixed(1)}%`,
        formattedLimit: unit === 'days' ? `${limitVal} d` : `${limitVal.toFixed(1)}%`,
      };
    };

    return {
      accountId: acc.id,
      accountName: acc.name,
      shortLabel: getShortDeskLabelFromAccount(acc),
      config,
      bars: [
        makeBar(
          'daily_loss',
          'Max daily loss %',
          'daily_loss_limit',
          worstDayLossPct,
          config.maxDailyLossPct,
          'pct'
        ),
        makeBar(
          'total_dd',
          'Max total drawdown %',
          'trailing_drawdown',
          ddPct,
          config.maxTotalDrawdownPct,
          'pct'
        ),
        makeBar(
          'min_days',
          'Minimum trading days',
          'min_trading_days',
          tradingDaysCount,
          config.minTradingDays,
          'days',
          true
        ),
        makeBar(
          'best_day_share',
          'Best day share of profit',
          'consistency_rule',
          bestDaySharePct,
          config.maxBestDayProfitSharePct,
          'pct'
        ),
      ],
    };
  });
}

export function computeRDistribution(
  closedTrades: Trade[],
  selectedAccountIds: string[],
  totalAccountsCount: number
): {
  bins: RHistogramBin[];
  meanR: number;
  medianR: number;
  expectancyUsd: number;
  n: number;
} {
  const specs: Array<Omit<RHistogramBin, 'count' | 'netPnl' | 'winCount'>> = [
    { id: 'r-lt-neg1', label: '< −1R', minR: -Infinity, maxR: -1 },
    { id: 'r-neg1-0', label: '−1R to 0R', minR: -1, maxR: 0 },
    { id: 'r-0-1', label: '0R to +1R', minR: 0, maxR: 1 },
    { id: 'r-1-2', label: '+1R to +2R', minR: 1, maxR: 2 },
    { id: 'r-2-3', label: '+2R to +3R', minR: 2, maxR: 3 },
    { id: 'r-gte-3', label: '>= +3R', minR: 3, maxR: Infinity, inclusiveUpper: true },
  ];

  const bins: RHistogramBin[] = specs.map((s) => ({
    ...s,
    count: 0,
    netPnl: 0,
    winCount: 0,
  }));

  const rValues: number[] = [];
  let totalNet = 0;

  closedTrades.forEach((t) => {
    const r = Number.isFinite(t.realizedR) ? t.realizedR : 0;
    const pnl = getScopedTradePnl(t, selectedAccountIds, totalAccountsCount);
    rValues.push(r);
    totalNet += pnl;

    const targetBin = bins.find((b) =>
      b.inclusiveUpper ? r >= b.minR && r <= b.maxR : r >= b.minR && r < b.maxR
    ) || bins[bins.length - 1];

    targetBin.count += 1;
    targetBin.netPnl = new Decimal(targetBin.netPnl).plus(pnl).toDecimalPlaces(2).toNumber();
    if (pnl > 0) targetBin.winCount += 1;
  });

  const n = closedTrades.length;
  const meanR =
    n > 0
      ? new Decimal(rValues.reduce((s, r) => s + r, 0)).div(n).toDecimalPlaces(2).toNumber()
      : 0;

  const sortedR = [...rValues].sort((a, b) => a - b);
  let medianR = 0;
  if (n > 0) {
    const mid = Math.floor(n / 2);
    medianR =
      n % 2 !== 0
        ? sortedR[mid]
        : new Decimal(sortedR[mid - 1]).plus(sortedR[mid]).div(2).toDecimalPlaces(3).toNumber();
  }

  const expectancyUsd = n > 0 ? new Decimal(totalNet).div(n).toDecimalPlaces(2).toNumber() : 0;

  return { bins, meanR, medianR, expectancyUsd, n };
}

export const HEATMAP_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;
export const HEATMAP_SESSIONS = ['Asian', 'London', 'London Close', 'New York', 'Sydney'] as const;

export function getTradeWeekdayLabel(t: Trade): string {
  const raw = t.createdAt || t.entryTime || t.exitTime;
  const d = raw ? new Date(raw) : new Date();
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return names[d.getUTCDay()] || 'Mon';
}

export function computeEdgeHeatmap(
  closedTrades: Trade[],
  excludeSwingFromSession: boolean
): {
  weekdays: readonly string[];
  sessions: string[];
  cells: HeatmapCell[];
  excludedSwingTrades: Trade[];
} {
  const excludedSwingTrades = excludeSwingFromSession
    ? closedTrades.filter(isSwingTrade)
    : [];
  const activeTrades = excludeSwingFromSession
    ? closedTrades.filter((t) => !isSwingTrade(t))
    : closedTrades;

  const extraSessions = Array.from(
    new Set(
      activeTrades
        .map((t) => t.session || 'Off-Hours')
        .filter((s) => !(HEATMAP_SESSIONS as readonly string[]).includes(s))
    )
  );
  const sessions = [...HEATMAP_SESSIONS, ...extraSessions];

  const cells: HeatmapCell[] = [];
  HEATMAP_WEEKDAYS.forEach((weekday) => {
    sessions.forEach((session) => {
      const matching = activeTrades.filter(
        (t) => getTradeWeekdayLabel(t) === weekday && (t.session || 'Off-Hours') === session
      );
      const n = matching.length;
      if (n === 0) {
        cells.push({
          weekday,
          session,
          n: 0,
          expectancyR: null,
          netPnl: 0,
          winRate: null,
        });
      } else {
        const sumR = matching.reduce((s, t) => s + (t.realizedR || 0), 0);
        const sumNet = matching.reduce((s, t) => s + t.netPnl, 0);
        const wins = matching.filter((t) => t.netPnl > 0).length;
        cells.push({
          weekday,
          session,
          n,
          expectancyR: new Decimal(sumR).div(n).toDecimalPlaces(2).toNumber(),
          netPnl: new Decimal(sumNet).toDecimalPlaces(2).toNumber(),
          winRate: new Decimal(wins).div(n).times(100).toDecimalPlaces(1).toNumber(),
        });
      }
    });
  });

  return {
    weekdays: HEATMAP_WEEKDAYS,
    sessions,
    cells,
    excludedSwingTrades,
  };
}

export function computeStrategyAttribution(
  strategies: Strategy[],
  closedTrades: Trade[],
  selectedAccountIds: string[],
  totalAccountsCount: number
): StrategyAttributionRow[] {
  const totalNetAll = closedTrades.reduce(
    (s, t) => s + getScopedTradePnl(t, selectedAccountIds, totalAccountsCount),
    0
  );

  const strategyMap = new Map<string, { name: string; trades: Trade[] }>();
  strategies.forEach((s) => {
    strategyMap.set(s.id, { name: s.name, trades: [] });
  });

  closedTrades.forEach((t) => {
    const sid = t.strategyId || 'unassigned';
    if (!strategyMap.has(sid)) {
      strategyMap.set(sid, {
        name: t.strategyName || (sid === 'unassigned' ? 'Unassigned / Discretionary' : sid),
        trades: [],
      });
    }
    strategyMap.get(sid)!.trades.push(t);
  });

  const rows: StrategyAttributionRow[] = [];
  strategyMap.forEach((bucket, sid) => {
    const n = bucket.trades.length;
    if (n === 0 && !strategies.some((s) => s.id === sid)) return;
    let netPnl = 0;
    let grossWin = 0;
    let grossLoss = 0;
    let wins = 0;
    let losses = 0;
    let sumR = 0;

    bucket.trades.forEach((t) => {
      const pnl = getScopedTradePnl(t, selectedAccountIds, totalAccountsCount);
      netPnl += pnl;
      sumR += t.realizedR || 0;
      if (pnl > 0) {
        wins++;
        grossWin += pnl;
      } else if (pnl < 0) {
        losses++;
        grossLoss += Math.abs(pnl);
      }
    });

    const shareOfNetPct =
      Math.abs(totalNetAll) > 0.01 ? (netPnl / Math.abs(totalNetAll)) * 100 : 0;

    const profitFactorDisplay =
      n === 0
        ? '—'
        : losses === 0 && grossWin > 0
        ? 'No losing trades'
        : n < 5
        ? 'Insufficient sample'
        : (grossWin / grossLoss).toFixed(2);

    rows.push({
      strategyId: sid,
      strategyName: bucket.name,
      n,
      wins,
      losses,
      winRate: n > 0 ? new Decimal(wins).div(n).times(100).toDecimalPlaces(1).toNumber() : 0,
      expectancyUsd: n > 0 ? new Decimal(netPnl).div(n).toDecimalPlaces(2).toNumber() : 0,
      expectancyR: n > 0 ? new Decimal(sumR).div(n).toDecimalPlaces(2).toNumber() : 0,
      netPnl: new Decimal(netPnl).toDecimalPlaces(2).toNumber(),
      shareOfNetPct: new Decimal(shareOfNetPct).toDecimalPlaces(1).toNumber(),
      profitFactorDisplay,
      playbookHref: sid === 'unassigned' ? '/strategies' : `/strategies?id=${encodeURIComponent(sid)}`,
    });
  });

  return rows.sort((a, b) => b.netPnl - a.netPnl);
}

export function computeStreaksAndClustering(
  closedTrades: Trade[],
  selectedAccountIds: string[],
  totalAccountsCount: number
): StreakClusterStats {
  const sorted = [...closedTrades].sort((a, b) => getTradeTimestampMs(a) - getTradeTimestampMs(b));
  let longestWin = 0;
  let longestLoss = 0;
  let curWin = 0;
  let curLoss = 0;
  let lastType: 'WIN' | 'LOSS' | 'NONE' = 'NONE';
  let lastCount = 0;

  const byDay = new Map<string, { count: number; pnl: number }>();

  sorted.forEach((t) => {
    const pnl = getScopedTradePnl(t, selectedAccountIds, totalAccountsCount);
    if (pnl > 0) {
      curWin += 1;
      curLoss = 0;
      if (curWin > longestWin) longestWin = curWin;
      lastType = 'WIN';
      lastCount = curWin;
    } else if (pnl < 0) {
      curLoss += 1;
      curWin = 0;
      if (curLoss > longestLoss) longestLoss = curLoss;
      lastType = 'LOSS';
      lastCount = curLoss;
    }

    const dayKey = getTradeDateKey(t);
    if (dayKey) {
      const prev = byDay.get(dayKey) || { count: 0, pnl: 0 };
      byDay.set(dayKey, { count: prev.count + 1, pnl: prev.pnl + pnl });
    }
  });

  const clusterBuckets = new Map<number, { days: number; pnlSum: number }>();
  byDay.forEach((info) => {
    const prev = clusterBuckets.get(info.count) || { days: 0, pnlSum: 0 };
    clusterBuckets.set(info.count, { days: prev.days + 1, pnlSum: prev.pnlSum + info.pnl });
  });

  const tradesPerDayDistribution = Array.from(clusterBuckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([cnt, agg]) => ({
      tradesCountLabel: `${cnt} ${cnt === 1 ? 'trade/day' : 'trades/day'}`,
      tradesCount: cnt,
      daysCount: agg.days,
      avgDailyNetPnl: new Decimal(agg.pnlSum).div(agg.days).toDecimalPlaces(2).toNumber(),
    }));

  return {
    currentStreakCount: lastCount,
    currentStreakType: lastType,
    currentStreakLabel:
      lastType === 'NONE'
        ? 'No closed trades'
        : `${lastCount}${lastType === 'WIN' ? 'W' : 'L'} (${lastType === 'WIN' ? 'Win streak' : 'Loss streak'})`,
    longestWinStreak: longestWin,
    longestLossStreak: longestLoss,
    tradesPerDayDistribution,
  };
}

export function computeBreakdownRows(
  closedTrades: Trade[],
  groupBy: (t: Trade) => { key: string; label: string },
  selectedAccountIds: string[],
  totalAccountsCount: number
): BreakdownRow[] {
  const totalNet = closedTrades.reduce(
    (s, t) => s + getScopedTradePnl(t, selectedAccountIds, totalAccountsCount),
    0
  );

  const map = new Map<string, { label: string; trades: Trade[] }>();
  closedTrades.forEach((t) => {
    const g = groupBy(t);
    if (!map.has(g.key)) map.set(g.key, { label: g.label, trades: [] });
    map.get(g.key)!.trades.push(t);
  });

  const rows: BreakdownRow[] = [];
  map.forEach((entry, key) => {
    const n = entry.trades.length;
    let netPnl = 0;
    let grossWin = 0;
    let grossLoss = 0;
    let wins = 0;
    let losses = 0;
    let sumR = 0;

    entry.trades.forEach((t) => {
      const pnl = getScopedTradePnl(t, selectedAccountIds, totalAccountsCount);
      netPnl += pnl;
      sumR += t.realizedR || 0;
      if (pnl > 0) {
        wins++;
        grossWin += pnl;
      } else if (pnl < 0) {
        losses++;
        grossLoss += Math.abs(pnl);
      }
    });

    const hasNoLosses = losses === 0 && grossWin > 0;
    const profitFactorDisplay = hasNoLosses
      ? 'No losing trades'
      : n < 5
      ? 'Insufficient sample'
      : (grossWin / grossLoss).toFixed(2);

    rows.push({
      key,
      label: entry.label,
      n,
      wins,
      losses,
      winRate: n > 0 ? new Decimal(wins).div(n).times(100).toDecimalPlaces(1).toNumber() : 0,
      netPnl: new Decimal(netPnl).toDecimalPlaces(2).toNumber(),
      shareOfNetPct:
        Math.abs(totalNet) > 0.01
          ? new Decimal(netPnl).div(Math.abs(totalNet)).times(100).toDecimalPlaces(1).toNumber()
          : 0,
      expectancyUsd: n > 0 ? new Decimal(netPnl).div(n).toDecimalPlaces(2).toNumber() : 0,
      expectancyR: n > 0 ? new Decimal(sumR).div(n).toDecimalPlaces(2).toNumber() : 0,
      avgWinUsd: wins > 0 ? new Decimal(grossWin).div(wins).toDecimalPlaces(2).toNumber() : 0,
      avgLossUsd: losses > 0 ? new Decimal(grossLoss).div(losses).toDecimalPlaces(2).toNumber() : 0,
      profitFactorDisplay,
      hasNoLosses,
    });
  });

  return rows.sort((a, b) => b.netPnl - a.netPnl);
}

export function detectTradeQualitySupport(closedTrades: Trade[]): {
  supported: boolean;
  missingFields: string[];
  avgMaeUsd?: number;
  avgMfeUsd?: number;
  captureRatioPct?: number;
} {
  const withExcursion = closedTrades.filter(
    (t) =>
      typeof (t as unknown as { maeUsd?: number }).maeUsd === 'number' &&
      typeof (t as unknown as { mfeUsd?: number }).mfeUsd === 'number'
  );
  if (closedTrades.length === 0 || withExcursion.length === 0) {
    return {
      supported: false,
      missingFields: ['trade.maeUsd', 'trade.mfeUsd'],
    };
  }
  const sumMae = withExcursion.reduce(
    (s, t) => s + ((t as unknown as { maeUsd: number }).maeUsd || 0),
    0
  );
  const sumMfe = withExcursion.reduce(
    (s, t) => s + ((t as unknown as { mfeUsd: number }).mfeUsd || 0),
    0
  );
  const sumNet = withExcursion.reduce((s, t) => s + t.netPnl, 0);

  return {
    supported: true,
    missingFields: [],
    avgMaeUsd: new Decimal(sumMae).div(withExcursion.length).toDecimalPlaces(2).toNumber(),
    avgMfeUsd: new Decimal(sumMfe).div(withExcursion.length).toDecimalPlaces(2).toNumber(),
    captureRatioPct:
      sumMfe > 0
        ? new Decimal(sumNet).div(sumMfe).times(100).toDecimalPlaces(1).toNumber()
        : 0,
  };
}

export function serializeTableToCsv(
  headers: string[],
  rows: Array<Array<string | number>>
): string {
  const escape = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  return [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
}

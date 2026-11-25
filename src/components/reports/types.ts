import { Trade, TradingAccount } from '../../lib/types/financial';

export type ReportTabId = 'EXECUTIVE' | 'PROP_EVAL' | 'STRATEGY' | 'RISK';

export interface StrategyBreakdownItem {
  name: string;
  shortName: string;
  count: number;
  wins: number;
  losses: number;
  pnl: number;
  totalR: number;
  avgR: number;
  winRate: number;
  sharePct: number;
  color: string;
}

export interface SessionBreakdownItem {
  name: string;
  count: number;
  sharePct: number;
  color: string;
}

export interface RuleSummaryItem {
  id: string;
  title: string;
  headline: string;
  subtitle: string;
  requirement: string;
  observed: string;
  status: 'clear' | 'pending' | 'breached' | 'verified';
  statusLabel: string;
  pct: number;
  color: string;
}

export interface DayPerformanceItem {
  dateKey: string;
  label: string;
  netPnl: number;
}

export interface DrawdownPoint {
  index: number;
  label: string;
  symbol: string;
  cumulativePnl: number;
  peakPnl: number;
  drawdownDollars: number;
  dateStr: string;
}

export interface ReportComputedData {
  closedTrades: Trade[];
  activeAccount: TradingAccount | null;
  scopeLabel: string;
  accountCount: number;
  periodLabel: string;
  auditRefId: string;
  reportTimestamp: string;
  dateRangeChip: string;

  // Core executive totals
  netProfit: number;
  grossProfit: number;
  grossLoss: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  profitFactor: number;
  avgR: number;
  totalR: number;
  largestLossTrade: Trade | null;
  largestLossR: number;
  largestLossPnl: number;

  // Attribution & sessions
  strategies: StrategyBreakdownItem[];
  sessions: SessionBreakdownItem[];

  // Rules & compliance
  rules: RuleSummaryItem[];
  clearRulesCount: number;
  pendingRulesCount: number;
  breachedRulesCount: number;
  minDaysCompleted: number;
  minDaysRequired: number;
  completedDays: DayPerformanceItem[];
  lowestDay: DayPerformanceItem | null;
  maxRiskPerTradePct: number;
  equityNeverBelowStart: boolean;
  lowestCloseDelta: number;

  // Drawdown & stress
  drawdownSeries: DrawdownPoint[];
  maxDrawdownDollars: number;
  maxDrawdownPctOfPeak: number;
  peakProfitDollars: number;
  troughTrade: Trade | null;
  recoveryTrades: number;
  longestDrawdownTrades: number;
  recoveryFactor: number;
  longestWinStreak: number;
  longestLossStreak: number;
  tradesUnderwaterCount: number;
}

export function formatSignedCurrency(val: number): string {
  const abs = Math.abs(val);
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  if (val > 0) return `+${formatted}`;
  if (val < 0) return `−${formatted}`;
  return formatted;
}

export function formatSignedR(val: number): string {
  const abs = Math.abs(val).toFixed(2);
  if (val > 0) return `+${abs}R`;
  if (val < 0) return `−${abs}R`;
  return `0.00R`;
}

export function formatShortDateLabel(isoOrDate?: string): string {
  if (!isoOrDate) return '—';
  const d = new Date(isoOrDate);
  if (Number.isNaN(d.getTime())) return isoOrDate.slice(0, 10);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

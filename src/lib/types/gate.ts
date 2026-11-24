import { Decimal } from 'decimal.js';

export type AccountTypeCategory = 'evaluation' | 'funded' | 'payout' | 'live';
export type PhaseStatus = 'active' | 'passed' | 'failed' | 'paused';
export type DailyLossMode = 'pct_day_start' | 'fixed_amount';
export type TotalLossMode = 'static_start' | 'trailing_peak';
export type GateStatus = 'allowed' | 'warning' | 'blocked' | 'locked';
export type EnforcementMode = 'enforce' | 'warn_only';

export interface FirmRuleTemplate {
  id: string;
  firmId: string;
  firmName: string;
  phase: number | null; // 1, 2, or null
  dailyLossPct: number; // e.g. 5.0 for 5%
  totalLossPct: number; // e.g. 10.0 for 10%
  totalLossMode: TotalLossMode;
  profitTargetPct: number | null; // e.g. 10.0 for 10%
  minTradingDays: number | null; // e.g. 4
  maxRiskPerTradePct: number | null; // e.g. 1.0 for 1%
  newsRestricted: boolean;
  weekendHold: boolean;
}

export interface PersonalizedAccount {
  id: string;
  userId: string;
  label: string;
  brokerOrFirmId: string | null;
  accountType: AccountTypeCategory;
  baseCurrency: string;
  startingBalance: string; // Decimal string: e.g. "100000.00"
  currentBalance: string;
  currentEquity: string;
  peakEquity: string;
  dailyStartEquity: string;
  phase: number | null;
  phaseStatus: PhaseStatus;
  notes?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface RuleSet {
  id: string;
  accountId: string;
  version: number;
  createdBy?: string;
  createdAt: string;
  effectiveFrom: string;
  dailyLossMode: DailyLossMode;
  dailyLossValue: string; // Decimal string: e.g. "5.0" (%) or "5000.00" ($)
  dailyResetLocalTime: string; // "HH:MM", e.g. "00:00"
  dailyResetTimezone: string; // IANA timezone, e.g. "America/New_York", "UTC"
  totalLossMode: TotalLossMode;
  totalLossValue: string; // Decimal string: e.g. "10.0" (%)
  warnThresholdPct: number; // 50 to 99, default 80
  enforcement: EnforcementMode;
  profitTargetValue?: string | null;
  minTradingDays?: number | null;
  maxRiskPerTradePct?: string | null;
  isActive: boolean;
}

export interface GateState {
  accountId: string;
  computedAt: string;
  dailyLossUsedAmount: string; // e.g. "0.00"
  dailyLossLimitAmount: string; // e.g. "5000.00"
  dailyLossUsedPct: string; // e.g. "0.00"
  totalLossUsedAmount: string; // e.g. "0.00"
  totalLossLimitAmount: string; // e.g. "10000.00"
  totalLossUsedPct: string; // e.g. "0.00"
  profitProgressAmount: string; // e.g. "0.00"
  profitTargetAmount?: string | null;
  profitProgressPct?: string;
  status: GateStatus;
  blockingRule: string | null; // 'daily_loss' | 'total_loss' | null
  nextResetAt: string; // ISO UTC string
  cacheExpiresAt?: string;
}

export interface RFC9457ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  invalid_params?: Array<{
    name: string;
    reason: string;
  }>;
  blocking_rule?: string | null;
  next_reset_at?: string;
}

export interface AuditEvent {
  id: string;
  accountId: string;
  actor: string;
  eventType: string;
  beforeState?: unknown;
  afterState?: unknown;
  reason?: string;
  requestId?: string;
  createdAt: string;
}

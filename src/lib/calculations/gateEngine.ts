import { Decimal } from 'decimal.js';
import {
  PersonalizedAccount,
  RuleSet,
  FirmRuleTemplate,
  GateState,
  GateStatus,
  DailyLossMode,
  TotalLossMode,
} from '../types/gate';

// Set Decimal precision and rounding mode for financial ledger arithmetic
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

/**
 * Checks if a string is a valid IANA timezone identifier
 */
export function isValidIanaTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Extracts local date/time parts in a given timezone
 */
export function getLocalParts(date: Date, timezone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const m: Record<string, string> = {};
  for (const p of parts) {
    m[p.type] = p.value;
  }

  return {
    year: parseInt(m.year, 10),
    month: parseInt(m.month, 10),
    day: parseInt(m.day, 10),
    hour: parseInt(m.hour === '24' ? '0' : m.hour, 10),
    minute: parseInt(m.minute, 10),
    second: parseInt(m.second, 10),
  };
}

/**
 * Converts a target local date/time in an IANA timezone into its exact UTC Date.
 * Handles DST shifts through iterative convergence.
 */
export function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string
): Date {
  let guessUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 4; i++) {
    const local = getLocalParts(new Date(guessUtc), timezone);
    const localUtcEquivalent = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second
    );
    const targetUtcEquivalent = Date.UTC(year, month - 1, day, hour, minute, 0);
    const diff = localUtcEquivalent - targetUtcEquivalent;
    if (diff === 0) break;
    guessUtc -= diff;
  }
  return new Date(guessUtc);
}

/**
 * Calculates the next UTC instant when daily_reset_local_time trips in daily_reset_timezone.
 */
export function calculateNextResetInstant(
  localTime: string,
  timezone: string,
  now: Date = new Date()
): Date {
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!timeRegex.test(localTime)) {
    throw new Error(`Invalid local time format "${localTime}". Expected "HH:MM".`);
  }
  if (!isValidIanaTimezone(timezone)) {
    throw new Error(`Invalid IANA timezone "${timezone}".`);
  }

  const [targetH, targetM] = localTime.split(':').map((v) => parseInt(v, 10));
  const nowLocal = getLocalParts(now, timezone);

  let targetYear = nowLocal.year;
  let targetMonth = nowLocal.month;
  let targetDay = nowLocal.day;

  // If the reset time has already passed today in the target timezone, advance to tomorrow
  if (
    nowLocal.hour > targetH ||
    (nowLocal.hour === targetH && nowLocal.minute >= targetM)
  ) {
    const tempTomorrow = new Date(
      Date.UTC(targetYear, targetMonth - 1, targetDay + 1, 12, 0, 0)
    );
    const nextLocal = getLocalParts(tempTomorrow, timezone);
    targetYear = nextLocal.year;
    targetMonth = nextLocal.month;
    targetDay = nextLocal.day;
  }

  return zonedDateTimeToUtc(targetYear, targetMonth, targetDay, targetH, targetM, timezone);
}

export interface RuleSetDraft {
  dailyLossMode: DailyLossMode;
  dailyLossValue: string | number;
  dailyResetLocalTime: string;
  dailyResetTimezone: string;
  totalLossMode: TotalLossMode;
  totalLossValue: string | number;
  warnThresholdPct: number;
  enforcement?: 'enforce' | 'warn_only';
  profitTargetValue?: string | number | null;
  minTradingDays?: number | null;
  maxRiskPerTradePct?: string | number | null;
}

export interface ValidationResult {
  isValid: boolean;
  errors: Array<{
    name: string;
    reason: string;
  }>;
}

/**
 * Validates a RuleSet against schema bounds and firm ceiling templates.
 * Trader limits must be no looser than the firm ceiling for that account's phase.
 */
export function validateRuleSetAgainstFirmCeiling(
  draft: RuleSetDraft,
  startingBalance: string | number,
  firmTemplate?: FirmRuleTemplate | null
): ValidationResult {
  const errors: Array<{ name: string; reason: string }> = [];

  const startBal = new Decimal(startingBalance || 0);
  if (startBal.lessThanOrEqualTo(0)) {
    errors.push({
      name: 'startingBalance',
      reason: 'Starting balance must be greater than 0.00.',
    });
  }

  // 1. Validate Timezone & Reset Time
  if (!draft.dailyResetTimezone || !isValidIanaTimezone(draft.dailyResetTimezone)) {
    errors.push({
      name: 'dailyResetTimezone',
      reason: `"${draft.dailyResetTimezone}" is not a valid IANA timezone identifier.`,
    });
  }

  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (!draft.dailyResetLocalTime || !timeRegex.test(draft.dailyResetLocalTime)) {
    errors.push({
      name: 'dailyResetLocalTime',
      reason: 'Reset time must be in HH:MM 24-hour format (e.g. "00:00" or "17:00").',
    });
  }

  // 2. Validate Daily Loss Value
  let dailyLossDec: Decimal;
  try {
    dailyLossDec = new Decimal(draft.dailyLossValue);
  } catch {
    dailyLossDec = new Decimal(NaN);
  }

  if (dailyLossDec.isNaN() || dailyLossDec.lessThanOrEqualTo(0)) {
    errors.push({
      name: 'dailyLossValue',
      reason: 'Daily loss limit must be a positive number greater than 0.',
    });
  } else if (draft.dailyLossMode === 'pct_day_start') {
    if (dailyLossDec.lessThan(0.1) || dailyLossDec.greaterThan(20.0)) {
      errors.push({
        name: 'dailyLossValue',
        reason: 'Daily loss percentage must be between 0.1% and 20.0%.',
      });
    }
  } else if (draft.dailyLossMode === 'fixed_amount') {
    if (startBal.greaterThan(0) && dailyLossDec.greaterThan(startBal)) {
      errors.push({
        name: 'dailyLossValue',
        reason: `Daily loss fixed amount cannot exceed starting balance of $${startBal.toFixed(2)}.`,
      });
    }
  }

  // 3. Validate Total Loss Value
  let totalLossDec: Decimal;
  try {
    totalLossDec = new Decimal(draft.totalLossValue);
  } catch {
    totalLossDec = new Decimal(NaN);
  }

  if (totalLossDec.isNaN() || totalLossDec.lessThanOrEqualTo(0)) {
    errors.push({
      name: 'totalLossValue',
      reason: 'Total loss limit must be a positive number greater than 0.',
    });
  } else if (totalLossDec.lessThan(0.5) || totalLossDec.greaterThan(50.0)) {
    errors.push({
      name: 'totalLossValue',
      reason: 'Total loss limit percentage must be between 0.5% and 50.0%.',
    });
  }

  // 4. Validate Warning Threshold
  const warnPct = Number(draft.warnThresholdPct);
  if (isNaN(warnPct) || warnPct < 50 || warnPct > 99) {
    errors.push({
      name: 'warnThresholdPct',
      reason: 'Warning threshold must be an integer between 50% and 99%.',
    });
  }

  // 5. Compare Against Firm Ceiling (if template exists)
  if (firmTemplate) {
    // Check daily loss ceiling
    const firmDailyCeilingPct = new Decimal(firmTemplate.dailyLossPct);
    let traderEffectiveDailyPct: Decimal;

    if (draft.dailyLossMode === 'pct_day_start') {
      traderEffectiveDailyPct = dailyLossDec;
    } else {
      // Fixed amount as pct of starting balance
      traderEffectiveDailyPct = startBal.greaterThan(0)
        ? dailyLossDec.dividedBy(startBal).times(100)
        : new Decimal(0);
    }

    if (traderEffectiveDailyPct.greaterThan(firmDailyCeilingPct)) {
      errors.push({
        name: 'dailyLossValue',
        reason: `Trader daily loss limit (${traderEffectiveDailyPct.toFixed(2)}%) cannot be looser than the firm ceiling of ${firmDailyCeilingPct.toFixed(2)}%.`,
      });
    }

    // Check total loss ceiling
    const firmTotalCeilingPct = new Decimal(firmTemplate.totalLossPct);
    if (totalLossDec.greaterThan(firmTotalCeilingPct)) {
      errors.push({
        name: 'totalLossValue',
        reason: `Trader total loss limit (${totalLossDec.toFixed(2)}%) cannot be looser than the firm ceiling of ${firmTotalCeilingPct.toFixed(2)}%.`,
      });
    }

    // Check total loss mode restriction if firm specifies trailing peak
    if (firmTemplate.totalLossMode === 'trailing_peak' && draft.totalLossMode === 'static_start') {
      errors.push({
        name: 'totalLossMode',
        reason: `The firm "${firmTemplate.firmName}" mandates trailing peak drawdown; static start is not permitted.`,
      });
    }

    // Check max risk per trade if firm defines it
    if (firmTemplate.maxRiskPerTradePct && draft.maxRiskPerTradePct) {
      const traderRisk = new Decimal(draft.maxRiskPerTradePct);
      const firmRisk = new Decimal(firmTemplate.maxRiskPerTradePct);
      if (traderRisk.greaterThan(firmRisk)) {
        errors.push({
          name: 'maxRiskPerTradePct',
          reason: `Max risk per trade (${traderRisk.toFixed(2)}%) cannot exceed the firm ceiling of ${firmRisk.toFixed(2)}%.`,
        });
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export interface GateEngineInput {
  account: PersonalizedAccount;
  ruleSet: RuleSet;
  firmTemplate?: FirmRuleTemplate | null;
  currentEquity: string | number;
  peakEquity?: string | number;
  dailyStartEquity?: string | number;
  openFloatingPnl?: string | number;
  now?: Date;
}

/**
 * Computes the real-time GateState for an account.
 * Pure function: completely deterministic, no floating point arithmetic.
 */
export function computeGateState(input: GateEngineInput): GateState {
  const { account, ruleSet, firmTemplate } = input;
  const now = input.now || new Date();

  const startBalance = new Decimal(account.startingBalance);
  const floatingPnl = new Decimal(input.openFloatingPnl || 0);

  // Current equity including open-trade floating P&L
  const currentEquity = new Decimal(input.currentEquity).plus(floatingPnl);

  // Peak equity: rises and never falls
  const recordedPeak = new Decimal(input.peakEquity || account.peakEquity || startBalance);
  const effectivePeakEquity = Decimal.max(recordedPeak, currentEquity);

  // Start-of-day equity: captured at reset local time
  const dailyStartEquity = new Decimal(input.dailyStartEquity || account.dailyStartEquity || startBalance);

  // 1. DAILY LOSS CALCULATION
  // Loss is positive; gains reduce usage and never go negative (floor at 0)
  const dailyDiff = dailyStartEquity.minus(currentEquity);
  const dailyLossUsedAmount = Decimal.max(0, dailyDiff);

  let dailyLossLimitAmount: Decimal;
  if (ruleSet.dailyLossMode === 'pct_day_start') {
    const dailyPct = new Decimal(ruleSet.dailyLossValue).dividedBy(100);
    dailyLossLimitAmount = dailyStartEquity.times(dailyPct);
  } else {
    dailyLossLimitAmount = new Decimal(ruleSet.dailyLossValue);
  }

  const dailyLossUsedPct = dailyLossLimitAmount.greaterThan(0)
    ? dailyLossUsedAmount.dividedBy(dailyLossLimitAmount).times(100)
    : new Decimal(0);

  // 2. TOTAL LOSS CALCULATION
  let totalLossLimitAmount: Decimal;
  let totalLossUsedAmount: Decimal;

  const totalLossPct = new Decimal(ruleSet.totalLossValue).dividedBy(100);

  if (ruleSet.totalLossMode === 'static_start') {
    // Floor = starting_balance * (1 - total_loss_value)
    totalLossLimitAmount = startBalance.times(totalLossPct);
    const totalDiff = startBalance.minus(currentEquity);
    totalLossUsedAmount = Decimal.max(0, totalDiff);
  } else {
    // Trailing peak: floor = peak_equity * (1 - total_loss_value)
    totalLossLimitAmount = effectivePeakEquity.times(totalLossPct);
    const totalDiff = effectivePeakEquity.minus(currentEquity);
    totalLossUsedAmount = Decimal.max(0, totalDiff);
  }

  const totalLossUsedPct = totalLossLimitAmount.greaterThan(0)
    ? totalLossUsedAmount.dividedBy(totalLossLimitAmount).times(100)
    : new Decimal(0);

  // 3. PROFIT PROGRESS CALCULATION
  const profitProgressAmount = Decimal.max(0, currentEquity.minus(startBalance));
  let profitTargetAmount: Decimal | null = null;
  let profitProgressPct: Decimal | undefined;

  const targetValue = ruleSet.profitTargetValue || firmTemplate?.profitTargetPct;
  if (targetValue) {
    const targetPct = new Decimal(targetValue).dividedBy(100);
    profitTargetAmount = startBalance.times(targetPct);
    if (profitTargetAmount.greaterThan(0)) {
      profitProgressPct = profitProgressAmount.dividedBy(profitTargetAmount).times(100);
    }
  }

  // 4. GATE STATUS DETERMINATION
  // Status:
  //   allowed: < warn_threshold_pct
  //   warning: >= warn_threshold_pct and < 100
  //   blocked: >= 100 for total loss (or explicit failed status)
  //   locked: blocked on daily rule until next_reset_at (dailyLossUsedPct >= 100)
  const warnThreshold = new Decimal(ruleSet.warnThresholdPct || 80);

  let status: GateStatus = 'allowed';
  let blockingRule: string | null = null;

  if (account.phaseStatus === 'failed') {
    status = 'blocked';
    blockingRule = 'account_failed';
  } else if (totalLossUsedPct.greaterThanOrEqualTo(100)) {
    status = 'blocked';
    blockingRule = 'total_loss';
  } else if (dailyLossUsedPct.greaterThanOrEqualTo(100)) {
    status = 'locked';
    blockingRule = 'daily_loss';
  } else if (
    dailyLossUsedPct.greaterThanOrEqualTo(warnThreshold) ||
    totalLossUsedPct.greaterThanOrEqualTo(warnThreshold)
  ) {
    status = 'warning';
  }

  // 5. NEXT RESET TIME
  const nextResetDate = calculateNextResetInstant(
    ruleSet.dailyResetLocalTime || '00:00',
    ruleSet.dailyResetTimezone || 'UTC',
    now
  );

  return {
    accountId: account.id,
    computedAt: now.toISOString(),
    dailyLossUsedAmount: dailyLossUsedAmount.toFixed(2),
    dailyLossLimitAmount: dailyLossLimitAmount.toFixed(2),
    dailyLossUsedPct: dailyLossUsedPct.toFixed(2),
    totalLossUsedAmount: totalLossUsedAmount.toFixed(2),
    totalLossLimitAmount: totalLossLimitAmount.toFixed(2),
    totalLossUsedPct: totalLossUsedPct.toFixed(2),
    profitProgressAmount: profitProgressAmount.toFixed(2),
    profitTargetAmount: profitTargetAmount ? profitTargetAmount.toFixed(2) : null,
    profitProgressPct: profitProgressPct ? profitProgressPct.toFixed(2) : undefined,
    status,
    blockingRule,
    nextResetAt: nextResetDate.toISOString(),
    cacheExpiresAt: new Date(now.getTime() + 5000).toISOString(), // 5-second read-through cache
  };
}

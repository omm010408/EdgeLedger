import { describe, it, expect } from 'vitest';
import {
  computeGateState,
  validateRuleSetAgainstFirmCeiling,
  calculateNextResetInstant,
  isValidIanaTimezone,
} from '../gateEngine';
import {
  PersonalizedAccount,
  RuleSet,
  FirmRuleTemplate,
} from '../../types/gate';

describe('Personalized Rules & Gate Engine', () => {
  const mockAccount: PersonalizedAccount = {
    id: 'acc-test-1',
    userId: 'user-1',
    label: 'Apex 100K Test',
    brokerOrFirmId: 'apex',
    accountType: 'evaluation',
    baseCurrency: 'USD',
    startingBalance: '100000.00',
    currentBalance: '100000.00',
    currentEquity: '100000.00',
    peakEquity: '100000.00',
    dailyStartEquity: '100000.00',
    phase: 1,
    phaseStatus: 'active',
    version: 1,
    createdAt: '2026-11-24T00:00:00Z',
    updatedAt: '2026-11-24T00:00:00Z',
  };

  const mockRuleSet: RuleSet = {
    id: 'ruleset-1',
    accountId: 'acc-test-1',
    version: 1,
    createdAt: '2026-11-24T00:00:00Z',
    effectiveFrom: '2026-11-24T00:00:00Z',
    dailyLossMode: 'pct_day_start',
    dailyLossValue: '5.0', // 5% = $5,000.00
    dailyResetLocalTime: '00:00',
    dailyResetTimezone: 'UTC',
    totalLossMode: 'static_start',
    totalLossValue: '10.0', // 10% = $10,000.00
    warnThresholdPct: 80,
    enforcement: 'enforce',
    profitTargetValue: '10.0', // 10% = $10,000.00
    minTradingDays: 4,
    maxRiskPerTradePct: '1.0',
    isActive: true,
  };

  const mockFirmTemplate: FirmRuleTemplate = {
    id: 'firm-ftmo-1',
    firmId: 'ftmo',
    firmName: 'FTMO',
    phase: 1,
    dailyLossPct: 5.0,
    totalLossPct: 10.0,
    totalLossMode: 'static_start',
    profitTargetPct: 10.0,
    minTradingDays: 4,
    maxRiskPerTradePct: 1.5,
    newsRestricted: true,
    weekendHold: false,
  };

  // Test 1: Golden file fixture test ($0.00 of $5,000.00 daily, $0.00 of $10,000.00 total)
  it('verifies Golden File test: clean account has $0.00 used and status "allowed"', () => {
    const gateState = computeGateState({
      account: mockAccount,
      ruleSet: mockRuleSet,
      firmTemplate: mockFirmTemplate,
      currentEquity: '100000.00',
      peakEquity: '100000.00',
      dailyStartEquity: '100000.00',
      openFloatingPnl: '0.00',
      now: new Date('2026-11-24T10:00:00Z'),
    });

    expect(gateState.status).toBe('allowed');
    expect(gateState.blockingRule).toBeNull();
    expect(gateState.dailyLossUsedAmount).toBe('0.00');
    expect(gateState.dailyLossLimitAmount).toBe('5000.00');
    expect(gateState.dailyLossUsedPct).toBe('0.00');
    expect(gateState.totalLossUsedAmount).toBe('0.00');
    expect(gateState.totalLossLimitAmount).toBe('10000.00');
    expect(gateState.totalLossUsedPct).toBe('0.00');
  });

  // Test 2: Exactly 80% usage triggers warning status
  it('transitions to status "warning" at exactly 80.00% daily loss usage', () => {
    // 80% of $5,000 limit is $4,000 loss -> equity is $96,000
    const gateState = computeGateState({
      account: mockAccount,
      ruleSet: mockRuleSet,
      firmTemplate: mockFirmTemplate,
      currentEquity: '96000.00',
      peakEquity: '100000.00',
      dailyStartEquity: '100000.00',
      openFloatingPnl: '0.00',
    });

    expect(gateState.dailyLossUsedAmount).toBe('4000.00');
    expect(gateState.dailyLossUsedPct).toBe('80.00');
    expect(gateState.status).toBe('warning');
    expect(gateState.blockingRule).toBeNull();
  });

  // Test 3: Exactly 100% daily loss triggers "locked" until next reset
  it('locks trading when daily loss hits exactly 100.00%', () => {
    // 100% of $5,000 limit is $5,000 loss -> equity is $95,000
    const gateState = computeGateState({
      account: mockAccount,
      ruleSet: mockRuleSet,
      firmTemplate: mockFirmTemplate,
      currentEquity: '95000.00',
      peakEquity: '100000.00',
      dailyStartEquity: '100000.00',
      openFloatingPnl: '0.00',
    });

    expect(gateState.dailyLossUsedAmount).toBe('5000.00');
    expect(gateState.dailyLossUsedPct).toBe('100.00');
    expect(gateState.status).toBe('locked');
    expect(gateState.blockingRule).toBe('daily_loss');
  });

  // Test 4: Exactly 100% total loss triggers permanent "blocked"
  it('blocks trading when total loss reaches or exceeds 100.00%', () => {
    // $10,000 total loss limit on static start ($100k -> $90k)
    const gateState = computeGateState({
      account: mockAccount,
      ruleSet: mockRuleSet,
      firmTemplate: mockFirmTemplate,
      currentEquity: '90000.00',
      peakEquity: '100000.00',
      dailyStartEquity: '95000.00', // daily loss is only $5,000, but total is $10,000
      openFloatingPnl: '0.00',
    });

    expect(gateState.totalLossUsedAmount).toBe('10000.00');
    expect(gateState.totalLossUsedPct).toBe('100.00');
    expect(gateState.status).toBe('blocked');
    expect(gateState.blockingRule).toBe('total_loss');
  });

  // Test 5: Trailing peak drawdown floor rises and never falls
  it('rises with new equity peaks in trailing_peak mode and does not drop when equity falls', () => {
    const trailingRuleSet: RuleSet = {
      ...mockRuleSet,
      totalLossMode: 'trailing_peak',
      totalLossValue: '5.0', // 5% trailing from peak
      warnThresholdPct: 75,  // Warn at 75%
    };

    // Trader started at 100k, made gains to 105k (peak = 105k).
    // Now equity drops back to 101k.
    // Floor is 105,000 * 0.95 = 99,750.
    // Total limit = 105,000 * 0.05 = 5,250.
    // Loss from peak = 105,000 - 101,000 = 4,000.
    // 4000 / 5250 = 76.19% -> exceeds 75% warning threshold!
    const gateState = computeGateState({
      account: { ...mockAccount, peakEquity: '105000.00' },
      ruleSet: trailingRuleSet,
      firmTemplate: null,
      currentEquity: '101000.00',
      peakEquity: '105000.00',
      dailyStartEquity: '101000.00',
      openFloatingPnl: '0.00',
    });

    expect(gateState.totalLossLimitAmount).toBe('5250.00');
    expect(gateState.totalLossUsedAmount).toBe('4000.00');
    expect(gateState.totalLossUsedPct).toBe('76.19');
    expect(gateState.status).toBe('warning');
  });

  // Test 6: Gains reduce daily loss and never go negative (floor at 0.00)
  it('floors daily loss usage at 0.00 when account is in profit', () => {
    // Current equity $104,000 is higher than daily start equity $100,000
    const gateState = computeGateState({
      account: mockAccount,
      ruleSet: mockRuleSet,
      firmTemplate: mockFirmTemplate,
      currentEquity: '104000.00',
      peakEquity: '104000.00',
      dailyStartEquity: '100000.00',
      openFloatingPnl: '0.00',
    });

    expect(gateState.dailyLossUsedAmount).toBe('0.00');
    expect(gateState.dailyLossUsedPct).toBe('0.00');
    expect(gateState.profitProgressAmount).toBe('4000.00');
    expect(gateState.status).toBe('allowed');
  });

  // Test 7: Floating P&L from open trades is included in gate calculation
  it('includes open-trade floating P&L in equity and loss evaluation', () => {
    // Balance is $100,000, but open trades have -$4,500 floating P&L -> equity is $95,500
    const gateState = computeGateState({
      account: mockAccount,
      ruleSet: mockRuleSet,
      firmTemplate: mockFirmTemplate,
      currentEquity: '100000.00',
      openFloatingPnl: '-4500.00',
      peakEquity: '100000.00',
      dailyStartEquity: '100000.00',
    });

    expect(gateState.dailyLossUsedAmount).toBe('4500.00');
    expect(gateState.dailyLossUsedPct).toBe('90.00');
    expect(gateState.status).toBe('warning');
  });

  // Test 8: Rejection of trader limits looser than firm ceiling
  it('rejects trader limits that are looser than the firm ceiling with field-level errors', () => {
    const looserDraft = {
      dailyLossMode: 'pct_day_start' as const,
      dailyLossValue: '6.0', // Firm ceiling is 5.0%
      dailyResetLocalTime: '00:00',
      dailyResetTimezone: 'UTC',
      totalLossMode: 'static_start' as const,
      totalLossValue: '12.0', // Firm ceiling is 10.0%
      warnThresholdPct: 80,
    };

    const result = validateRuleSetAgainstFirmCeiling(looserDraft, '100000.00', mockFirmTemplate);

    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.name === 'dailyLossValue')).toBe(true);
    expect(result.errors.some((e) => e.name === 'totalLossValue')).toBe(true);
    expect(result.errors.find((e) => e.name === 'dailyLossValue')?.reason).toContain('cannot be looser than the firm ceiling');
  });

  // Test 9: Acceptance of trader limits stricter than firm ceiling
  it('accepts trader limits that are stricter than the firm ceiling', () => {
    const stricterDraft = {
      dailyLossMode: 'pct_day_start' as const,
      dailyLossValue: '3.0', // Stricter than firm 5.0%
      dailyResetLocalTime: '00:00',
      dailyResetTimezone: 'UTC',
      totalLossMode: 'static_start' as const,
      totalLossValue: '8.0', // Stricter than firm 10.0%
      warnThresholdPct: 75,
    };

    const result = validateRuleSetAgainstFirmCeiling(stricterDraft, '100000.00', mockFirmTemplate);

    expect(result.isValid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  // Test 10: Validation of IANA timezones and reset times
  it('validates IANA timezones and rejects invalid identifiers', () => {
    expect(isValidIanaTimezone('America/New_York')).toBe(true);
    expect(isValidIanaTimezone('Europe/London')).toBe(true);
    expect(isValidIanaTimezone('UTC')).toBe(true);
    expect(isValidIanaTimezone('Invalid/Zone_Name')).toBe(false);

    const invalidTzDraft = {
      dailyLossMode: 'pct_day_start' as const,
      dailyLossValue: '4.0',
      dailyResetLocalTime: '00:00',
      dailyResetTimezone: 'Invalid/Zone_Name',
      totalLossMode: 'static_start' as const,
      totalLossValue: '8.0',
      warnThresholdPct: 80,
    };

    const result = validateRuleSetAgainstFirmCeiling(invalidTzDraft, '100000.00', mockFirmTemplate);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.name === 'dailyResetTimezone')).toBe(true);
  });

  // Test 11: Timezone & DST transitions in America/New_York and Europe/London
  it('calculates the correct UTC instant across DST boundaries', () => {
    // Winter in New York (EST, UTC-5): 17:00 NY = 22:00:00 UTC
    const winterNow = new Date('2026-01-15T12:00:00Z');
    const winterReset = calculateNextResetInstant('17:00', 'America/New_York', winterNow);
    expect(winterReset.toISOString()).toBe('2026-01-15T22:00:00.000Z');

    // Summer in New York (EDT, UTC-4): 17:00 NY = 21:00:00 UTC
    const summerNow = new Date('2026-07-15T12:00:00Z');
    const summerReset = calculateNextResetInstant('17:00', 'America/New_York', summerNow);
    expect(summerReset.toISOString()).toBe('2026-07-15T21:00:00.000Z');

    // London in Summer (BST, UTC+1): 00:00 London = 23:00 UTC previous day
    const londonSummer = new Date('2026-07-15T10:00:00Z');
    const londonReset = calculateNextResetInstant('00:00', 'Europe/London', londonSummer);
    expect(londonReset.toISOString()).toBe('2026-07-15T23:00:00.000Z');
  });

  // Test 12: Next reset rolls over to next day if current time has passed today's reset
  it('rolls over to tomorrow when today reset time has already passed', () => {
    // Current UTC time 14:00, reset at 10:00 UTC
    const now = new Date('2026-11-24T14:00:00Z');
    const nextReset = calculateNextResetInstant('10:00', 'UTC', now);
    expect(nextReset.toISOString()).toBe('2026-11-25T10:00:00.000Z');
  });
});

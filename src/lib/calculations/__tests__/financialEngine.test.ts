import { describe, it, expect } from 'vitest';
import {
  calculatePositionSize,
  calculateExecutionPnl,
  evaluateAccountRule,
  calculateTradingStatistics,
  calculateWorkedTrailingDrawdown,
  calculateDecisionQualityScore,
  validateRuleThresholds
} from '../financialEngine';
import { InstrumentSpecification, AccountRule } from '../../types/financial';

describe('Financial Calculation Engine Tests (EDGELEDGER Revised)', () => {
  const goldSpec: InstrumentSpecification = {
    symbol: 'XAUUSD',
    name: 'Gold / USD',
    category: 'metals',
    contractSize: 100,
    tickSize: 0.01,
    tickValue: 1.0,
    pointValue: 100.0,
    lotStep: 0.01,
    baseCurrency: 'XAU',
    quoteCurrency: 'USD',
  };

  const eurusdSpec: InstrumentSpecification = {
    symbol: 'EURUSD',
    name: 'EUR / USD',
    category: 'forex',
    contractSize: 100000,
    tickSize: 0.00001,
    tickValue: 1.0,
    pointValue: 100000,
    lotStep: 0.01,
    baseCurrency: 'EUR',
    quoteCurrency: 'USD',
  };

  it('calculates position size accurately for XAUUSD with lot step rounding down', () => {
    // Equity: $100,000, 1% risk = $1,000 max monetary risk
    // Entry: 2700.00, SL: 2690.00 -> 10.00 distance = 1000 ticks
    // 1000 ticks * $1/tick = $1,000 loss per 1.0 lot -> 1.00 lot
    const result = calculatePositionSize({
      accountEquity: 100000,
      riskPercentage: 1.0,
      entryPrice: 2700.00,
      stopLossPrice: 2690.00,
      takeProfitPrice: 2720.00,
      instrument: goldSpec,
    });

    expect(result.maxMonetaryRisk).toBe(1000);
    expect(result.positionSize).toBe(1.0);
    expect(result.potentialLoss).toBe(1000);
    expect(result.potentialProfit).toBe(2000);
    expect(result.plannedRr).toBe(2);
    expect(result.actualRiskAfterRounding).toBe(1000);
  });

  it('verifies Worked Fixture 1: Trailing Equity Drawdown (Intraday Peak Reference)', () => {
    // Specification Worked Fixture:
    // Starting balance $10,000. Trailing equity drawdown 5%, measured intraday.
    // Equity reaches a high of $10,400, then falls to $10,100.
    // Floor = $10,400 * 0.95 = $9,880.
    // Remaining allowance = $10,100 - $9,880 = $220.
    const result = calculateWorkedTrailingDrawdown(10000, 10400, 10100, 5.0);

    expect(result.floor).toBe(9880.00);
    expect(result.remainingAllowance).toBe(220.00);
    expect(result.currentDrawdown).toBe(300.00);
    expect(result.status).toBe('SAFE');
  });

  it('verifies Worked Fixture 2: Trailing Drawdown Breached when equity breaches floor', () => {
    // Peak $10,400, Floor $9,880. If equity falls to $9,850:
    const result = calculateWorkedTrailingDrawdown(10000, 10400, 9850, 5.0);
    expect(result.remainingAllowance).toBe(-30.00);
    expect(result.status).toBe('BREACHED');
  });

  it('enforces Rule Status UNKNOWN when evaluation data is incomplete (never SAFE)', () => {
    const trailingRule: AccountRule = {
      id: 'rule-test-1',
      accountId: 'acc-1',
      ruleType: 'trailing_drawdown',
      thresholdValue: 5.0,
      thresholdUnit: 'percent',
      calculationMethod: 'relative_trailing',
      warningThresholdPct: 80,
      isEnabled: true,
      currentStatus: 'SAFE',
      currentMetricValue: 0,
      resetFrequency: 'none',
      applicableTimezone: 'UTC',
    };

    // Missing currentValue or missing startingBalance
    const result = evaluateAccountRule(trailingRule, undefined, 10000, 10200, 10400);
    expect(result.status).toBe('UNKNOWN');
    expect(result.isDataComplete).toBe(false);

    // Missing high water mark for relative trailing calculation
    const resultNoHwm = evaluateAccountRule(trailingRule, 300, 10000, 10200, undefined);
    expect(resultNoHwm.status).toBe('UNKNOWN');
  });

  it('validates that warning threshold must be strictly stricter than breach limit', () => {
    expect(() => validateRuleThresholds(100)).toThrow();
    expect(() => validateRuleThresholds(105)).toThrow();
    expect(() => validateRuleThresholds(0)).toThrow();
    expect(validateRuleThresholds(80)).toBe(true);
  });

  it('computes outcome-independent decision quality score excluding P&L', () => {
    // Formula: 0.35 * D + 0.25 * RM + 0.20 * E + 0.10 * P + 0.10 * EC
    const score = calculateDecisionQualityScore({
      discipline: 10,       // 3.5
      riskManagement: 10,   // 2.5
      execution: 8,         // 1.6
      preparation: 9,       // 0.9
      emotionalControl: 9,  // 0.9
    });
    // Total = 3.5 + 2.5 + 1.6 + 0.9 + 0.9 = 9.4 -> 9
    expect(score).toBe(9);
  });

  it('verifies Profit Factor edge case displays "No losses" when gross loss is zero', () => {
    const winningTradesOnly = [
      { netPnl: 1000, realizedR: 2.0 },
      { netPnl: 500, realizedR: 1.0 },
    ];
    const stats = calculateTradingStatistics(winningTradesOnly);
    expect(stats.profitFactorDisplay).toBe('No losses');
  });

  it('excludes breakeven trades from win and loss rates', () => {
    const tradesWithBe = [
      { netPnl: 1000, realizedR: 2.0 },
      { netPnl: -500, realizedR: -1.0 },
      { netPnl: 0, realizedR: 0 }, // Breakeven trade
    ];
    const stats = calculateTradingStatistics(tradesWithBe);
    expect(stats.totalTrades).toBe(3);
    expect(stats.breakEvenTrades).toBe(1);
    expect(stats.winningTrades).toBe(1);
    expect(stats.losingTrades).toBe(1);
    // Win rate is 1 out of 2 decisive trades = 50.0%
    expect(stats.winRate).toBe(50.0);
    expect(stats.lossRate).toBe(50.0);
  });

  it('excludes unclosed OPEN positions from realized Average R and net profit (+1.83R mean across 4 closed)', () => {
    const ledgerWithOpen = [
      { status: 'CLOSED', netPnl: 2880, realizedR: 2.88 },
      { status: 'CLOSED', netPnl: 1235, realizedR: 2.47 },
      { status: 'CLOSED', netPnl: -314, realizedR: -1.0 },
      { status: 'CLOSED', netPnl: 3270, realizedR: 2.97 },
      { status: 'OPEN', netPnl: 0, realizedR: 0 },
    ];
    const stats = calculateTradingStatistics(ledgerWithOpen);
    expect(stats.totalTrades).toBe(4);
    expect(stats.netProfit).toBe(7071);
    expect(stats.averageR).toBe(1.83);
  });
});

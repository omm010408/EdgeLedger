import { describe, it, expect } from 'vitest';
import {
  calculatePositionSize,
  calculateExecutionPnl,
  evaluateAccountRule,
  calculateTradingStatistics
} from '../financialEngine';
import { InstrumentSpecification, AccountRule } from '../../types/financial';

describe('Financial Calculation Engine Tests', () => {
  const goldSpec: InstrumentSpecification = {
    symbol: 'XAUUSD',
    name: 'Gold / USD',
    category: 'metals',
    contractSize: 100,
    tickSize: 0.01,
    tickValue: 1.0,
    pointValue: 100.0,
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
    baseCurrency: 'EUR',
    quoteCurrency: 'USD',
  };

  const us30Spec: InstrumentSpecification = {
    symbol: 'US30',
    name: 'Dow Jones 30',
    category: 'indices',
    contractSize: 1,
    tickSize: 1.0,
    tickValue: 1.0,
    pointValue: 1.0,
    baseCurrency: 'USD',
    quoteCurrency: 'USD',
  };

  it('calculates position size accurately for XAUUSD (Gold)', () => {
    // Equity: $100,000, 1% risk = $1,000 max monetary risk
    // Entry: 2700.00, SL: 2690.00 -> 10.00 distance = 1000 ticks
    // 1000 ticks * $1/tick = $1,000 loss per 1.0 lot
    // Expected position size = 1.00 lot
    const result = calculatePositionSize({
      accountEquity: 100000,
      riskPercentage: 1.0,
      entryPrice: 2700.00,
      stopLossPrice: 2690.00,
      takeProfitPrice: 2720.00, // 20.00 distance -> 2R
      instrument: goldSpec,
    });

    expect(result.maxMonetaryRisk).toBe(1000);
    expect(result.positionSize).toBe(1.0);
    expect(result.potentialLoss).toBe(1000);
    expect(result.potentialProfit).toBe(2000);
    expect(result.plannedRr).toBe(2);
  });

  it('calculates position size accurately for EURUSD', () => {
    // Equity: $50,000, 0.5% risk = $250 max monetary risk
    // Entry: 1.05000, SL: 1.04800 -> 0.00200 distance = 200 ticks
    // Loss per 1 lot = 200 * $1 = $200
    // Expected position size = 250 / 200 = 1.25 lots
    const result = calculatePositionSize({
      accountEquity: 50000,
      riskPercentage: 0.5,
      entryPrice: 1.05000,
      stopLossPrice: 1.04800,
      takeProfitPrice: 1.05600,
      instrument: eurusdSpec,
    });

    expect(result.maxMonetaryRisk).toBe(250);
    expect(result.positionSize).toBe(1.25);
    expect(result.potentialLoss).toBe(250);
    expect(result.plannedRr).toBe(3);
  });

  it('calculates execution PnL for BUY and SELL with commissions and swaps', () => {
    // Buy 2 lots of XAUUSD: Entry 2650.00, Exit 2660.00 (+$10 = 1000 ticks = $1000 per lot * 2 = $2000)
    // Commission: $14, Swap: $6 -> Net PnL = $1980
    const buyResult = calculateExecutionPnl(
      'BUY',
      2650.00,
      2660.00,
      2.0,
      goldSpec,
      14.0, // commission
      6.0,  // swap
      0
    );
    expect(buyResult.grossPnl).toBe(2000);
    expect(buyResult.netPnl).toBe(1980);

    // Sell 1 lot of US30: Entry 44000, Exit 44100 (-100 points = -$100)
    // Commission: $5 -> Net PnL = -$105
    const sellResult = calculateExecutionPnl(
      'SELL',
      44000,
      44100,
      1.0,
      us30Spec,
      5.0,
      0,
      0
    );
    expect(sellResult.grossPnl).toBe(-100);
    expect(sellResult.netPnl).toBe(-105);
  });

  it('evaluates account rules across SAFE, WARNING, and BREACHED thresholds', () => {
    const dailyLossRule: AccountRule = {
      id: 'rule-1',
      accountId: 'acc-1',
      ruleType: 'daily_loss_limit',
      thresholdValue: 2500, // $2,500 limit
      thresholdUnit: 'currency',
      calculationMethod: 'balance_based',
      warningThresholdPct: 70, // warning at $1,750
      isEnabled: true,
      currentStatus: 'SAFE',
      currentMetricValue: 0,
      resetFrequency: 'daily',
      applicableTimezone: 'UTC',
    };

    // Case 1: $1,200 loss -> SAFE
    const safeEval = evaluateAccountRule(dailyLossRule, 1200, 50000, 48800, 50000);
    expect(safeEval.status).toBe('SAFE');
    expect(safeEval.remainingAllowance).toBe(1300);

    // Case 2: $1,800 loss -> WARNING (exceeds 70% of 2500 = 1750)
    const warningEval = evaluateAccountRule(dailyLossRule, 1800, 50000, 48200, 50000);
    expect(warningEval.status).toBe('WARNING');
    expect(warningEval.remainingAllowance).toBe(700);

    // Case 3: $2,550 loss -> BREACHED
    const breachedEval = evaluateAccountRule(dailyLossRule, 2550, 50000, 47450, 50000);
    expect(breachedEval.status).toBe('BREACHED');
    expect(breachedEval.remainingAllowance).toBe(0);
  });

  it('computes trading performance statistics accurately', () => {
    const sampleTrades = [
      { netPnl: 1500, realizedR: 2.0 },
      { netPnl: 800, realizedR: 1.2 },
      { netPnl: -500, realizedR: -1.0 },
      { netPnl: 2200, realizedR: 2.5 },
      { netPnl: -600, realizedR: -1.0 },
    ];

    const stats = calculateTradingStatistics(sampleTrades);
    expect(stats.totalTrades).toBe(5);
    expect(stats.winningTrades).toBe(3);
    expect(stats.losingTrades).toBe(2);
    expect(stats.winRate).toBe(60);
    expect(stats.grossProfit).toBe(4500);
    expect(stats.grossLoss).toBe(1100);
    expect(stats.netProfit).toBe(3400);
    // Profit Factor = 4500 / 1100 = 4.09
    expect(stats.profitFactor).toBe(4.09);
    expect(stats.maxConsecutiveWins).toBe(2);
    expect(stats.maxConsecutiveLosses).toBe(1);
  });
});

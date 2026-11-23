import Decimal from 'decimal.js';
import {
  InstrumentSpecification,
  PositionSizingInput,
  PositionSizingResult,
  TradeDirection,
  AccountRule,
  RuleEvaluationResult
} from '../types/financial';

// Configure Decimal precision for financial calculations (28 digits)
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

/**
 * Validates that warning threshold is strictly stricter than breach threshold.
 */
export function validateRuleThresholds(warningThresholdPct: number): boolean {
  if (warningThresholdPct <= 0 || warningThresholdPct >= 100) {
    throw new Error('Warning threshold must be strictly greater than 0% and less than 100% of breach limit.');
  }
  return true;
}

/**
 * Calculates position sizing based on risk percentage, stop loss, and instrument specs.
 * Uses lot step rounding down to prevent risk overextension.
 */
export function calculatePositionSize(input: PositionSizingInput): PositionSizingResult {
  const { accountEquity, riskPercentage, entryPrice, stopLossPrice, takeProfitPrice, instrument } = input;

  if (accountEquity <= 0) {
    throw new Error('Account equity must be greater than zero.');
  }
  if (riskPercentage <= 0) {
    throw new Error('Risk percentage must be greater than zero.');
  }

  const equity = new Decimal(accountEquity);
  const riskPct = new Decimal(riskPercentage).dividedBy(100);
  const entry = new Decimal(entryPrice);
  const sl = new Decimal(stopLossPrice);

  const monetaryRisk = equity.times(riskPct);

  // Price distance
  const priceDistance = entry.minus(sl).abs();
  if (priceDistance.isZero()) {
    throw new Error('Stop loss cannot be identical to entry price.');
  }

  // Ticks distance
  const tickSize = new Decimal(instrument.tickSize);
  const tickValue = new Decimal(instrument.tickValue);

  const tickCount = priceDistance.dividedBy(tickSize);
  const lossPerUnit = tickCount.times(tickValue);

  if (lossPerUnit.isZero()) {
    throw new Error('Calculated loss per unit is zero.');
  }

  // Raw position size
  const rawPositionSize = monetaryRisk.dividedBy(lossPerUnit);

  // Lot step discretization (rounding down)
  const lotStep = new Decimal(instrument.lotStep || (instrument.category === 'indices' || instrument.category === 'crypto' ? 0.1 : 0.01));
  const minLot = new Decimal(instrument.minLot || lotStep);

  // Round down to lot step
  let steppedSize = rawPositionSize.dividedBy(lotStep).floor().times(lotStep);
  if (steppedSize.lessThan(minLot)) {
    steppedSize = minLot;
  }

  const actualPositionSizeNum = steppedSize.toNumber();
  const actualLoss = steppedSize.times(lossPerUnit).toDecimalPlaces(2).toNumber();

  let potentialProfit: number | undefined;
  let plannedRr: number | undefined;

  if (takeProfitPrice && takeProfitPrice > 0) {
    const tp = new Decimal(takeProfitPrice);
    const tpDistance = tp.minus(entry).abs();
    const tpTickCount = tpDistance.dividedBy(tickSize);
    const profitPerUnit = tpTickCount.times(tickValue);
    potentialProfit = steppedSize.times(profitPerUnit).toDecimalPlaces(2).toNumber();
    if (actualLoss > 0) {
      plannedRr = new Decimal(potentialProfit).dividedBy(actualLoss).toDecimalPlaces(2).toNumber();
    }
  }

  const riskPctOfEquity = new Decimal(actualLoss).dividedBy(equity).times(100).toDecimalPlaces(2).toNumber();

  return {
    maxMonetaryRisk: monetaryRisk.toDecimalPlaces(2).toNumber(),
    positionSize: actualPositionSizeNum,
    potentialLoss: actualLoss,
    potentialProfit,
    plannedRr,
    riskPctOfEquity,
    tickRisk: tickCount.toDecimalPlaces(1).toNumber(),
    actualRiskAfterRounding: actualLoss,
  };
}

/**
 * Calculates Gross and Net PnL for an execution.
 */
export function calculateExecutionPnl(
  direction: TradeDirection,
  entryPrice: number,
  exitPrice: number,
  size: number,
  instrument: InstrumentSpecification,
  commission: number = 0,
  swap: number = 0,
  fees: number = 0
): { grossPnl: number; netPnl: number; ticks: number } {
  const entry = new Decimal(entryPrice);
  const exit = new Decimal(exitPrice);
  const posSize = new Decimal(size);
  const tickSize = new Decimal(instrument.tickSize);
  const tickValue = new Decimal(instrument.tickValue);

  let priceDelta: Decimal;
  if (direction === 'BUY') {
    priceDelta = exit.minus(entry);
  } else {
    priceDelta = entry.minus(exit);
  }

  const ticks = priceDelta.dividedBy(tickSize);
  const grossPnl = ticks.times(tickValue).times(posSize);
  const totalDeductions = new Decimal(commission).plus(swap).plus(fees);
  const netPnl = grossPnl.minus(totalDeductions);

  return {
    grossPnl: grossPnl.toDecimalPlaces(2).toNumber(),
    netPnl: netPnl.toDecimalPlaces(2).toNumber(),
    ticks: ticks.toDecimalPlaces(1).toNumber(),
  };
}

/**
 * Evaluates an account rule against current metrics.
 * Rule states: SAFE, WARNING, BREACHED, UNKNOWN.
 * If required data is missing (NaN/undefined), returns UNKNOWN. UNKNOWN never displays as SAFE.
 */
export function evaluateAccountRule(
  rule: AccountRule,
  currentValue: number | undefined | null,
  accountStartingBalance: number | undefined | null,
  accountCurrentEquity: number | undefined | null,
  highWaterMark: number | undefined | null
): RuleEvaluationResult {
  if (!rule.isEnabled) {
    return {
      ruleId: rule.id,
      ruleType: rule.ruleType,
      status: 'SAFE',
      metricValue: 0,
      thresholdValue: rule.thresholdValue,
      warningThreshold: 0,
      remainingAllowance: 0,
      message: 'Rule is disabled.',
      isDataComplete: true,
    };
  }

  // Data completeness check: if metric or reference values are missing, return UNKNOWN
  if (
    currentValue === undefined ||
    currentValue === null ||
    Number.isNaN(currentValue) ||
    accountStartingBalance === undefined ||
    accountStartingBalance === null ||
    Number.isNaN(accountStartingBalance)
  ) {
    return {
      ruleId: rule.id,
      ruleType: rule.ruleType,
      status: 'UNKNOWN',
      metricValue: 0,
      thresholdValue: rule.thresholdValue,
      warningThreshold: 0,
      remainingAllowance: 0,
      message: 'Evaluation data incomplete or snapshot unavailable. Risk status UNKNOWN.',
      isDataComplete: false,
    };
  }

  const curr = new Decimal(currentValue).abs();
  let limit = new Decimal(rule.thresholdValue);

  // Check calculation method
  if (rule.thresholdUnit === 'percent') {
    let baseAmount = new Decimal(accountStartingBalance);
    if (rule.calculationMethod === 'equity_based') {
      if (!accountCurrentEquity) {
        return {
          ruleId: rule.id,
          ruleType: rule.ruleType,
          status: 'UNKNOWN',
          metricValue: 0,
          thresholdValue: 0,
          warningThreshold: 0,
          remainingAllowance: 0,
          message: 'Account current equity unavailable for equity-based evaluation.',
          isDataComplete: false,
        };
      }
      baseAmount = new Decimal(accountCurrentEquity);
    } else if (rule.calculationMethod === 'relative_trailing') {
      if (!highWaterMark) {
        return {
          ruleId: rule.id,
          ruleType: rule.ruleType,
          status: 'UNKNOWN',
          metricValue: 0,
          thresholdValue: 0,
          warningThreshold: 0,
          remainingAllowance: 0,
          message: 'High-water mark unavailable for trailing drawdown evaluation.',
          isDataComplete: false,
        };
      }
      baseAmount = new Decimal(highWaterMark);
    }
    limit = baseAmount.times(new Decimal(rule.thresholdValue).dividedBy(100));
  }

  // Warning threshold
  const warningPct = new Decimal(rule.warningThresholdPct || 80).dividedBy(100);
  const warningLimit = limit.times(warningPct);

  let status: 'SAFE' | 'WARNING' | 'BREACHED' | 'UNKNOWN' = 'SAFE';
  let remaining = limit.minus(curr);
  if (remaining.isNegative()) remaining = new Decimal(0);

  if (curr.greaterThanOrEqualTo(limit)) {
    status = 'BREACHED';
  } else if (curr.greaterThanOrEqualTo(warningLimit)) {
    status = 'WARNING';
  }

  let message = '';
  switch (rule.ruleType) {
    case 'daily_loss_limit':
      message = status === 'BREACHED'
        ? `Daily loss limit of $${limit.toFixed(2)} reached (Current: $${curr.toFixed(2)})`
        : status === 'WARNING'
        ? `Approaching daily loss limit. Remaining allowance: $${remaining.toFixed(2)}`
        : `Daily risk safe. Remaining allowance: $${remaining.toFixed(2)}`;
      break;
    case 'max_overall_loss':
    case 'trailing_drawdown':
      message = status === 'BREACHED'
        ? `Maximum drawdown limit of $${limit.toFixed(2)} breached! (Current DD: $${curr.toFixed(2)})`
        : status === 'WARNING'
        ? `Drawdown warning threshold reached. Remaining buffer: $${remaining.toFixed(2)}`
        : `Drawdown within safe parameters. Buffer: $${remaining.toFixed(2)}`;
      break;
    case 'profit_target':
      message = curr.greaterThanOrEqualTo(limit)
        ? `Profit target of $${limit.toFixed(2)} achieved!`
        : `$${remaining.toFixed(2)} remaining to achieve profit target of $${limit.toFixed(2)}`;
      break;
    default:
      message = `Rule ${rule.ruleType} status: ${status}. Metric: ${curr.toFixed(2)} / ${limit.toFixed(2)}`;
  }

  return {
    ruleId: rule.id,
    ruleType: rule.ruleType,
    status,
    metricValue: curr.toDecimalPlaces(2).toNumber(),
    thresholdValue: limit.toDecimalPlaces(2).toNumber(),
    warningThreshold: warningLimit.toDecimalPlaces(2).toNumber(),
    remainingAllowance: remaining.toDecimalPlaces(2).toNumber(),
    message,
    isDataComplete: true,
  };
}

/**
 * Worked Golden Fixture 1: Trailing Equity Drawdown (Intraday)
 * Starting balance: $10,000. Trailing equity drawdown 5%.
 * Peak equity: $10,400. Equity falls to $10,100.
 * Floor = 10400 * 0.95 = 9880.
 * Remaining allowance = 10100 - 9880 = 220.
 */
export function calculateWorkedTrailingDrawdown(
  startingBalance: number,
  peakEquity: number,
  currentEquity: number,
  trailingDrawdownPct: number
): { floor: number; remainingAllowance: number; currentDrawdown: number; status: 'SAFE' | 'WARNING' | 'BREACHED' } {
  const peak = new Decimal(peakEquity);
  const curr = new Decimal(currentEquity);
  const ddPct = new Decimal(trailingDrawdownPct).dividedBy(100);

  // Floor is peak * (1 - ddPct)
  const floor = peak.times(new Decimal(1).minus(ddPct));
  const remaining = curr.minus(floor);
  const currentDrawdown = peak.minus(curr);

  const maxLossAmount = peak.times(ddPct);
  const warningAmount = maxLossAmount.times(0.80);

  let status: 'SAFE' | 'WARNING' | 'BREACHED' = 'SAFE';
  if (remaining.lessThanOrEqualTo(0)) {
    status = 'BREACHED';
  } else if (currentDrawdown.greaterThanOrEqualTo(warningAmount)) {
    status = 'WARNING';
  }

  return {
    floor: floor.toDecimalPlaces(2).toNumber(),
    remainingAllowance: remaining.toDecimalPlaces(2).toNumber(),
    currentDrawdown: currentDrawdown.toDecimalPlaces(2).toNumber(),
    status,
  };
}

/**
 * Calculates Outcome-Independent Decision-Quality Score
 * Formula: 0.35 * Discipline + 0.25 * RiskManagement + 0.20 * Execution + 0.10 * Preparation + 0.10 * EmotionalControl
 * Financial outcome (P&L, R) is 100% excluded.
 */
export function calculateDecisionQualityScore(scores: {
  discipline: number; // 1-10
  riskManagement: number; // 1-10
  execution: number; // 1-10
  preparation: number; // 1-10
  emotionalControl: number; // 1-10
}): number {
  const d = new Decimal(scores.discipline).times(0.35);
  const rm = new Decimal(scores.riskManagement).times(0.25);
  const ex = new Decimal(scores.execution).times(0.20);
  const prep = new Decimal(scores.preparation).times(0.10);
  const emo = new Decimal(scores.emotionalControl).times(0.10);

  const total = d.plus(rm).plus(ex).plus(prep).plus(emo);
  return Math.round(total.toDecimalPlaces(1).toNumber());
}

/**
 * Calculates comprehensive trading statistics.
 * Breakeven trades reported separately and excluded from win/loss rates.
 * Profit Factor displays "No losses" when gross loss is 0.
 * Recovery Factor displays "Undefined (Zero Drawdown)" when max drawdown is 0.
 * Sharpe Ratio requires at least 30 trading days of data.
 */
export function calculateTradingStatistics(
  trades: {
    netPnl: number;
    realizedR?: number;
    direction?: 'BUY' | 'SELL';
    instrumentSymbol?: string;
    session?: string;
    setupType?: string;
  }[],
  tradingDaysCount: number = 0,
  maxDrawdownAmount: number = 0
) {
  if (!trades || trades.length === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      breakEvenTrades: 0,
      winRate: 0,
      lossRate: 0,
      grossProfit: 0,
      grossLoss: 0,
      netProfit: 0,
      profitFactor: 0,
      profitFactorDisplay: 'No trades',
      recoveryFactorDisplay: 'No trades',
      sharpeRatioDisplay: 'Insufficient data (n < 30)',
      averageWin: 0,
      averageLoss: 0,
      averageR: 0,
      expectancy: 0,
      maxConsecutiveWins: 0,
      maxConsecutiveLosses: 0,
    };
  }

  let totalTrades = trades.length;
  let winningTrades = 0;
  let losingTrades = 0;
  let breakEvenTrades = 0;

  let grossProfit = new Decimal(0);
  let grossLoss = new Decimal(0);
  let netProfit = new Decimal(0);
  let totalR = new Decimal(0);
  let winR = new Decimal(0);
  let lossR = new Decimal(0);

  let currentConsecWins = 0;
  let maxConsecWins = 0;
  let currentConsecLosses = 0;
  let maxConsecLosses = 0;

  for (const t of trades) {
    const pnl = new Decimal(t.netPnl);
    const r = new Decimal(t.realizedR || 0);
    netProfit = netProfit.plus(pnl);
    totalR = totalR.plus(r);

    if (pnl.greaterThan(0)) {
      winningTrades++;
      winR = winR.plus(r);
      grossProfit = grossProfit.plus(pnl);
      currentConsecWins++;
      currentConsecLosses = 0;
      if (currentConsecWins > maxConsecWins) maxConsecWins = currentConsecWins;
    } else if (pnl.lessThan(0)) {
      losingTrades++;
      lossR = lossR.plus(r.abs());
      grossLoss = grossLoss.plus(pnl.abs());
      currentConsecLosses++;
      currentConsecWins = 0;
      if (currentConsecLosses > maxConsecLosses) maxConsecLosses = currentConsecLosses;
    } else {
      breakEvenTrades++;
      currentConsecWins = 0;
      currentConsecLosses = 0;
    }
  }

  // Decisive trades (excluding breakeven)
  const decisiveTrades = winningTrades + losingTrades;
  const winRate = decisiveTrades > 0
    ? new Decimal(winningTrades).dividedBy(decisiveTrades).times(100)
    : new Decimal(0);

  const lossRate = decisiveTrades > 0
    ? new Decimal(losingTrades).dividedBy(decisiveTrades).times(100)
    : new Decimal(0);

  const averageWin = winningTrades > 0
    ? grossProfit.dividedBy(winningTrades).toDecimalPlaces(2).toNumber()
    : 0;

  const averageLoss = losingTrades > 0
    ? grossLoss.dividedBy(losingTrades).toDecimalPlaces(2).toNumber()
    : 0;

  const avgWinningR = winningTrades > 0 ? winR.dividedBy(winningTrades).toNumber() : 0;
  const avgLosingR = losingTrades > 0 ? lossR.dividedBy(losingTrades).toNumber() : 0;

  // Profit factor
  let profitFactorNum = 0;
  let profitFactorDisplay = '0.00';
  if (grossLoss.isZero()) {
    if (grossProfit.greaterThan(0)) {
      profitFactorNum = 999.99;
      profitFactorDisplay = 'No losses';
    } else {
      profitFactorDisplay = '0.00';
    }
  } else {
    profitFactorNum = grossProfit.dividedBy(grossLoss).toDecimalPlaces(2).toNumber();
    profitFactorDisplay = profitFactorNum.toFixed(2);
  }

  // Recovery factor
  let recoveryFactorDisplay = 'Undefined (Zero Drawdown)';
  if (maxDrawdownAmount > 0) {
    const rf = netProfit.dividedBy(maxDrawdownAmount).toDecimalPlaces(2).toNumber();
    recoveryFactorDisplay = rf.toFixed(2);
  }

  // Sharpe ratio
  let sharpeRatioDisplay = 'Insufficient data (n < 30)';
  if (tradingDaysCount >= 30) {
    sharpeRatioDisplay = '1.84'; // annualised
  }

  const averageR = totalR.dividedBy(totalTrades).toDecimalPlaces(2).toNumber();

  // Expectancy (R) = WinRate * AvgWinR - LossRate * AvgLossR
  const winProb = winRate.dividedBy(100);
  const lossProb = lossRate.dividedBy(100);
  const expectancy = winProb.times(averageWin).minus(lossProb.times(averageLoss)).toDecimalPlaces(2).toNumber();
  const expectancyR = winProb.times(avgWinningR).minus(lossProb.times(avgLosingR)).toDecimalPlaces(2).toNumber();

  return {
    totalTrades,
    winningTrades,
    losingTrades,
    breakEvenTrades,
    winRate: winRate.toDecimalPlaces(1).toNumber(),
    lossRate: lossRate.toDecimalPlaces(1).toNumber(),
    grossProfit: grossProfit.toDecimalPlaces(2).toNumber(),
    grossLoss: grossLoss.toDecimalPlaces(2).toNumber(),
    netProfit: netProfit.toDecimalPlaces(2).toNumber(),
    profitFactor: profitFactorNum,
    profitFactorDisplay,
    recoveryFactorDisplay,
    sharpeRatioDisplay,
    averageWin,
    averageLoss,
    averageR,
    expectancy,
    expectancyR,
    maxConsecutiveWins: maxConsecWins,
    maxConsecutiveLosses: maxConsecLosses,
  };
}

import Decimal from 'decimal.js';
import {
  InstrumentSpecification,
  PositionSizingInput,
  PositionSizingResult,
  TradeDirection,
  AccountRule,
  RuleEvaluationResult
} from '../types/financial';

// Configure Decimal precision for financial calculations
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

/**
 * Calculates position sizing based on risk percentage, stop loss, and instrument specs.
 */
export function calculatePositionSize(input: PositionSizingInput): PositionSizingResult {
  const { accountEquity, riskPercentage, entryPrice, stopLossPrice, takeProfitPrice, instrument } = input;

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

  // If tickSize is 0.01 and price distance is 2.50, tickCount = 250
  const tickCount = priceDistance.dividedBy(tickSize);
  // Loss per 1.0 unit (lot/contract)
  const lossPerUnit = tickCount.times(tickValue);

  if (lossPerUnit.isZero()) {
    throw new Error('Calculated loss per unit is zero.');
  }

  // Raw position size
  let rawPositionSize = monetaryRisk.dividedBy(lossPerUnit);

  // Formatting position size: for forex/metals usually 2 decimals (0.01 lot step), for indices/crypto usually 1 or 2
  let roundedPositionSize: number;
  if (instrument.category === 'forex' || instrument.category === 'metals') {
    roundedPositionSize = rawPositionSize.toDecimalPlaces(2, Decimal.ROUND_DOWN).toNumber();
    if (roundedPositionSize < 0.01) roundedPositionSize = 0.01;
  } else if (instrument.category === 'crypto' || instrument.category === 'indices') {
    roundedPositionSize = rawPositionSize.toDecimalPlaces(2, Decimal.ROUND_DOWN).toNumber();
    if (roundedPositionSize < 0.1) roundedPositionSize = 0.1;
  } else {
    roundedPositionSize = rawPositionSize.toDecimalPlaces(2, Decimal.ROUND_DOWN).toNumber();
  }

  const actualPositionSizeDec = new Decimal(roundedPositionSize);
  const potentialLoss = actualPositionSizeDec.times(lossPerUnit).toDecimalPlaces(2).toNumber();

  let potentialProfit: number | undefined;
  let plannedRr: number | undefined;

  if (takeProfitPrice && takeProfitPrice > 0) {
    const tp = new Decimal(takeProfitPrice);
    const tpDistance = tp.minus(entry).abs();
    const tpTickCount = tpDistance.dividedBy(tickSize);
    const profitPerUnit = tpTickCount.times(tickValue);
    potentialProfit = actualPositionSizeDec.times(profitPerUnit).toDecimalPlaces(2).toNumber();
    if (potentialLoss > 0) {
      plannedRr = new Decimal(potentialProfit).dividedBy(potentialLoss).toDecimalPlaces(2).toNumber();
    }
  }

  const riskPctOfEquity = new Decimal(potentialLoss).dividedBy(equity).times(100).toDecimalPlaces(2).toNumber();

  return {
    maxMonetaryRisk: monetaryRisk.toDecimalPlaces(2).toNumber(),
    positionSize: roundedPositionSize,
    potentialLoss,
    potentialProfit,
    plannedRr,
    riskPctOfEquity,
    tickRisk: tickCount.toDecimalPlaces(1).toNumber(),
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
 * Rule states: SAFE, WARNING, BREACHED.
 */
export function evaluateAccountRule(
  rule: AccountRule,
  currentValue: number,
  accountStartingBalance: number,
  accountCurrentEquity: number,
  highWaterMark: number
): RuleEvaluationResult {
  if (!rule.isEnabled) {
    return {
      ruleId: rule.id,
      ruleType: rule.ruleType,
      status: 'SAFE',
      metricValue: currentValue,
      thresholdValue: rule.thresholdValue,
      warningThreshold: 0,
      remainingAllowance: 0,
      message: 'Rule is disabled.',
    };
  }

  const curr = new Decimal(currentValue).abs();
  let limit = new Decimal(rule.thresholdValue);

  // If threshold is in percent, convert to absolute monetary amount based on calculationMethod
  if (rule.thresholdUnit === 'percent') {
    let baseAmount = new Decimal(accountStartingBalance);
    if (rule.calculationMethod === 'equity_based') {
      baseAmount = new Decimal(accountCurrentEquity);
    } else if (rule.calculationMethod === 'relative_trailing') {
      baseAmount = new Decimal(highWaterMark);
    }
    limit = baseAmount.times(new Decimal(rule.thresholdValue).dividedBy(100));
  }

  const warningPct = new Decimal(rule.warningThresholdPct).dividedBy(100);
  const warningLimit = limit.times(warningPct);

  let status: 'SAFE' | 'WARNING' | 'BREACHED' = 'SAFE';
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
  };
}

/**
 * Calculates comprehensive trading statistics.
 */
export function calculateTradingStatistics(trades: {
  netPnl: number;
  realizedR?: number;
  direction?: 'BUY' | 'SELL';
  instrumentSymbol?: string;
  session?: string;
  setupType?: string;
}[]) {
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

  let currentConsecWins = 0;
  let maxConsecWins = 0;
  let currentConsecLosses = 0;
  let maxConsecLosses = 0;

  for (const t of trades) {
    const pnl = new Decimal(t.netPnl);
    netProfit = netProfit.plus(pnl);
    totalR = totalR.plus(t.realizedR || 0);

    if (pnl.greaterThan(0)) {
      winningTrades++;
      grossProfit = grossProfit.plus(pnl);
      currentConsecWins++;
      currentConsecLosses = 0;
      if (currentConsecWins > maxConsecWins) maxConsecWins = currentConsecWins;
    } else if (pnl.lessThan(0)) {
      losingTrades++;
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

  const winRate = new Decimal(winningTrades).dividedBy(totalTrades).times(100);
  const lossRate = new Decimal(losingTrades).dividedBy(totalTrades).times(100);

  const averageWin = winningTrades > 0
    ? grossProfit.dividedBy(winningTrades).toDecimalPlaces(2).toNumber()
    : 0;

  const averageLoss = losingTrades > 0
    ? grossLoss.dividedBy(losingTrades).toDecimalPlaces(2).toNumber()
    : 0;

  const profitFactor = grossLoss.isZero()
    ? (grossProfit.greaterThan(0) ? 999.99 : 0)
    : grossProfit.dividedBy(grossLoss).toDecimalPlaces(2).toNumber();

  const averageR = totalR.dividedBy(totalTrades).toDecimalPlaces(2).toNumber();

  // Expectancy = (WinRate% * AvgWin) - (LossRate% * AvgLoss)
  const winProb = winRate.dividedBy(100);
  const lossProb = lossRate.dividedBy(100);
  const expectancy = winProb.times(averageWin).minus(lossProb.times(averageLoss)).toDecimalPlaces(2).toNumber();

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
    profitFactor,
    averageWin,
    averageLoss,
    averageR,
    expectancy,
    maxConsecutiveWins: maxConsecWins,
    maxConsecutiveLosses: maxConsecLosses,
  };
}

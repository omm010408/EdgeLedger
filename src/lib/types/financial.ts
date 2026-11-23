export type InstrumentCategory = 'forex' | 'indices' | 'metals' | 'crypto' | 'commodities';

export interface InstrumentSpecification {
  symbol: string;
  name: string;
  category: InstrumentCategory;
  contractSize: number; // e.g. 100 for XAUUSD, 100000 for EURUSD, 1 for US30
  tickSize: number; // e.g. 0.01 for XAUUSD, 0.00001 for EURUSD, 1 for US30
  tickValue: number; // monetary value of 1 tick per 1 lot
  pointValue: number; // monetary value per point per 1 lot
  lotStep?: number; // e.g. 0.01 for forex/metals, 0.1 or 1 for indices
  minLot?: number; // e.g. 0.01
  baseCurrency: string;
  quoteCurrency: string;
}

export type TradeDirection = 'BUY' | 'SELL';
export type TradeStatus = 'PLANNED' | 'OPEN' | 'PARTIALLY_CLOSED' | 'CLOSED' | 'CANCELLED' | 'INVALIDATED';
export type ExecutionType = 'ENTRY' | 'PARTIAL_CLOSE' | 'FULL_CLOSE' | 'SL_HIT' | 'TP_HIT' | 'MANUAL_EXIT';

export interface TradeExecution {
  id: string;
  tradeId: string;
  allocationId?: string;
  accountId: string;
  executionType: ExecutionType;
  price: number;
  size: number; // position size (lots/contracts) closed or entered
  commission: number;
  swap: number;
  fees?: number;
  slippage?: number;
  realizedPnl: number;
  executionTime: string;
  notes?: string;
}

export interface TradeAllocation {
  id: string;
  tradeId: string;
  accountId: string;
  accountName?: string;
  allocatedPositionSize: number; // e.g. 2.0 lots
  allocatedRiskUsd: number;
  allocatedRiskPct: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit?: number;
  exitPrice?: number;
  realizedPnl: number;
  netPnl: number;
  commission: number;
  swap: number;
  fees: number;
  status: TradeStatus;
  executions: TradeExecution[];
}

export interface Trade {
  id: string;
  userId: string;
  instrumentSymbol: string;
  strategyId?: string;
  strategyName?: string;
  strategyVersion?: number;
  direction: TradeDirection;
  status: TradeStatus;
  environment?: 'live' | 'demo' | 'backtest';
  timeframe: string;
  session: 'Asian' | 'London' | 'London Close' | 'New York' | 'Sydney' | 'Off-Hours';
  setupType: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit?: number;
  plannedRiskUsd: number; // snapshotted at entry
  plannedRiskPct: number; // snapshotted at entry
  plannedRr: number; // snapshotted at entry
  realizedPnl: number;
  netPnl: number;
  realizedR: number; // computed against plannedRiskUsd
  totalCommission: number;
  totalSwap: number;
  totalFees: number;
  entryTime: string;
  exitTime?: string;
  tradeThesis?: string;
  technicalBias?: string;
  macroBias?: string;
  macroBiasContext?: {
    source: string;
    biasLabel: string;
    timestamp: string;
    dataQuality: 'VERIFIED' | 'PRELIMINARY';
  };
  marketConditions?: string;
  screenshots: string[];
  tags: string[];
  allocations: TradeAllocation[];
  checklistAnswers?: { [key: string]: boolean };
  isRuleCompliant: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AccountType = 
  | 'personal'
  | 'prop_evaluation'
  | 'prop_verification'
  | 'funded'
  | 'instant_funding'
  | 'demo'
  | 'custom';

export type AccountStatus = 'active' | 'passed' | 'failed' | 'funded' | 'archived' | 'closed';

export type RuleType = 
  | 'daily_loss_limit'
  | 'max_overall_loss'
  | 'trailing_drawdown'
  | 'profit_target'
  | 'min_trading_days'
  | 'max_trades_per_day'
  | 'max_open_positions'
  | 'max_open_risk_pct'
  | 'max_risk_per_trade_pct'
  | 'max_consecutive_losses';

export type RuleCalculationMethod = 'balance_based' | 'equity_based' | 'relative_trailing' | 'static';
export type RuleStatus = 'SAFE' | 'WARNING' | 'BREACHED' | 'UNKNOWN';

export interface AccountRule {
  id: string;
  accountId: string;
  ruleType: RuleType;
  thresholdValue: number;
  thresholdUnit: 'currency' | 'percent' | 'count' | 'days';
  calculationMethod: RuleCalculationMethod;
  warningThresholdPct: number; // e.g. 80 for 80% (must be < 100)
  isEnabled: boolean;
  currentStatus: RuleStatus;
  currentMetricValue: number;
  resetFrequency: 'daily' | 'weekly' | 'none';
  applicableTimezone: string;
  version?: number;
  effectiveFrom?: string;
}

export interface RuleEvaluationResult {
  ruleId: string;
  ruleType: RuleType;
  status: RuleStatus;
  metricValue: number;
  thresholdValue: number;
  warningThreshold: number;
  remainingAllowance: number;
  message: string;
  isDataComplete: boolean;
}

export interface TradingAccount {
  id: string;
  userId: string;
  name: string;
  brokerOrFirm: string;
  accountType: AccountType;
  currency: string;
  accountSize: number;
  startingBalance: number;
  currentBalance: number;
  currentEquity: number;
  highWaterMark: number;
  challengePhase: string;
  status: AccountStatus;
  isDemo?: boolean;
  positionMatchingMode?: 'hedging' | 'netting';
  rules: AccountRule[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PositionSizingInput {
  accountEquity: number;
  riskPercentage: number; // e.g. 1.0 for 1%
  entryPrice: number;
  stopLossPrice: number;
  takeProfitPrice?: number;
  instrument: InstrumentSpecification;
}

export interface PositionSizingResult {
  maxMonetaryRisk: number; // in account currency
  positionSize: number; // lot size or contract count rounded down to step
  potentialLoss: number; // actual loss after rounding down
  potentialProfit?: number;
  plannedRr?: number;
  riskPctOfEquity: number;
  tickRisk: number;
  actualRiskAfterRounding: number;
}

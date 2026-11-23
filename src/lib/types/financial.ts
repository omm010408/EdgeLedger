export type InstrumentCategory = 'forex' | 'indices' | 'metals' | 'crypto' | 'commodities';

export interface InstrumentSpecification {
  symbol: string;
  name: string;
  category: InstrumentCategory;
  contractSize: number; // e.g. 100 for XAUUSD, 100000 for EURUSD, 1 for US30
  tickSize: number; // e.g. 0.01 for XAUUSD, 0.00001 for EURUSD, 1 for US30
  tickValue: number; // monetary value of 1 tick per 1 lot
  pointValue: number; // monetary value per point per 1 lot
  baseCurrency: string;
  quoteCurrency: string;
}

export type TradeDirection = 'BUY' | 'SELL';
export type TradeStatus = 'PLANNED' | 'OPEN' | 'CLOSED' | 'CANCELLED';
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
  direction: TradeDirection;
  status: TradeStatus;
  timeframe: string;
  session: 'Asian' | 'London' | 'London Close' | 'New York' | 'Sydney' | 'Off-Hours';
  setupType: string;
  entryPrice: number;
  stopLoss: number;
  takeProfit?: number;
  plannedRiskUsd: number;
  plannedRiskPct: number;
  plannedRr: number;
  realizedPnl: number;
  netPnl: number;
  realizedR: number;
  totalCommission: number;
  totalSwap: number;
  totalFees: number;
  entryTime: string;
  exitTime?: string;
  tradeThesis?: string;
  technicalBias?: string;
  macroBias?: string;
  marketConditions?: string;
  screenshots: string[];
  tags: string[];
  allocations: TradeAllocation[];
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
export type RuleStatus = 'SAFE' | 'WARNING' | 'BREACHED';

export interface AccountRule {
  id: string;
  accountId: string;
  ruleType: RuleType;
  thresholdValue: number;
  thresholdUnit: 'currency' | 'percent' | 'count' | 'days';
  calculationMethod: RuleCalculationMethod;
  warningThresholdPct: number; // e.g. 70 for 70%
  isEnabled: boolean;
  currentStatus: RuleStatus;
  currentMetricValue: number;
  resetFrequency: 'daily' | 'weekly' | 'none';
  applicableTimezone: string;
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
  status: 'active' | 'breached' | 'passed' | 'archived';
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
  maxMonetaryRisk: number; // in account currency (e.g. $1000)
  positionSize: number; // lot size or contract count
  potentialLoss: number;
  potentialProfit?: number;
  plannedRr?: number;
  riskPctOfEquity: number;
  tickRisk: number;
}

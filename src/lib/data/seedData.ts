import {
  InstrumentSpecification,
  TradingAccount,
  Trade,
  AccountRule,
  TradeAllocation,
  TradeExecution
} from '../types/financial';

export interface Strategy {
  id: string;
  name: string;
  description: string;
  marketType: string;
  primaryTimeframes: string[];
  marketRegime: 'trending' | 'ranging' | 'breakout' | 'reversal' | 'any';
  entryConditions: string;
  exitConditions: string;
  stopLossMethodology: string;
  targetMethodology: string;
  riskRules: string;
  checklistItems: string[];
  currentVersion: number;
  isActive: boolean;
  createdAt: string;
}

export interface JournalEntry {
  id: string;
  entryDate: string; // YYYY-MM-DD
  marketConditions: string;
  macroEnvironment: string;
  higherTimeframeBias: string;
  technicalBias: string;
  tradingPlan: string;
  importantEconomicEvents: string;
  emotionalState: 'Calm' | 'Disciplined' | 'Anxious' | 'Euphoric' | 'Frustrated' | 'Neutral';
  dailySummary: string;
  lessonsLearned: string;
  disciplineScore: number; // 1-10
  preparationScore: number; // 1-10
  executionScore: number; // 1-10
  riskManagementScore?: number; // 1-10
  emotionalControlScore?: number; // 1-10
  decisionQualityScore?: number; // 1-10 (calculated)
  fomoDetected: boolean;
  revengeTrading: boolean;
  overtrading: boolean;
  movedStopLoss: boolean;
  prematureExit: boolean;
  ignoredRules: boolean;
  isLocked?: boolean;
}

export interface RiskAlert {
  id: string;
  accountId: string;
  accountName: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  ruleType: string;
  acknowledged: boolean;
  createdAt: string;
}

export const SEED_INSTRUMENTS: InstrumentSpecification[] = [
  {
    symbol: 'XAUUSD',
    name: 'Gold / US Dollar',
    category: 'metals',
    contractSize: 100.0,
    tickSize: 0.01,
    tickValue: 1.0,
    pointValue: 100.0,
    lotStep: 0.01,
    minLot: 0.01,
    baseCurrency: 'XAU',
    quoteCurrency: 'USD'
  },
  {
    symbol: 'US30',
    name: 'Dow Jones Industrial 30',
    category: 'indices',
    contractSize: 1.0,
    tickSize: 1.0,
    tickValue: 1.0,
    pointValue: 1.0,
    lotStep: 1.0,
    minLot: 1.0,
    baseCurrency: 'USD',
    quoteCurrency: 'USD'
  },
  {
    symbol: 'US500',
    name: 'S&P 500 Index',
    category: 'indices',
    contractSize: 1.0,
    tickSize: 0.1,
    tickValue: 0.1,
    pointValue: 1.0,
    lotStep: 0.1,
    minLot: 0.1,
    baseCurrency: 'USD',
    quoteCurrency: 'USD'
  },
  {
    symbol: 'NAS100',
    name: 'Nasdaq 100 Index',
    category: 'indices',
    contractSize: 1.0,
    tickSize: 0.25,
    tickValue: 0.25,
    pointValue: 1.0,
    lotStep: 0.1,
    minLot: 0.1,
    baseCurrency: 'USD',
    quoteCurrency: 'USD'
  },
  {
    symbol: 'EURUSD',
    name: 'Euro / US Dollar',
    category: 'forex',
    contractSize: 100000.0,
    tickSize: 0.00001,
    tickValue: 1.0,
    pointValue: 100000.0,
    lotStep: 0.01,
    minLot: 0.01,
    baseCurrency: 'EUR',
    quoteCurrency: 'USD'
  },
  {
    symbol: 'GBPUSD',
    name: 'British Pound / US Dollar',
    category: 'forex',
    contractSize: 100000.0,
    tickSize: 0.00001,
    tickValue: 1.0,
    pointValue: 100000.0,
    lotStep: 0.01,
    minLot: 0.01,
    baseCurrency: 'GBP',
    quoteCurrency: 'USD'
  },
  {
    symbol: 'BTCUSD',
    name: 'Bitcoin / US Dollar',
    category: 'crypto',
    contractSize: 1.0,
    tickSize: 0.5,
    tickValue: 0.5,
    pointValue: 1.0,
    lotStep: 0.01,
    minLot: 0.01,
    baseCurrency: 'BTC',
    quoteCurrency: 'USD'
  },
  {
    symbol: 'USOIL',
    name: 'WTI Crude Oil',
    category: 'commodities',
    contractSize: 1000.0,
    tickSize: 0.01,
    tickValue: 10.0,
    pointValue: 1000.0,
    lotStep: 0.01,
    minLot: 0.01,
    baseCurrency: 'USD',
    quoteCurrency: 'USD'
  }
];

export const SEED_ACCOUNTS: TradingAccount[] = [
  {
    id: 'acc-apex-100k',
    userId: 'user-default',
    name: 'Apex Trader Funded 100K',
    brokerOrFirm: 'Apex Trader Funding',
    accountType: 'funded',
    currency: 'USD',
    accountSize: 100000,
    startingBalance: 100000,
    currentBalance: 105420,
    currentEquity: 105420,
    highWaterMark: 106800,
    challengePhase: 'Funded Live',
    status: 'active',
    isDemo: false,
    positionMatchingMode: 'hedging',
    notes: 'Max trailing drawdown is $5,000 based on intraday peak equity. Enforce $4,000 warning threshold.',
    createdAt: '2024-01-10T08:00:00Z',
    updatedAt: '2024-03-20T16:00:00Z',
    rules: [
      {
        id: 'rule-apex-1',
        accountId: 'acc-apex-100k',
        ruleType: 'daily_loss_limit',
        thresholdValue: 2500,
        thresholdUnit: 'currency',
        calculationMethod: 'equity_based',
        warningThresholdPct: 80,
        isEnabled: true,
        currentStatus: 'SAFE',
        currentMetricValue: 420,
        resetFrequency: 'daily',
        applicableTimezone: 'America/New_York'
      },
      {
        id: 'rule-apex-2',
        accountId: 'acc-apex-100k',
        ruleType: 'trailing_drawdown',
        thresholdValue: 5000,
        thresholdUnit: 'currency',
        calculationMethod: 'relative_trailing',
        warningThresholdPct: 80,
        isEnabled: true,
        currentStatus: 'SAFE',
        currentMetricValue: 1380, // HWM 106800 - 105420 = 1380
        resetFrequency: 'none',
        applicableTimezone: 'America/New_York'
      },
      {
        id: 'rule-apex-3',
        accountId: 'acc-apex-100k',
        ruleType: 'max_risk_per_trade_pct',
        thresholdValue: 1.5,
        thresholdUnit: 'percent',
        calculationMethod: 'equity_based',
        warningThresholdPct: 80,
        isEnabled: true,
        currentStatus: 'SAFE',
        currentMetricValue: 1.0,
        resetFrequency: 'none',
        applicableTimezone: 'America/New_York'
      }
    ]
  },
  {
    id: 'acc-ftmo-50k',
    userId: 'user-default',
    name: 'FTMO Challenge 50K',
    brokerOrFirm: 'FTMO',
    accountType: 'prop_evaluation',
    currency: 'USD',
    accountSize: 50000,
    startingBalance: 50000,
    currentBalance: 53280,
    currentEquity: 53280,
    highWaterMark: 53280,
    challengePhase: 'Phase 1 ($5,000 Target)',
    status: 'active',
    isDemo: false,
    positionMatchingMode: 'hedging',
    notes: 'Aiming for 10% profit target ($5,000). Max daily loss $2,500, max total loss $5,000.',
    createdAt: '2024-02-01T08:00:00Z',
    updatedAt: '2024-03-20T16:00:00Z',
    rules: [
      {
        id: 'rule-ftmo-1',
        accountId: 'acc-ftmo-50k',
        ruleType: 'daily_loss_limit',
        thresholdValue: 2500,
        thresholdUnit: 'currency',
        calculationMethod: 'balance_based',
        warningThresholdPct: 80,
        isEnabled: true,
        currentStatus: 'SAFE',
        currentMetricValue: 650,
        resetFrequency: 'daily',
        applicableTimezone: 'Europe/Prague'
      },
      {
        id: 'rule-ftmo-2',
        accountId: 'acc-ftmo-50k',
        ruleType: 'max_overall_loss',
        thresholdValue: 5000,
        thresholdUnit: 'currency',
        calculationMethod: 'static',
        warningThresholdPct: 80,
        isEnabled: true,
        currentStatus: 'SAFE',
        currentMetricValue: 0,
        resetFrequency: 'none',
        applicableTimezone: 'Europe/Prague'
      },
      {
        id: 'rule-ftmo-3',
        accountId: 'acc-ftmo-50k',
        ruleType: 'profit_target',
        thresholdValue: 5000,
        thresholdUnit: 'currency',
        calculationMethod: 'static',
        warningThresholdPct: 90,
        isEnabled: true,
        currentStatus: 'SAFE',
        currentMetricValue: 3280, // $3280 reached of $5000
        resetFrequency: 'none',
        applicableTimezone: 'Europe/Prague'
      }
    ]
  },
  {
    id: 'acc-icmarkets-25k',
    userId: 'user-default',
    name: 'IC Markets Raw ECN',
    brokerOrFirm: 'IC Markets',
    accountType: 'personal',
    currency: 'USD',
    accountSize: 25000,
    startingBalance: 25000,
    currentBalance: 27150,
    currentEquity: 27150,
    highWaterMark: 27150,
    challengePhase: 'Personal Capital',
    status: 'active',
    isDemo: false,
    positionMatchingMode: 'hedging',
    notes: 'Personal live discretionary swing and intraday account with institutional cTrader execution.',
    createdAt: '2023-11-15T08:00:00Z',
    updatedAt: '2024-03-20T16:00:00Z',
    rules: [
      {
        id: 'rule-ic-1',
        accountId: 'acc-icmarkets-25k',
        ruleType: 'daily_loss_limit',
        thresholdValue: 1000,
        thresholdUnit: 'currency',
        calculationMethod: 'balance_based',
        warningThresholdPct: 80,
        isEnabled: true,
        currentStatus: 'SAFE',
        currentMetricValue: 120,
        resetFrequency: 'daily',
        applicableTimezone: 'UTC'
      },
      {
        id: 'rule-ic-2',
        accountId: 'acc-icmarkets-25k',
        ruleType: 'max_open_risk_pct',
        thresholdValue: 3.0,
        thresholdUnit: 'percent',
        calculationMethod: 'equity_based',
        warningThresholdPct: 80,
        isEnabled: true,
        currentStatus: 'SAFE',
        currentMetricValue: 1.0,
        resetFrequency: 'none',
        applicableTimezone: 'UTC'
      }
    ]
  }
];

export const SEED_STRATEGIES: Strategy[] = [
  {
    id: 'strat-london-sweep',
    name: 'London Liquidity Sweep & Reversal',
    description: 'Capitalizes on Asian session range sweeps during London open (07:00-09:30 UTC) with fair value gap entries.',
    marketType: 'Forex & Metals',
    primaryTimeframes: ['15M', '1H'],
    marketRegime: 'reversal',
    entryConditions: 'Price sweeps previous Asian high/low, displays market structure shift (MSS) on 5M, and fills into FVG.',
    exitConditions: 'Opposing liquidity pool (internal or external range liquidity) or fixed 2.5R to 3.0R.',
    stopLossMethodology: '1 tick outside the swing high/low that caused the liquidity sweep.',
    targetMethodology: 'Target nearest unmitigated orderblock or session low/high.',
    riskRules: 'Max 1.0% risk per execution. If London open moves > 100 pips before sweep, cancel setup.',
    checklistItems: [
      'Asian range cleanly defined (< 40 pips)',
      'Clear sweep of Asian High or Low',
      'Market structure shift with displacement on 5M',
      'Entry limit set at 50% discount of FVG',
      'Stop loss placed beyond sweep high/low'
    ],
    currentVersion: 1,
    isActive: true,
    createdAt: '2024-01-05T10:00:00Z'
  },
  {
    id: 'strat-ny-fvg',
    name: 'NY Session FVG Continuation',
    description: 'Trend continuation model trading New York morning session (13:30-15:30 UTC) during institutional displacement.',
    marketType: 'Indices (US30, NAS100, US500)',
    primaryTimeframes: ['5M', '15M'],
    marketRegime: 'trending',
    entryConditions: 'Daily bias aligns with higher timeframe trend. 15M break of structure during NYSE open followed by 5M retest.',
    exitConditions: 'Fixed 2.0R with 50% partial at 1.5R and moving SL to break-even.',
    stopLossMethodology: 'Placed below/above the displacement candle low/high.',
    targetMethodology: 'Previous day high/low or Fibonacci -0.272 expansion.',
    riskRules: 'Max 0.75% risk. Do not enter during high-impact FOMC or CPI releases.',
    checklistItems: [
      'HTF daily trend confirmed',
      'NYSE opening bell (09:30 EST) direction established',
      'Clean displacement candle with low volume node / FVG',
      'Reward to risk ratio is at least 2:1',
      'No pending red folder news in next 30 minutes'
    ],
    currentVersion: 1,
    isActive: true,
    createdAt: '2024-01-12T10:00:00Z'
  },
  {
    id: 'strat-htf-orderflow',
    name: 'HTF Orderflow & Orderblock Retest',
    description: 'Swing and multi-day position trading based on 4H/Daily institutional order blocks and liquidity pools.',
    marketType: 'Gold & Crypto',
    primaryTimeframes: ['1H', '4H', 'D1'],
    marketRegime: 'trending',
    entryConditions: 'Retest of unmitigated 4H orderblock inside an established macro trend.',
    exitConditions: 'Trailing stop behind subsequent 4H swing structures.',
    stopLossMethodology: 'Below the 4H orderblock invalidation point.',
    targetMethodology: 'Weekly liquidity highs or new all-time highs.',
    riskRules: '1.0% risk with max 2 scaling positions.',
    checklistItems: [
      'Macro weekly trend bullish or bearish',
      '4H orderblock has not been previously tapped',
      'Confluence with 61.8% or 78.6% OTE Fib level',
      'Volume expansion on initial impulse'
    ],
    currentVersion: 1,
    isActive: true,
    createdAt: '2024-01-18T10:00:00Z'
  }
];

export const SEED_TRADES: Trade[] = [
  {
    id: 'tr-001',
    userId: 'user-default',
    instrumentSymbol: 'XAUUSD',
    strategyId: 'strat-london-sweep',
    strategyName: 'London Liquidity Sweep & Reversal',
    strategyVersion: 1,
    direction: 'BUY',
    status: 'CLOSED',
    environment: 'live',
    timeframe: '15M',
    session: 'London',
    setupType: 'Asian Low Sweep + FVG',
    entryPrice: 2685.50,
    stopLoss: 2677.50,
    takeProfit: 2709.50,
    plannedRiskUsd: 1000,
    plannedRiskPct: 1.0,
    plannedRr: 3.0,
    realizedPnl: 2940,
    netPnl: 2880,
    realizedR: 2.88,
    totalCommission: 40,
    totalSwap: 20,
    totalFees: 0,
    entryTime: '2024-03-18T08:15:00Z',
    exitTime: '2024-03-18T11:45:00Z',
    tradeThesis: 'Gold swept Asian lows at 2680 during 08:00 London open, followed by explosive 5M bullish displacement.',
    technicalBias: 'Bullish HTF daily orderflow with unmitigated 4H fair value gap above at 2715.',
    macroBias: 'US Dollar weakness ahead of CPI data release.',
    macroBiasContext: {
      source: 'Macro Data Terminal',
      biasLabel: 'Bearish USD / Bullish Metals',
      timestamp: '2024-03-18T07:30:00Z',
      dataQuality: 'VERIFIED'
    },
    marketConditions: 'Clean trend, high London session liquidity.',
    screenshots: [],
    tags: ['A+ Setup', 'London Open', 'Gold', 'Partial Exit'],
    isRuleCompliant: true,
    createdAt: '2024-03-18T08:15:00Z',
    updatedAt: '2024-03-18T11:45:00Z',
    allocations: [
      {
        id: 'alloc-001-apex',
        tradeId: 'tr-001',
        accountId: 'acc-apex-100k',
        accountName: 'Apex Trader Funded 100K',
        allocatedPositionSize: 1.25,
        allocatedRiskUsd: 1000,
        allocatedRiskPct: 1.0,
        entryPrice: 2685.50,
        stopLoss: 2677.50,
        takeProfit: 2709.50,
        exitPrice: 2708.50,
        realizedPnl: 2875,
        netPnl: 2820,
        commission: 35,
        swap: 20,
        fees: 0,
        status: 'CLOSED',
        executions: [
          {
            id: 'exec-001-1',
            tradeId: 'tr-001',
            allocationId: 'alloc-001-apex',
            accountId: 'acc-apex-100k',
            executionType: 'ENTRY',
            price: 2685.50,
            size: 1.25,
            commission: 20,
            swap: 0,
            realizedPnl: 0,
            executionTime: '2024-03-18T08:15:00Z',
            notes: 'Initial market entry at 50% discount of 15M FVG'
          },
          {
            id: 'exec-001-2',
            tradeId: 'tr-001',
            allocationId: 'alloc-001-apex',
            accountId: 'acc-apex-100k',
            executionType: 'PARTIAL_CLOSE',
            price: 2701.50,
            size: 0.75,
            commission: 10,
            swap: 10,
            realizedPnl: 1200,
            executionTime: '2024-03-18T10:00:00Z',
            notes: 'Scaled out 60% position at 2.0R'
          },
          {
            id: 'exec-001-3',
            tradeId: 'tr-001',
            allocationId: 'alloc-001-apex',
            accountId: 'acc-apex-100k',
            executionType: 'TP_HIT',
            price: 2708.50,
            size: 0.50,
            commission: 5,
            swap: 10,
            realizedPnl: 1675,
            executionTime: '2024-03-18T11:45:00Z',
            notes: 'Runner closed near session high target'
          }
        ]
      }
    ]
  },
  {
    id: 'tr-002',
    userId: 'user-default',
    instrumentSymbol: 'US30',
    strategyId: 'strat-ny-fvg',
    strategyName: 'NY Session FVG Continuation',
    strategyVersion: 1,
    direction: 'SELL',
    status: 'CLOSED',
    environment: 'live',
    timeframe: '5M',
    session: 'New York',
    setupType: 'Displacement Breakout',
    entryPrice: 43850,
    stopLoss: 43950,
    takeProfit: 43600,
    plannedRiskUsd: 500,
    plannedRiskPct: 1.0,
    plannedRr: 2.5,
    realizedPnl: 1250,
    netPnl: 1235,
    realizedR: 2.47,
    totalCommission: 15,
    totalSwap: 0,
    totalFees: 0,
    entryTime: '2024-03-18T14:00:00Z',
    exitTime: '2024-03-18T15:10:00Z',
    tradeThesis: 'US30 rejected morning highs, printed massive bearish displacement candle through London support.',
    technicalBias: 'Bearish momentum on 1H chart, tapping into liquidity below 43,650.',
    macroBias: 'Higher yields pressuring US tech and industrial equities.',
    marketConditions: 'High volatility, aggressive seller volume.',
    screenshots: [],
    tags: ['US30', 'NY Open', 'Trend Continuation'],
    isRuleCompliant: true,
    createdAt: '2024-03-18T14:00:00Z',
    updatedAt: '2024-03-18T15:10:00Z',
    allocations: [
      {
        id: 'alloc-002-ftmo',
        tradeId: 'tr-002',
        accountId: 'acc-ftmo-50k',
        accountName: 'FTMO Challenge 50K',
        allocatedPositionSize: 5.0,
        allocatedRiskUsd: 500,
        allocatedRiskPct: 1.0,
        entryPrice: 43850,
        stopLoss: 43950,
        takeProfit: 43600,
        exitPrice: 43600,
        realizedPnl: 1250,
        netPnl: 1235,
        commission: 15,
        swap: 0,
        fees: 0,
        status: 'CLOSED',
        executions: [
          {
            id: 'exec-002-1',
            tradeId: 'tr-002',
            allocationId: 'alloc-002-ftmo',
            accountId: 'acc-ftmo-50k',
            executionType: 'ENTRY',
            price: 43850,
            size: 5.0,
            commission: 8,
            swap: 0,
            realizedPnl: 0,
            executionTime: '2024-03-18T14:00:00Z'
          },
          {
            id: 'exec-002-2',
            tradeId: 'tr-002',
            allocationId: 'alloc-002-ftmo',
            accountId: 'acc-ftmo-50k',
            executionType: 'TP_HIT',
            price: 43600,
            size: 5.0,
            commission: 7,
            swap: 0,
            realizedPnl: 1250,
            executionTime: '2024-03-18T15:10:00Z'
          }
        ]
      }
    ]
  },
  {
    id: 'tr-003',
    userId: 'user-default',
    instrumentSymbol: 'EURUSD',
    strategyId: 'strat-london-sweep',
    strategyName: 'London Liquidity Sweep & Reversal',
    strategyVersion: 1,
    direction: 'BUY',
    status: 'CLOSED',
    environment: 'live',
    timeframe: '15M',
    session: 'London',
    setupType: 'Liquidity Grab',
    entryPrice: 1.08250,
    stopLoss: 1.08100,
    takeProfit: 1.08650,
    plannedRiskUsd: 300,
    plannedRiskPct: 0.6,
    plannedRr: 2.67,
    realizedPnl: -300,
    netPnl: -314,
    realizedR: -1.0,
    totalCommission: 14,
    totalSwap: 0,
    totalFees: 0,
    entryTime: '2024-03-19T07:45:00Z',
    exitTime: '2024-03-19T08:20:00Z',
    tradeThesis: 'Anticipated false break of daily open support on EURUSD.',
    technicalBias: 'Neutral to slightly bullish, tried to front-run the reversal.',
    macroBias: 'Eurozone industrial output slightly below expectations.',
    marketConditions: 'Choppy conditions before London session open.',
    screenshots: [],
    tags: ['Loss', 'EURUSD', 'Front-Run'],
    isRuleCompliant: false,
    createdAt: '2024-03-19T07:45:00Z',
    updatedAt: '2024-03-19T08:20:00Z',
    allocations: [
      {
        id: 'alloc-003-ic',
        tradeId: 'tr-003',
        accountId: 'acc-icmarkets-25k',
        accountName: 'IC Markets Raw ECN',
        allocatedPositionSize: 2.0,
        allocatedRiskUsd: 300,
        allocatedRiskPct: 1.2,
        entryPrice: 1.08250,
        stopLoss: 1.08100,
        takeProfit: 1.08650,
        exitPrice: 1.08100,
        realizedPnl: -300,
        netPnl: -314,
        commission: 14,
        swap: 0,
        fees: 0,
        status: 'CLOSED',
        executions: [
          {
            id: 'exec-003-1',
            tradeId: 'tr-003',
            allocationId: 'alloc-003-ic',
            accountId: 'acc-icmarkets-25k',
            executionType: 'ENTRY',
            price: 1.08250,
            size: 2.0,
            commission: 7,
            swap: 0,
            realizedPnl: 0,
            executionTime: '2024-03-19T07:45:00Z'
          },
          {
            id: 'exec-003-2',
            tradeId: 'tr-003',
            allocationId: 'alloc-003-ic',
            accountId: 'acc-icmarkets-25k',
            executionType: 'SL_HIT',
            price: 1.08100,
            size: 2.0,
            commission: 7,
            swap: 0,
            realizedPnl: -300,
            executionTime: '2024-03-19T08:20:00Z'
          }
        ]
      }
    ]
  },
  {
    id: 'tr-004',
    userId: 'user-default',
    instrumentSymbol: 'BTCUSD',
    strategyId: 'strat-htf-orderflow',
    strategyName: 'HTF Orderflow & Orderblock Retest',
    strategyVersion: 1,
    direction: 'BUY',
    status: 'CLOSED',
    environment: 'live',
    timeframe: '1H',
    session: 'New York',
    setupType: '4H Orderblock Tap',
    entryPrice: 65200,
    stopLoss: 64100,
    takeProfit: 68500,
    plannedRiskUsd: 1100,
    plannedRiskPct: 1.1,
    plannedRr: 3.0,
    realizedPnl: 3300,
    netPnl: 3270,
    realizedR: 2.97,
    totalCommission: 30,
    totalSwap: 0,
    totalFees: 0,
    entryTime: '2024-03-19T16:00:00Z',
    exitTime: '2024-03-20T04:30:00Z',
    tradeThesis: 'Bitcoin retested 4H demand zone following weekend correction. High spot accumulation observed.',
    technicalBias: 'Clear bullish market structure on daily and 4H charts.',
    macroBias: 'Institutional ETF inflows continuing at record pace.',
    marketConditions: 'Strong institutional orderflow.',
    screenshots: [],
    tags: ['Bitcoin', 'Crypto', 'Swing', 'A+ Setup'],
    isRuleCompliant: true,
    createdAt: '2024-03-19T16:00:00Z',
    updatedAt: '2024-03-20T04:30:00Z',
    allocations: [
      {
        id: 'alloc-004-apex',
        tradeId: 'tr-004',
        accountId: 'acc-apex-100k',
        accountName: 'Apex Trader Funded 100K',
        allocatedPositionSize: 1.0,
        allocatedRiskUsd: 1100,
        allocatedRiskPct: 1.1,
        entryPrice: 65200,
        stopLoss: 64100,
        takeProfit: 68500,
        exitPrice: 68500,
        realizedPnl: 3300,
        netPnl: 3270,
        commission: 30,
        swap: 0,
        fees: 0,
        status: 'CLOSED',
        executions: [
          {
            id: 'exec-004-1',
            tradeId: 'tr-004',
            allocationId: 'alloc-004-apex',
            accountId: 'acc-apex-100k',
            executionType: 'ENTRY',
            price: 65200,
            size: 1.0,
            commission: 15,
            swap: 0,
            realizedPnl: 0,
            executionTime: '2024-03-19T16:00:00Z'
          },
          {
            id: 'exec-004-2',
            tradeId: 'tr-004',
            allocationId: 'alloc-004-apex',
            accountId: 'acc-apex-100k',
            executionType: 'TP_HIT',
            price: 68500,
            size: 1.0,
            commission: 15,
            swap: 0,
            realizedPnl: 3300,
            executionTime: '2024-03-20T04:30:00Z'
          }
        ]
      }
    ]
  },
  {
    id: 'tr-005',
    userId: 'user-default',
    instrumentSymbol: 'XAUUSD',
    strategyId: 'strat-london-sweep',
    strategyName: 'London Liquidity Sweep & Reversal',
    strategyVersion: 1,
    direction: 'SELL',
    status: 'OPEN',
    environment: 'live',
    timeframe: '15M',
    session: 'London',
    setupType: 'Asian High Sweep',
    entryPrice: 2712.00,
    stopLoss: 2718.00,
    takeProfit: 2694.00,
    plannedRiskUsd: 600,
    plannedRiskPct: 0.6,
    plannedRr: 3.0,
    realizedPnl: 0,
    netPnl: 0,
    realizedR: 0,
    totalCommission: 20,
    totalSwap: 0,
    totalFees: 0,
    entryTime: '2024-03-20T08:30:00Z',
    tradeThesis: 'Gold spiked above 2710 psychological level at London open, formed inverted pinbar on 15M.',
    technicalBias: 'Exhaustion at key 4H resistance with high volume rejection.',
    macroBias: 'Treasury yields ticking upward prior to FOMC meeting.',
    marketConditions: 'Active session liquidity with wide spreads.',
    screenshots: [],
    tags: ['Live Trade', 'Gold', 'London Sweep'],
    isRuleCompliant: true,
    createdAt: '2024-03-20T08:30:00Z',
    updatedAt: '2024-03-20T08:30:00Z',
    allocations: [
      {
        id: 'alloc-005-ftmo',
        tradeId: 'tr-005',
        accountId: 'acc-ftmo-50k',
        accountName: 'FTMO Challenge 50K',
        allocatedPositionSize: 1.0,
        allocatedRiskUsd: 600,
        allocatedRiskPct: 1.15,
        entryPrice: 2712.00,
        stopLoss: 2718.00,
        takeProfit: 2694.00,
        realizedPnl: 0,
        netPnl: 0,
        commission: 20,
        swap: 0,
        fees: 0,
        status: 'OPEN',
        executions: [
          {
            id: 'exec-005-1',
            tradeId: 'tr-005',
            allocationId: 'alloc-005-ftmo',
            accountId: 'acc-ftmo-50k',
            executionType: 'ENTRY',
            price: 2712.00,
            size: 1.0,
            commission: 20,
            swap: 0,
            realizedPnl: 0,
            executionTime: '2024-03-20T08:30:00Z',
            notes: 'Opened position at London sweep rejection'
          }
        ]
      }
    ]
  }
];

export const SEED_JOURNAL: JournalEntry[] = [
  {
    id: 'j-2024-03-18',
    entryDate: '2024-03-18',
    marketConditions: 'Healthy volatility across London and New York sessions.',
    macroEnvironment: 'US yields slightly softer; geopolitical tensions elevating metals.',
    higherTimeframeBias: 'Bullish Gold, Bearish US30, Neutral EURUSD.',
    technicalBias: 'Followed 15M sweep models cleanly.',
    tradingPlan: 'Only trade London open sweep and NY session displacement. No afternoon chop.',
    importantEconomicEvents: 'No high-tier red folder news today.',
    emotionalState: 'Disciplined',
    dailySummary: 'Executed 2 trades (XAUUSD and US30), both hit full take profit. Scaled out properly and let runners breathe.',
    lessonsLearned: 'Sticking to predefined R-multiples and not closing early yielded an extra 1.2R overall.',
    disciplineScore: 10,
    preparationScore: 9,
    executionScore: 10,
    riskManagementScore: 10,
    emotionalControlScore: 9,
    decisionQualityScore: 10,
    fomoDetected: false,
    revengeTrading: false,
    overtrading: false,
    movedStopLoss: false,
    prematureExit: false,
    ignoredRules: false,
    isLocked: true
  },
  {
    id: 'j-2024-03-19',
    entryDate: '2024-03-19',
    marketConditions: 'Choppy London open, followed by strong trending afternoon.',
    macroEnvironment: 'DXY hovering around 103.50.',
    higherTimeframeBias: 'Bullish BTC, Bullish Gold.',
    technicalBias: 'Took a premature EURUSD buy before confirmation.',
    tradingPlan: 'Wait for 5M market structure shift before entering reversals.',
    importantEconomicEvents: 'German ZEW Economic Sentiment at 10:00 UTC.',
    emotionalState: 'Frustrated',
    dailySummary: 'Violated checklist on EURUSD by front-running the signal. Lost $314. Recovered on BTC swing with $3,270 profit.',
    lessonsLearned: 'Even though net PnL ended very green, the EURUSD trade was poor discipline. Profit does not validate rule breaks.',
    disciplineScore: 5,
    preparationScore: 7,
    executionScore: 6,
    riskManagementScore: 7,
    emotionalControlScore: 5,
    decisionQualityScore: 6,
    fomoDetected: true,
    revengeTrading: false,
    overtrading: false,
    movedStopLoss: false,
    prematureExit: false,
    ignoredRules: true,
    isLocked: true
  },
  {
    id: 'j-2024-03-20',
    entryDate: '2024-03-20',
    marketConditions: 'High anticipation ahead of US FOMC rate statement.',
    macroEnvironment: 'Fed interest rate decision scheduled at 18:00 UTC.',
    higherTimeframeBias: 'High caution. Wide ranges.',
    technicalBias: 'Gold showing exhaustion at 2712.',
    tradingPlan: 'Trade only 1 short position during London. Flatten all positions 2 hours before FOMC.',
    importantEconomicEvents: 'FOMC Statement & Fed Press Conference (Red Folder).',
    emotionalState: 'Calm',
    dailySummary: 'Entered London Gold sell with tight stop. Monitoring rule limits carefully.',
    lessonsLearned: 'FOMC days require 50% reduced size or staying on hands.',
    disciplineScore: 9,
    preparationScore: 9,
    executionScore: 8,
    riskManagementScore: 9,
    emotionalControlScore: 9,
    decisionQualityScore: 9,
    fomoDetected: false,
    revengeTrading: false,
    overtrading: false,
    movedStopLoss: false,
    prematureExit: false,
    ignoredRules: false,
    isLocked: false
  }
];

export const SEED_ALERTS: RiskAlert[] = [
  {
    id: 'alt-001',
    accountId: 'acc-ftmo-50k',
    accountName: 'FTMO Challenge 50K',
    severity: 'warning',
    title: 'Daily Loss Buffer Alert',
    description: 'Current daily drawdown has reached $650 (26% of $2,500 limit). Safe buffer remains $1,850.',
    ruleType: 'daily_loss_limit',
    acknowledged: false,
    createdAt: '2024-03-20T09:15:00Z'
  },
  {
    id: 'alt-002',
    accountId: 'acc-apex-100k',
    accountName: 'Apex Trader Funded 100K',
    severity: 'info',
    title: 'High-Water Mark Updated',
    description: 'New peak equity recorded at $106,800. Trailing drawdown threshold adjusted to $101,800.',
    ruleType: 'trailing_drawdown',
    acknowledged: true,
    createdAt: '2024-03-19T20:00:00Z'
  }
];

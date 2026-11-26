import { supabase, isSupabaseConfigured } from './client';
import {
  TradingAccount,
  Trade,
  TradeAllocation,
  TradeExecution,
  AccountRule,
} from '../types/financial';
import { Strategy, JournalEntry, RiskAlert } from '../data/seedData';
import { SyncTombstone } from '../sync/syncEngine';

/**
 * Transforms a Supabase trading_account record into the application TradingAccount domain model.
 */
export function mapSupabaseToAccount(row: any, rules: AccountRule[] = []): TradingAccount {
  return {
    id: row.id,
    userId: row.user_id || 'user-default',
    name: row.name,
    brokerOrFirm: row.broker_or_firm || 'Apex Trader Funding',
    accountType: row.account_type || 'prop_evaluation',
    currency: row.currency || 'USD',
    accountSize: Number(row.account_size) || 100000,
    startingBalance: Number(row.starting_balance) || 100000,
    currentBalance: Number(row.current_balance) || 100000,
    currentEquity: Number(row.current_equity) || 100000,
    highWaterMark: Number(row.high_water_mark) || 100000,
    challengePhase: row.challenge_phase || 'Phase 1',
    status: row.status || 'active',
    isDemo: Boolean(row.is_demo),
    notes: row.notes || '',
    rules: rules.filter((r) => r.accountId === row.id),
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

/**
 * Transforms a Supabase account_rules record into the application AccountRule domain model.
 */
export function mapSupabaseToRule(row: any): AccountRule {
  return {
    id: row.id,
    accountId: row.account_id,
    ruleType: row.rule_type,
    thresholdValue: Number(row.threshold_value),
    thresholdUnit: row.threshold_unit || 'currency',
    calculationMethod: row.calculation_method || 'balance_based',
    warningThresholdPct: Number(row.warning_threshold_pct) || 80,
    isEnabled: Boolean(row.is_enabled),
    currentStatus: row.current_status || 'SAFE',
    currentMetricValue: Number(row.current_metric_value) || 0,
    resetFrequency: row.reset_frequency || 'daily',
    applicableTimezone: row.applicable_timezone || 'UTC',
  };
}

const DEFAULT_ANON_USER_ID = '00000000-0000-0000-0000-000000000000';
const ALLOWED_DB_SESSIONS = new Set([
  'Asia',
  'Asian',
  'London',
  'London Close',
  'New York',
  'Sydney',
  'Off-Hours',
]);

function normalizeTradeSession(session?: string): string {
  if (session && ALLOWED_DB_SESSIONS.has(session)) return session;
  return 'London';
}

function isOptionalColumnSchemaError(msg?: string): boolean {
  if (!msg) return false;
  const lower = msg.toLowerCase();
  return (
    lower.includes('column') &&
    (lower.includes('does not exist') || lower.includes('schema cache'))
  );
}

/**
 * Transforms a Supabase trade row and its allocations into the application Trade domain model.
 */
export function mapSupabaseToTrade(row: any, allocations: TradeAllocation[] = []): Trade {
  return {
    id: row.id,
    userId: row.user_id || DEFAULT_ANON_USER_ID,
    instrumentSymbol: row.instrument_symbol,
    strategyId: row.strategy_id || undefined,
    strategyName: row.strategy_name || undefined,
    strategyVersion: Number(row.strategy_version) || 1,
    direction: row.direction || 'BUY',
    status: row.status || 'CLOSED',
    environment: row.environment || 'live',
    timeframe: row.timeframe || '15M',
    session: row.session || 'London',
    setupType: row.setup_type || 'Discretionary',
    entryPrice: Number(row.entry_price),
    stopLoss: Number(row.stop_loss),
    takeProfit: row.take_profit ? Number(row.take_profit) : undefined,
    plannedRiskUsd: Number(row.planned_risk_usd) || 500,
    plannedRiskPct: Number(row.planned_risk_pct) || 1.0,
    plannedRr: Number(row.planned_rr) || 2.0,
    realizedPnl: Number(row.realized_pnl) || 0,
    netPnl: Number(row.net_pnl) || 0,
    realizedR: Number(row.realized_r) || 0,
    totalCommission: Number(row.total_commission) || 0,
    totalSwap: Number(row.total_swap) || 0,
    totalFees: Number(row.total_fees) || 0,
    entryTime: row.entry_time || row.created_at,
    exitTime: row.exit_time || undefined,
    tradeThesis: row.trade_thesis || '',
    technicalBias: row.technical_bias || '',
    macroBias: row.macro_bias || '',
    macroBiasContext: row.macro_bias_context || undefined,
    marketConditions: row.market_conditions || undefined,
    screenshots: Array.isArray(row.screenshots) ? row.screenshots : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    checklistAnswers:
      row.checklist_answers && typeof row.checklist_answers === 'object'
        ? row.checklist_answers
        : {},
    isRuleCompliant: Boolean(row.is_rule_compliant ?? true),
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
    allocations: allocations.filter((a) => a.tradeId === row.id),
  };
}

/**
 * High-Level Supabase Service
 */
export class SupabaseService {
  /**
   * Resolves the active authenticated user UUID, falling back to the
   * standardized anonymous placeholder UUID instead of non-UUID placeholders
   * like "user-default" which fail RLS and UUID column checks.
   */
  private static async resolveUserId(candidate?: string): Promise<string> {
    if (supabase) {
      try {
        const { data } = await supabase.auth.getSession();
        if (data?.session?.user?.id) {
          return data.session.user.id;
        }
      } catch {
        // Fallback to candidate/default below
      }
    }
    if (
      candidate &&
      candidate !== 'user-default' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate)
    ) {
      return candidate;
    }
    return DEFAULT_ANON_USER_ID;
  }
  /**
   * Fetches all accounts and their attached rules from Supabase.
   */
  static async fetchAccounts(): Promise<TradingAccount[] | null> {
    if (!isSupabaseConfigured || !supabase) return null;

    try {
      const [accRes, rulesRes] = await Promise.all([
        supabase.from('trading_accounts').select('*').order('created_at', { ascending: true }),
        supabase.from('account_rules').select('*'),
      ]);

      if (accRes.error || !accRes.data) {
        console.warn('Supabase fetchAccounts error:', accRes.error?.message);
        return null;
      }

      const rules = (rulesRes.data || []).map(mapSupabaseToRule);
      return accRes.data.map((row) => mapSupabaseToAccount(row, rules));
    } catch (err: any) {
      console.warn('SupabaseService.fetchAccounts exception:', err.message);
      return null;
    }
  }

  /**
   * Fetches all trades, allocations, and executions from Supabase.
   */
  static async fetchTrades(): Promise<Trade[] | null> {
    if (!isSupabaseConfigured || !supabase) return null;

    try {
      const [tradesRes, allocsRes, execsRes] = await Promise.all([
        supabase.from('trades').select('*').order('created_at', { ascending: false }),
        supabase.from('trade_allocations').select('*'),
        supabase.from('trade_executions').select('*').order('execution_time', { ascending: true }),
      ]);

      if (tradesRes.error || !tradesRes.data) {
        console.warn('Supabase fetchTrades error:', tradesRes.error?.message);
        return null;
      }

      const executionsByAlloc = new Map<string, TradeExecution[]>();
      for (const row of execsRes.data || []) {
        const exec: TradeExecution = {
          id: row.id,
          tradeId: row.trade_id,
          allocationId: row.allocation_id || undefined,
          accountId: row.account_id,
          executionType: row.execution_type || 'ENTRY',
          price: Number(row.price) || 0,
          size: Number(row.size) || 0,
          commission: Number(row.commission) || 0,
          swap: Number(row.swap) || 0,
          fees: Number(row.fees) || 0,
          slippage: Number(row.slippage) || 0,
          realizedPnl: Number(row.realized_pnl) || 0,
          executionTime: row.execution_time || row.created_at || new Date().toISOString(),
          notes: row.notes || undefined,
        };
        const key = exec.allocationId || `${exec.tradeId}:${exec.accountId}`;
        const list = executionsByAlloc.get(key) || [];
        list.push(exec);
        executionsByAlloc.set(key, list);
      }

      const allocations: TradeAllocation[] = (allocsRes.data || []).map((row) => ({
        id: row.id,
        tradeId: row.trade_id,
        accountId: row.account_id,
        allocatedPositionSize: Number(row.allocated_position_size) || 1.0,
        allocatedRiskUsd: Number(row.allocated_risk_usd) || 500,
        allocatedRiskPct: Number(row.allocated_risk_pct) || 1.0,
        entryPrice: Number(row.entry_price),
        stopLoss: Number(row.stop_loss),
        takeProfit: row.take_profit ? Number(row.take_profit) : undefined,
        exitPrice: row.exit_price ? Number(row.exit_price) : undefined,
        realizedPnl: Number(row.realized_pnl) || 0,
        netPnl: Number(row.net_pnl) || 0,
        commission: Number(row.commission) || 0,
        swap: Number(row.swap) || 0,
        fees: Number(row.fees) || 0,
        status: row.status || 'CLOSED',
        executions:
          executionsByAlloc.get(row.id) ||
          executionsByAlloc.get(`${row.trade_id}:${row.account_id}`) ||
          [],
      }));

      return tradesRes.data
        .filter((row) => !row.deleted_at)
        .map((row) => mapSupabaseToTrade(row, allocations));
    } catch (err: any) {
      console.warn('SupabaseService.fetchTrades exception:', err.message);
      return null;
    }
  }

  /**
   * Saves or updates a single trade with its allocations and executions in Supabase.
   */
  static async saveTrade(trade: Trade): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase) return false;

    try {
      const resolvedUserId = await this.resolveUserId(trade.userId);
      const baseTradePayload = {
        id: trade.id,
        user_id: resolvedUserId,
        instrument_symbol: trade.instrumentSymbol,
        strategy_id: trade.strategyId || null,
        direction: trade.direction,
        status: trade.status,
        environment: trade.environment || 'live',
        timeframe: trade.timeframe || '15M',
        session: normalizeTradeSession(trade.session),
        setup_type: trade.setupType,
        entry_price: trade.entryPrice,
        stop_loss: trade.stopLoss,
        take_profit: trade.takeProfit || null,
        planned_risk_usd: trade.plannedRiskUsd,
        planned_risk_pct: trade.plannedRiskPct,
        planned_rr: trade.plannedRr,
        realized_pnl: trade.realizedPnl,
        net_pnl: trade.netPnl,
        realized_r: trade.realizedR,
        total_commission: trade.totalCommission,
        total_swap: trade.totalSwap,
        total_fees: trade.totalFees,
        entry_time: trade.entryTime,
        exit_time: trade.exitTime || null,
        trade_thesis: trade.tradeThesis || '',
        screenshots: trade.screenshots || [],
        tags: trade.tags || [],
        is_rule_compliant: trade.isRuleCompliant,
        updated_at: trade.updatedAt || new Date().toISOString(),
      };

      const extendedTradePayload = {
        ...baseTradePayload,
        strategy_name: trade.strategyName || null,
        strategy_version: trade.strategyVersion || 1,
        technical_bias: trade.technicalBias || '',
        macro_bias: trade.macroBias || '',
        macro_bias_context: trade.macroBiasContext || null,
        market_conditions: trade.marketConditions || null,
        checklist_answers: trade.checklistAnswers || {},
      };

      let { error: tradeErr } = await supabase.from('trades').upsert(extendedTradePayload);
      if (tradeErr && isOptionalColumnSchemaError(tradeErr.message)) {
        const retry = await supabase.from('trades').upsert(baseTradePayload);
        tradeErr = retry.error;
      }

      if (tradeErr) {
        console.warn('SupabaseService.saveTrade error:', tradeErr.message);
        return false;
      }

      // Sync allocations and nested executions; prune removed allocations when editing
      const validAllocs = (trade.allocations || []).filter(
        (a) => Boolean(a.accountId) && a.accountId !== 'unassigned'
      );

      if (validAllocs.length > 0) {
        const allocPayloads = validAllocs.map((a) => ({
          id: a.id,
          trade_id: trade.id,
          account_id: a.accountId,
          allocated_position_size: a.allocatedPositionSize,
          allocated_risk_usd: a.allocatedRiskUsd,
          allocated_risk_pct: a.allocatedRiskPct,
          entry_price: a.entryPrice,
          stop_loss: a.stopLoss,
          take_profit: a.takeProfit || null,
          exit_price: a.exitPrice || null,
          realized_pnl: a.realizedPnl,
          net_pnl: a.netPnl,
          commission: a.commission,
          swap: a.swap,
          fees: a.fees,
          status: a.status,
        }));

        const { error: allocErr } = await supabase
          .from('trade_allocations')
          .upsert(allocPayloads);
        if (allocErr) {
          console.warn('SupabaseService.saveTrade allocations error:', allocErr.message);
          return false;
        }

        // Remove stale allocations that were deselected during edit
        const { data: existingAllocRows } = await supabase
          .from('trade_allocations')
          .select('id')
          .eq('trade_id', trade.id);
        const keepIds = new Set(validAllocs.map((a) => a.id));
        const staleIds = (existingAllocRows || [])
          .map((r: { id: string }) => r.id)
          .filter((id: string) => !keepIds.has(id));
        if (staleIds.length > 0) {
          await supabase.from('trade_allocations').delete().in('id', staleIds);
        }

        const execPayloads = validAllocs.flatMap((a) =>
          (a.executions || []).map((e) => ({
            id: e.id,
            trade_id: trade.id,
            allocation_id: a.id,
            account_id: e.accountId || a.accountId,
            execution_type: e.executionType,
            price: e.price,
            size: e.size,
            commission: e.commission,
            swap: e.swap,
            fees: e.fees || 0,
            slippage: e.slippage || 0,
            realized_pnl: e.realizedPnl,
            execution_time: e.executionTime,
            notes: e.notes || null,
          }))
        );

        if (execPayloads.length > 0) {
          const { error: execErr } = await supabase
            .from('trade_executions')
            .upsert(execPayloads);
          if (execErr) {
            console.warn('SupabaseService.saveTrade executions error:', execErr.message);
            return false;
          }
        }
      } else {
        await supabase.from('trade_allocations').delete().eq('trade_id', trade.id);
      }

      return true;
    } catch (err: any) {
      console.warn('SupabaseService.saveTrade exception:', err.message);
      return false;
    }
  }

  /**
   * Saves or updates an account and its rules in Supabase.
   */
  static async saveAccount(account: TradingAccount): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase) return false;

    try {
      const resolvedUserId = await this.resolveUserId(account.userId);
      const accountPayload = {
        id: account.id,
        user_id: resolvedUserId,
        name: account.name,
        broker_or_firm: account.brokerOrFirm,
        account_type: account.accountType,
        currency: account.currency,
        account_size: account.accountSize,
        starting_balance: account.startingBalance,
        current_balance: account.currentBalance,
        current_equity: account.currentEquity,
        high_water_mark: account.highWaterMark,
        challenge_phase: account.challengePhase,
        status: account.status,
        is_demo: account.isDemo,
        notes: account.notes,
        updated_at: account.updatedAt || new Date().toISOString(),
      };

      const { error: accErr } = await supabase.from('trading_accounts').upsert(accountPayload);
      if (accErr) {
        console.warn('SupabaseService.saveAccount error:', accErr.message);
        return false;
      }

      // Upsert rules
      if (account.rules && account.rules.length > 0) {
        const rulePayloads = account.rules.map((r) => ({
          id: r.id,
          account_id: account.id,
          rule_type: r.ruleType,
          threshold_value: r.thresholdValue,
          threshold_unit: r.thresholdUnit,
          calculation_method: r.calculationMethod,
          warning_threshold_pct: r.warningThresholdPct,
          is_enabled: r.isEnabled,
          current_status: r.currentStatus,
          current_metric_value: r.currentMetricValue,
          reset_frequency: r.resetFrequency,
          applicable_timezone: r.applicableTimezone,
        }));

        await supabase.from('account_rules').upsert(rulePayloads);
      }

      return true;
    } catch (err: any) {
      console.warn('SupabaseService.saveAccount exception:', err.message);
      return false;
    }
  }

  /**
   * Fetches all strategies from Supabase.
   */
  static async fetchStrategies(): Promise<Strategy[] | null> {
    if (!isSupabaseConfigured || !supabase) return null;
    try {
      const { data, error } = await supabase
        .from('strategies')
        .select('*')
        .order('created_at', { ascending: true });
      if (error || !data) return null;
      return data.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description || '',
        marketType: row.market_type || 'Multi-Asset',
        primaryTimeframes: Array.isArray(row.primary_timeframes)
          ? row.primary_timeframes
          : ['15M', '1H', '4H'],
        marketRegime: row.market_regime || 'any',
        entryConditions: row.entry_conditions || '',
        exitConditions: row.exit_conditions || '',
        stopLossMethodology: row.stop_loss_methodology || '',
        targetMethodology: row.target_methodology || '',
        riskRules: row.risk_rules || '',
        checklistItems: Array.isArray(row.checklist_items) ? row.checklist_items : [],
        currentVersion: Number(row.current_version) || 1,
        isActive: row.is_active !== false,
        createdAt: row.created_at || new Date().toISOString(),
        updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
      }));
    } catch {
      return null;
    }
  }

  static async saveStrategy(strategy: Strategy): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase) return false;
    try {
      const resolvedUserId = await this.resolveUserId();
      const { error } = await supabase.from('strategies').upsert({
        id: strategy.id,
        user_id: resolvedUserId,
        name: strategy.name,
        description: strategy.description,
        market_type: strategy.marketType,
        primary_timeframes: strategy.primaryTimeframes,
        market_regime: strategy.marketRegime,
        entry_conditions: strategy.entryConditions,
        exit_conditions: strategy.exitConditions,
        stop_loss_methodology: strategy.stopLossMethodology,
        target_methodology: strategy.targetMethodology,
        risk_rules: strategy.riskRules,
        checklist_items: strategy.checklistItems,
        current_version: strategy.currentVersion,
        is_active: strategy.isActive,
        updated_at: strategy.updatedAt || new Date().toISOString(),
      });
      return !error;
    } catch {
      return false;
    }
  }

  /**
   * Fetches all daily journal entries from Supabase.
   */
  static async fetchJournalEntries(): Promise<JournalEntry[] | null> {
    if (!isSupabaseConfigured || !supabase) return null;
    try {
      const { data, error } = await supabase
        .from('journal_entries')
        .select('*')
        .order('entry_date', { ascending: false });
      if (error || !data) return null;
      return data.map((row) => ({
        id: row.id,
        entryDate: row.entry_date,
        marketConditions: row.market_conditions || '',
        macroEnvironment: row.macro_environment || '',
        higherTimeframeBias: row.higher_timeframe_bias || '',
        technicalBias: row.technical_bias || '',
        tradingPlan: row.trading_plan || '',
        importantEconomicEvents: row.important_economic_events || '',
        emotionalState: row.emotional_state || 'Disciplined',
        dailySummary: row.daily_summary || '',
        lessonsLearned: row.lessonslearned || row.lessons_learned || '',
        disciplineScore: Number(row.discipline_score) || 7,
        preparationScore: Number(row.preparation_score) || 7,
        executionScore: Number(row.execution_score) || 7,
        fomoDetected: Boolean(row.fomo_detected),
        revengeTrading: Boolean(row.revenge_trading),
        overtrading: Boolean(row.overtrading),
        movedStopLoss: Boolean(row.moved_stop_loss),
        prematureExit: Boolean(row.premature_exit),
        ignoredRules: Boolean(row.ignored_rules),
        isLocked: Boolean(row.is_locked),
        updatedAt: row.updated_at || row.created_at || `${row.entry_date}T23:59:59.000Z`,
      }));
    } catch {
      return null;
    }
  }

  static async saveJournalEntry(entry: JournalEntry): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase) return false;
    try {
      const resolvedUserId = await this.resolveUserId();
      const { error } = await supabase.from('journal_entries').upsert({
        id: entry.id,
        user_id: resolvedUserId,
        entry_date: entry.entryDate,
        market_conditions: entry.marketConditions,
        macro_environment: entry.macroEnvironment,
        higher_timeframe_bias: entry.higherTimeframeBias,
        technical_bias: entry.technicalBias,
        trading_plan: entry.tradingPlan,
        important_economic_events: entry.importantEconomicEvents,
        emotional_state: entry.emotionalState,
        daily_summary: entry.dailySummary,
        lessonslearned: entry.lessonsLearned,
        discipline_score: entry.disciplineScore,
        preparation_score: entry.preparationScore,
        execution_score: entry.executionScore,
        is_locked: Boolean(entry.isLocked),
        updated_at: entry.updatedAt || new Date().toISOString(),
      });
      return !error;
    } catch {
      return false;
    }
  }

  /**
   * Fetches all risk alerts from Supabase.
   */
  static async fetchAlerts(): Promise<RiskAlert[] | null> {
    if (!isSupabaseConfigured || !supabase) return null;
    try {
      const { data, error } = await supabase
        .from('risk_alerts')
        .select('*')
        .order('created_at', { ascending: false });
      if (error || !data) return null;
      return data.map((row) => ({
        id: row.id,
        accountId: row.account_id,
        accountName: row.account_name || 'Account',
        severity: row.severity || 'info',
        title: row.title,
        description: row.description,
        ruleType: row.rule_type || 'general',
        acknowledged: Boolean(row.acknowledged),
        createdAt: row.created_at || new Date().toISOString(),
      }));
    } catch {
      return null;
    }
  }

  static async saveAlert(alert: RiskAlert): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase) return false;
    try {
      const resolvedUserId = await this.resolveUserId();
      const { error } = await supabase.from('risk_alerts').upsert({
        id: alert.id,
        user_id: resolvedUserId,
        account_id: alert.accountId,
        severity: alert.severity,
        title: alert.title,
        description: alert.description,
        rule_type: alert.ruleType,
        acknowledged: alert.acknowledged,
        created_at: alert.createdAt,
      });
      return !error;
    } catch {
      return false;
    }
  }

  /**
   * Applies pending delete tombstones against Supabase without overwriting newer remote writes.
   */
  static async applyTombstones(tombstones: SyncTombstone[]): Promise<number> {
    if (!isSupabaseConfigured || !supabase || tombstones.length === 0) return 0;
    let deleted = 0;
    for (const t of tombstones) {
      let ok = false;
      if (t.entityType === 'account') ok = await this.deleteAccount(t.id);
      else if (t.entityType === 'trade') ok = await this.deleteTrade(t.id);
      else if (t.entityType === 'strategy') ok = await this.deleteStrategy(t.id);
      else if (t.entityType === 'journal') ok = await this.deleteJournalEntry(t.id);
      else if (t.entityType === 'alert') ok = await this.deleteAlert(t.id);
      if (ok) deleted += 1;
    }
    return deleted;
  }

  /**
   * Bulk delta sync: Pushes changed/local accounts, trades, strategies, journal entries, and alerts to Supabase Cloud.
   */
  static async syncLocalToCloud(
    accounts: TradingAccount[],
    trades: Trade[],
    strategies: Strategy[] = [],
    journalEntries: JournalEntry[] = [],
    alerts: RiskAlert[] = []
  ): Promise<{
    success: boolean;
    accountsSynced: number;
    tradesSynced: number;
    strategiesSynced: number;
    journalSynced: number;
    alertsSynced: number;
    error?: string;
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return {
        success: false,
        accountsSynced: 0,
        tradesSynced: 0,
        strategiesSynced: 0,
        journalSynced: 0,
        alertsSynced: 0,
        error: 'Supabase is not configured',
      };
    }

    try {
      let accountsSynced = 0;
      let tradesSynced = 0;
      let strategiesSynced = 0;
      let journalSynced = 0;
      let alertsSynced = 0;
      let failedCount = 0;

      // Sync parent entities (accounts + strategies) BEFORE trades to satisfy FK constraints
      for (const acc of accounts) {
        if (await this.saveAccount(acc)) accountsSynced += 1;
        else failedCount += 1;
      }
      for (const s of strategies) {
        if (await this.saveStrategy(s)) strategiesSynced += 1;
        else failedCount += 1;
      }
      for (const t of trades) {
        if (await this.saveTrade(t)) tradesSynced += 1;
        else failedCount += 1;
      }
      for (const j of journalEntries) {
        if (await this.saveJournalEntry(j)) journalSynced += 1;
        else failedCount += 1;
      }
      for (const a of alerts) {
        if (await this.saveAlert(a)) alertsSynced += 1;
        else failedCount += 1;
      }

      return {
        success: failedCount === 0,
        accountsSynced,
        tradesSynced,
        strategiesSynced,
        journalSynced,
        alertsSynced,
        ...(failedCount > 0 ? { error: `${failedCount} entity sync operation(s) failed` } : {}),
      };
    } catch (err: any) {
      return {
        success: false,
        accountsSynced: 0,
        tradesSynced: 0,
        strategiesSynced: 0,
        journalSynced: 0,
        alertsSynced: 0,
        error: err.message,
      };
    }
  }

  /**
   * Diagnostic health check of the Supabase PostgreSQL backend.
   */
  static async checkHealth(): Promise<{
    connected: boolean;
    latencyMs: number;
    accountsCount: number;
    tradesCount: number;
    message: string;
  }> {
    if (!isSupabaseConfigured || !supabase) {
      return {
        connected: false,
        latencyMs: 0,
        accountsCount: 0,
        tradesCount: 0,
        message: 'Supabase credentials not configured in .env.local',
      };
    }

    const start = Date.now();
    try {
      const [accCountRes, tradeCountRes] = await Promise.all([
        supabase.from('trading_accounts').select('id', { count: 'exact', head: true }),
        supabase.from('trades').select('id', { count: 'exact', head: true }),
      ]);

      const latencyMs = Date.now() - start;

      if (accCountRes.error) {
        return {
          connected: false,
          latencyMs,
          accountsCount: 0,
          tradesCount: 0,
          message: accCountRes.error.message,
        };
      }

      return {
        connected: true,
        latencyMs,
        accountsCount: accCountRes.count || 0,
        tradesCount: tradeCountRes.count || 0,
        message: 'Connected to Supabase Cloud PostgreSQL with active RLS',
      };
    } catch (err: any) {
      return {
        connected: false,
        latencyMs: Date.now() - start,
        accountsCount: 0,
        tradesCount: 0,
        message: err.message || 'Network error',
      };
    }
  }

  /**
   * Shared helper to remove a record by ID from a Supabase table.
   */
  private static async deleteById(table: string, id: string): Promise<boolean> {
    if (!isSupabaseConfigured || !supabase || !id) return false;
    try {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) {
        console.warn(`SupabaseService.delete(${table}) error:`, error.message);
        return false;
      }
      return true;
    } catch (err: any) {
      console.warn(`SupabaseService.delete(${table}) exception:`, err.message);
      return false;
    }
  }

  static deleteTrade(id: string): Promise<boolean> {
    return this.deleteById('trades', id);
  }

  static deleteAccount(id: string): Promise<boolean> {
    return this.deleteById('trading_accounts', id);
  }

  static deleteRule(id: string): Promise<boolean> {
    return this.deleteById('account_rules', id);
  }

  static deleteJournalEntry(id: string): Promise<boolean> {
    return this.deleteById('journal_entries', id);
  }

  static deleteStrategy(id: string): Promise<boolean> {
    return this.deleteById('strategies', id);
  }

  static deleteAlert(id: string): Promise<boolean> {
    return this.deleteById('risk_alerts', id);
  }
}

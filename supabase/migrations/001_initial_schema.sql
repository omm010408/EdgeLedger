-- ====================================================================
-- EDGELEDGER DATABASE SCHEMA (REVISED PRODUCTION GRADE)
-- Advanced Trading Management & Performance Intelligence Platform
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ENUMS & DOMAINS
DO $$ BEGIN
    CREATE TYPE account_type_enum AS ENUM (
        'personal', 'prop_evaluation', 'prop_verification',
        'funded', 'instant_funding', 'demo', 'custom'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE trade_direction_enum AS ENUM ('BUY', 'SELL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE trade_status_enum AS ENUM (
        'PLANNED', 'OPEN', 'PARTIALLY_CLOSED', 'CLOSED', 'CANCELLED', 'INVALIDATED'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE rule_status_enum AS ENUM ('SAFE', 'WARNING', 'BREACHED', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. PROFILES TABLE
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    timezone TEXT DEFAULT 'UTC',
    preferred_currency TEXT DEFAULT 'USD',
    risk_profile TEXT DEFAULT 'moderate',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. INSTRUMENTS SPECIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS instruments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('forex', 'indices', 'metals', 'crypto', 'commodities')),
    contract_size NUMERIC(18, 4) NOT NULL DEFAULT 1.0,
    tick_size NUMERIC(18, 6) NOT NULL DEFAULT 0.01,
    tick_value NUMERIC(18, 6) NOT NULL DEFAULT 1.0,
    point_value NUMERIC(18, 6) NOT NULL DEFAULT 1.0,
    lot_step NUMERIC(10, 4) NOT NULL DEFAULT 0.01,
    min_lot NUMERIC(10, 4) NOT NULL DEFAULT 0.01,
    base_currency TEXT NOT NULL DEFAULT 'USD',
    quote_currency TEXT NOT NULL DEFAULT 'USD',
    is_active BOOLEAN DEFAULT TRUE,
    effective_from TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. TRADING ACCOUNTS TABLE
CREATE TABLE IF NOT EXISTS trading_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    broker_or_firm TEXT NOT NULL,
    account_type account_type_enum NOT NULL DEFAULT 'prop_evaluation',
    currency TEXT NOT NULL DEFAULT 'USD',
    account_size NUMERIC(18, 2) NOT NULL,
    starting_balance NUMERIC(18, 2) NOT NULL,
    current_balance NUMERIC(18, 2) NOT NULL,
    current_equity NUMERIC(18, 2) NOT NULL,
    high_water_mark NUMERIC(18, 2) NOT NULL,
    challenge_phase TEXT DEFAULT 'Phase 1',
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'passed', 'failed', 'funded', 'archived', 'closed')),
    is_demo BOOLEAN DEFAULT FALSE,
    position_matching_mode TEXT DEFAULT 'hedging' CHECK (position_matching_mode IN ('hedging', 'netting')),
    notes TEXT,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. APPEND-ONLY ACCOUNT TRANSACTIONS LEDGER
CREATE TABLE IF NOT EXISTS account_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
    transaction_type TEXT NOT NULL CHECK (
        transaction_type IN ('DEPOSIT', 'WITHDRAWAL', 'REALIZED_PNL', 'COMMISSION', 'SWAP', 'FEE_ADJUSTMENT', 'PHASE_RESET')
    ),
    amount NUMERIC(18, 2) NOT NULL,
    balance_after NUMERIC(18, 2) NOT NULL,
    reference_id TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. ACCOUNT RULESETS & RULES (VERSIONED)
CREATE TABLE IF NOT EXISTS account_rulesets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Standard Prop Ruleset',
    description TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    effective_from TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS account_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ruleset_id UUID REFERENCES account_rulesets(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
    rule_type TEXT NOT NULL,
    threshold_value NUMERIC(18, 4) NOT NULL,
    threshold_unit TEXT NOT NULL CHECK (threshold_unit IN ('currency', 'percent', 'count', 'days', 'hours')),
    calculation_method TEXT NOT NULL CHECK (calculation_method IN ('balance_based', 'equity_based', 'relative_trailing', 'static')),
    warning_threshold_pct NUMERIC(5, 2) NOT NULL DEFAULT 80.00 CHECK (warning_threshold_pct > 0 AND warning_threshold_pct < 100),
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    current_status rule_status_enum NOT NULL DEFAULT 'SAFE',
    current_metric_value NUMERIC(18, 4) NOT NULL DEFAULT 0,
    reset_frequency TEXT NOT NULL DEFAULT 'daily' CHECK (reset_frequency IN ('daily', 'weekly', 'none')),
    applicable_timezone TEXT NOT NULL DEFAULT 'UTC',
    version INTEGER NOT NULL DEFAULT 1,
    effective_from TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. RULE EVALUATIONS HISTORY
CREATE TABLE IF NOT EXISTS rule_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
    rule_id UUID REFERENCES account_rules(id) ON DELETE SET NULL,
    rule_type TEXT NOT NULL,
    status rule_status_enum NOT NULL,
    metric_value NUMERIC(18, 4) NOT NULL,
    threshold_value NUMERIC(18, 4) NOT NULL,
    remaining_allowance NUMERIC(18, 4),
    message TEXT NOT NULL,
    evaluated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. RISK ALERTS TABLE
CREATE TABLE IF NOT EXISTS risk_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    rule_type TEXT,
    acknowledged BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. STRATEGIES TABLE (VERSIONED)
CREATE TABLE IF NOT EXISTS strategies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    market_type TEXT,
    primary_timeframes TEXT[] DEFAULT ARRAY['15M', '1H', '4H'],
    market_regime TEXT DEFAULT 'trending' CHECK (market_regime IN ('trending', 'ranging', 'breakout', 'reversal', 'any')),
    entry_conditions TEXT,
    exit_conditions TEXT,
    stop_loss_methodology TEXT,
    target_methodology TEXT,
    risk_rules TEXT,
    checklist_items JSONB DEFAULT '[]'::jsonb,
    current_version INTEGER NOT NULL DEFAULT 1,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS strategy_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL DEFAULT 1,
    change_notes TEXT,
    entry_conditions TEXT,
    exit_conditions TEXT,
    effective_from TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. TRADES TABLE (Logical Trade Idea)
CREATE TABLE IF NOT EXISTS trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    instrument_symbol TEXT NOT NULL REFERENCES instruments(symbol),
    strategy_id UUID REFERENCES strategies(id) ON DELETE SET NULL,
    strategy_version INTEGER DEFAULT 1,
    direction trade_direction_enum NOT NULL,
    status trade_status_enum NOT NULL DEFAULT 'OPEN',
    environment TEXT NOT NULL DEFAULT 'live' CHECK (environment IN ('live', 'demo', 'backtest')),
    timeframe TEXT DEFAULT '15M',
    session TEXT DEFAULT 'London' CHECK (session IN ('Asian', 'London', 'London Close', 'New York', 'Sydney', 'Off-Hours')),
    setup_type TEXT,
    entry_price NUMERIC(18, 6) NOT NULL,
    stop_loss NUMERIC(18, 6) NOT NULL,
    take_profit NUMERIC(18, 6),
    planned_risk_usd NUMERIC(18, 2) NOT NULL DEFAULT 0, -- Snapshotted at entry
    planned_risk_pct NUMERIC(5, 2) NOT NULL DEFAULT 1.0, -- Snapshotted at entry
    planned_rr NUMERIC(6, 2) NOT NULL DEFAULT 2.0, -- Snapshotted at entry
    realized_pnl NUMERIC(18, 2) NOT NULL DEFAULT 0,
    net_pnl NUMERIC(18, 2) NOT NULL DEFAULT 0,
    realized_r NUMERIC(6, 2) NOT NULL DEFAULT 0,
    total_commission NUMERIC(18, 2) NOT NULL DEFAULT 0,
    total_swap NUMERIC(18, 2) NOT NULL DEFAULT 0,
    total_fees NUMERIC(18, 2) NOT NULL DEFAULT 0,
    entry_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    exit_time TIMESTAMPTZ,
    trade_thesis TEXT,
    technical_bias TEXT,
    macro_bias TEXT,
    macro_bias_context JSONB, -- Optional immutable research context
    market_conditions TEXT,
    screenshots TEXT[] DEFAULT ARRAY[]::TEXT[],
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    checklist_answers JSONB DEFAULT '{}'::jsonb,
    is_rule_compliant BOOLEAN DEFAULT TRUE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. TRADE ALLOCATIONS TABLE (Per Account Allocation)
CREATE TABLE IF NOT EXISTS trade_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
    allocated_position_size NUMERIC(18, 4) NOT NULL,
    allocated_risk_usd NUMERIC(18, 2) NOT NULL DEFAULT 0,
    allocated_risk_pct NUMERIC(5, 2) NOT NULL DEFAULT 1.0,
    entry_price NUMERIC(18, 6) NOT NULL,
    stop_loss NUMERIC(18, 6) NOT NULL,
    take_profit NUMERIC(18, 6),
    exit_price NUMERIC(18, 6),
    realized_pnl NUMERIC(18, 2) NOT NULL DEFAULT 0,
    net_pnl NUMERIC(18, 2) NOT NULL DEFAULT 0,
    commission NUMERIC(18, 2) NOT NULL DEFAULT 0,
    swap NUMERIC(18, 2) NOT NULL DEFAULT 0,
    fees NUMERIC(18, 2) NOT NULL DEFAULT 0,
    status trade_status_enum NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. TRADE EXECUTIONS TABLE (Orders, Fills, Partials)
CREATE TABLE IF NOT EXISTS trade_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    allocation_id UUID REFERENCES trade_allocations(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
    execution_type TEXT NOT NULL CHECK (execution_type IN ('ENTRY', 'PARTIAL_CLOSE', 'FULL_CLOSE', 'SL_HIT', 'TP_HIT', 'MANUAL_EXIT')),
    price NUMERIC(18, 6) NOT NULL,
    size NUMERIC(18, 4) NOT NULL,
    commission NUMERIC(18, 2) NOT NULL DEFAULT 0,
    swap NUMERIC(18, 2) NOT NULL DEFAULT 0,
    fees NUMERIC(18, 2) NOT NULL DEFAULT 0,
    slippage NUMERIC(18, 6) DEFAULT 0,
    realized_pnl NUMERIC(18, 2) NOT NULL DEFAULT 0,
    execution_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. ACCOUNT DAILY SNAPSHOTS
CREATE TABLE IF NOT EXISTS account_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    ending_balance NUMERIC(18, 2) NOT NULL,
    ending_equity NUMERIC(18, 2) NOT NULL,
    daily_pnl NUMERIC(18, 2) NOT NULL DEFAULT 0,
    daily_return_pct NUMERIC(6, 3) NOT NULL DEFAULT 0,
    cumulative_pnl NUMERIC(18, 2) NOT NULL DEFAULT 0,
    peak_balance NUMERIC(18, 2) NOT NULL,
    peak_equity NUMERIC(18, 2) NOT NULL,
    current_drawdown NUMERIC(18, 2) NOT NULL DEFAULT 0,
    current_drawdown_pct NUMERIC(6, 3) NOT NULL DEFAULT 0,
    trade_count INTEGER NOT NULL DEFAULT 0,
    win_count INTEGER NOT NULL DEFAULT 0,
    loss_count INTEGER NOT NULL DEFAULT 0,
    breakeven_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(account_id, snapshot_date)
);

-- 15. JOURNAL ENTRIES TABLE (Locks after 24h)
CREATE TABLE IF NOT EXISTS journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    market_conditions TEXT,
    macro_environment TEXT,
    higher_timeframe_bias TEXT,
    technical_bias TEXT,
    trading_plan TEXT,
    important_economic_events TEXT,
    emotional_state TEXT DEFAULT 'Disciplined',
    daily_summary TEXT,
    lessonsLearned TEXT,
    discipline_score INTEGER CHECK (discipline_score BETWEEN 1 AND 10),
    preparation_score INTEGER CHECK (preparation_score BETWEEN 1 AND 10),
    execution_score INTEGER CHECK (execution_score BETWEEN 1 AND 10),
    is_locked BOOLEAN DEFAULT FALSE,
    locked_at TIMESTAMPTZ,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, entry_date)
);

-- 16. AUDIT LOG (IMMUTABLE AUDIT TRAIL)
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    before_state JSONB,
    after_state JSONB,
    request_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_rulesets ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE rule_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own profile" ON profiles
    FOR ALL USING (auth.uid() = id);

CREATE POLICY "Users can manage own trading accounts" ON trading_accounts
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own transactions" ON account_transactions
    FOR ALL USING (EXISTS (
        SELECT 1 FROM trading_accounts WHERE trading_accounts.id = account_transactions.account_id AND trading_accounts.user_id = auth.uid()
    ));

CREATE POLICY "Users can manage own rulesets" ON account_rulesets
    FOR ALL USING (EXISTS (
        SELECT 1 FROM trading_accounts WHERE trading_accounts.id = account_rulesets.account_id AND trading_accounts.user_id = auth.uid()
    ));

CREATE POLICY "Users can manage own rules" ON account_rules
    FOR ALL USING (EXISTS (
        SELECT 1 FROM trading_accounts WHERE trading_accounts.id = account_rules.account_id AND trading_accounts.user_id = auth.uid()
    ));

CREATE POLICY "Users can view own rule evaluations" ON rule_evaluations
    FOR ALL USING (EXISTS (
        SELECT 1 FROM trading_accounts WHERE trading_accounts.id = rule_evaluations.account_id AND trading_accounts.user_id = auth.uid()
    ));

CREATE POLICY "Users can manage own risk alerts" ON risk_alerts
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own strategies" ON strategies
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage strategy versions" ON strategy_versions
    FOR ALL USING (EXISTS (
        SELECT 1 FROM strategies WHERE strategies.id = strategy_versions.strategy_id AND strategies.user_id = auth.uid()
    ));

CREATE POLICY "Users can manage own trades" ON trades
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own trade allocations" ON trade_allocations
    FOR ALL USING (EXISTS (
        SELECT 1 FROM trades WHERE trades.id = trade_allocations.trade_id AND trades.user_id = auth.uid()
    ));

CREATE POLICY "Users can manage own trade executions" ON trade_executions
    FOR ALL USING (EXISTS (
        SELECT 1 FROM trades WHERE trades.id = trade_executions.trade_id AND trades.user_id = auth.uid()
    ));

CREATE POLICY "Users can manage own snapshots" ON account_snapshots
    FOR ALL USING (EXISTS (
        SELECT 1 FROM trading_accounts WHERE trading_accounts.id = account_snapshots.account_id AND trading_accounts.user_id = auth.uid()
    ));

CREATE POLICY "Users can manage own journal" ON journal_entries
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own audit logs" ON audit_log
    FOR SELECT USING (auth.uid() = user_id);

-- Global Read for Instruments
ALTER TABLE instruments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can view instruments" ON instruments
    FOR SELECT TO authenticated USING (true);

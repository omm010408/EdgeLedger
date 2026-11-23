-- ====================================================================
-- EDGELEDGER DATABASE SCHEMA
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
    CREATE TYPE trade_status_enum AS ENUM ('PLANNED', 'OPEN', 'CLOSED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE rule_status_enum AS ENUM ('SAFE', 'WARNING', 'BREACHED');
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
    base_currency TEXT NOT NULL DEFAULT 'USD',
    quote_currency TEXT NOT NULL DEFAULT 'USD',
    is_active BOOLEAN DEFAULT TRUE,
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
    account_size NUMERIC(18, 4) NOT NULL,
    starting_balance NUMERIC(18, 4) NOT NULL,
    current_balance NUMERIC(18, 4) NOT NULL,
    current_equity NUMERIC(18, 4) NOT NULL,
    high_water_mark NUMERIC(18, 4) NOT NULL,
    challenge_phase TEXT DEFAULT 'Phase 1',
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'breached', 'passed', 'archived')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. ACCOUNT RULESETS & RULES
CREATE TABLE IF NOT EXISTS account_rulesets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Standard Prop Ruleset',
    description TEXT,
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
    warning_threshold_pct NUMERIC(5, 2) NOT NULL DEFAULT 70.00,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    current_status rule_status_enum NOT NULL DEFAULT 'SAFE',
    current_metric_value NUMERIC(18, 4) NOT NULL DEFAULT 0,
    reset_frequency TEXT NOT NULL DEFAULT 'daily' CHECK (reset_frequency IN ('daily', 'weekly', 'none')),
    applicable_timezone TEXT NOT NULL DEFAULT 'UTC',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. RULE EVALUATIONS HISTORY
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

-- 8. RISK ALERTS TABLE
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

-- 9. STRATEGIES TABLE
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
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. TRADES TABLE (Logical Trade Idea)
CREATE TABLE IF NOT EXISTS trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    instrument_symbol TEXT NOT NULL REFERENCES instruments(symbol),
    strategy_id UUID REFERENCES strategies(id) ON DELETE SET NULL,
    direction trade_direction_enum NOT NULL,
    status trade_status_enum NOT NULL DEFAULT 'OPEN',
    timeframe TEXT DEFAULT '15M',
    session TEXT DEFAULT 'London' CHECK (session IN ('Asian', 'London', 'London Close', 'New York', 'Sydney', 'Off-Hours')),
    setup_type TEXT,
    entry_price NUMERIC(18, 6) NOT NULL,
    stop_loss NUMERIC(18, 6) NOT NULL,
    take_profit NUMERIC(18, 6),
    planned_risk_usd NUMERIC(18, 4) NOT NULL DEFAULT 0,
    planned_risk_pct NUMERIC(5, 2) NOT NULL DEFAULT 1.0,
    planned_rr NUMERIC(6, 2) NOT NULL DEFAULT 2.0,
    realized_pnl NUMERIC(18, 4) NOT NULL DEFAULT 0,
    net_pnl NUMERIC(18, 4) NOT NULL DEFAULT 0,
    realized_r NUMERIC(6, 2) NOT NULL DEFAULT 0,
    total_commission NUMERIC(18, 4) NOT NULL DEFAULT 0,
    total_swap NUMERIC(18, 4) NOT NULL DEFAULT 0,
    total_fees NUMERIC(18, 4) NOT NULL DEFAULT 0,
    entry_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    exit_time TIMESTAMPTZ,
    trade_thesis TEXT,
    technical_bias TEXT,
    macro_bias TEXT,
    market_conditions TEXT,
    screenshots TEXT[] DEFAULT ARRAY[]::TEXT[],
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    is_rule_compliant BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. TRADE ALLOCATIONS TABLE (Per Account Allocation)
CREATE TABLE IF NOT EXISTS trade_allocations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
    allocated_position_size NUMERIC(18, 4) NOT NULL,
    allocated_risk_usd NUMERIC(18, 4) NOT NULL DEFAULT 0,
    allocated_risk_pct NUMERIC(5, 2) NOT NULL DEFAULT 1.0,
    entry_price NUMERIC(18, 6) NOT NULL,
    stop_loss NUMERIC(18, 6) NOT NULL,
    take_profit NUMERIC(18, 6),
    exit_price NUMERIC(18, 6),
    realized_pnl NUMERIC(18, 4) NOT NULL DEFAULT 0,
    net_pnl NUMERIC(18, 4) NOT NULL DEFAULT 0,
    commission NUMERIC(18, 4) NOT NULL DEFAULT 0,
    swap NUMERIC(18, 4) NOT NULL DEFAULT 0,
    fees NUMERIC(18, 4) NOT NULL DEFAULT 0,
    status trade_status_enum NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. TRADE EXECUTIONS TABLE (Orders, Fills, Partials)
CREATE TABLE IF NOT EXISTS trade_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    allocation_id UUID REFERENCES trade_allocations(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
    execution_type TEXT NOT NULL CHECK (execution_type IN ('ENTRY', 'PARTIAL_CLOSE', 'FULL_CLOSE', 'SL_HIT', 'TP_HIT', 'MANUAL_EXIT')),
    price NUMERIC(18, 6) NOT NULL,
    size NUMERIC(18, 4) NOT NULL,
    commission NUMERIC(18, 4) NOT NULL DEFAULT 0,
    swap NUMERIC(18, 4) NOT NULL DEFAULT 0,
    realized_pnl NUMERIC(18, 4) NOT NULL DEFAULT 0,
    execution_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. ACCOUNT DAILY SNAPSHOTS
CREATE TABLE IF NOT EXISTS account_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    ending_balance NUMERIC(18, 4) NOT NULL,
    ending_equity NUMERIC(18, 4) NOT NULL,
    daily_pnl NUMERIC(18, 4) NOT NULL DEFAULT 0,
    daily_return_pct NUMERIC(6, 3) NOT NULL DEFAULT 0,
    cumulative_pnl NUMERIC(18, 4) NOT NULL DEFAULT 0,
    peak_balance NUMERIC(18, 4) NOT NULL,
    peak_equity NUMERIC(18, 4) NOT NULL,
    current_drawdown NUMERIC(18, 4) NOT NULL DEFAULT 0,
    current_drawdown_pct NUMERIC(6, 3) NOT NULL DEFAULT 0,
    trade_count INTEGER NOT NULL DEFAULT 0,
    win_count INTEGER NOT NULL DEFAULT 0,
    loss_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(account_id, snapshot_date)
);

-- 14. JOURNAL ENTRIES TABLE
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
    lessons_learned TEXT,
    discipline_score INTEGER CHECK (discipline_score BETWEEN 1 AND 10),
    preparation_score INTEGER CHECK (preparation_score BETWEEN 1 AND 10),
    execution_score INTEGER CHECK (execution_score BETWEEN 1 AND 10),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, entry_date)
);

-- 15. PSYCHOLOGY REVIEWS TABLE
CREATE TABLE IF NOT EXISTS psychology_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_id UUID REFERENCES trades(id) ON DELETE CASCADE,
    journal_id UUID REFERENCES journal_entries(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    review_date DATE NOT NULL DEFAULT CURRENT_DATE,
    fomo_detected BOOLEAN DEFAULT FALSE,
    revenge_trading BOOLEAN DEFAULT FALSE,
    overtrading BOOLEAN DEFAULT FALSE,
    early_entry BOOLEAN DEFAULT FALSE,
    late_entry BOOLEAN DEFAULT FALSE,
    moved_stop_loss BOOLEAN DEFAULT FALSE,
    premature_exit BOOLEAN DEFAULT FALSE,
    ignored_rules BOOLEAN DEFAULT FALSE,
    hesitation BOOLEAN DEFAULT FALSE,
    impatience BOOLEAN DEFAULT FALSE,
    decision_quality_score INTEGER NOT NULL CHECK (decision_quality_score BETWEEN 1 AND 10),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. IMPORT JOBS TABLE
CREATE TABLE IF NOT EXISTS import_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    account_id UUID REFERENCES trading_accounts(id) ON DELETE SET NULL,
    source TEXT NOT NULL,
    filename TEXT NOT NULL,
    total_rows INTEGER NOT NULL DEFAULT 0,
    imported_rows INTEGER NOT NULL DEFAULT 0,
    skipped_rows INTEGER NOT NULL DEFAULT 0,
    errors JSONB DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_accounts ENABLE ROW LEVEL SECURITY;
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
ALTER TABLE psychology_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Users can view and edit own profile" ON profiles
    FOR ALL USING (auth.uid() = id);

-- Trading Accounts
CREATE POLICY "Users can manage own trading accounts" ON trading_accounts
    FOR ALL USING (auth.uid() = user_id);

-- Account Rulesets
CREATE POLICY "Users can manage own rulesets" ON account_rulesets
    FOR ALL USING (EXISTS (
        SELECT 1 FROM trading_accounts WHERE trading_accounts.id = account_rulesets.account_id AND trading_accounts.user_id = auth.uid()
    ));

-- Account Rules
CREATE POLICY "Users can manage own rules" ON account_rules
    FOR ALL USING (EXISTS (
        SELECT 1 FROM trading_accounts WHERE trading_accounts.id = account_rules.account_id AND trading_accounts.user_id = auth.uid()
    ));

-- Rule Evaluations
CREATE POLICY "Users can view own rule evaluations" ON rule_evaluations
    FOR ALL USING (EXISTS (
        SELECT 1 FROM trading_accounts WHERE trading_accounts.id = rule_evaluations.account_id AND trading_accounts.user_id = auth.uid()
    ));

-- Risk Alerts
CREATE POLICY "Users can manage own risk alerts" ON risk_alerts
    FOR ALL USING (auth.uid() = user_id);

-- Strategies & Versions
CREATE POLICY "Users can manage own strategies" ON strategies
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage strategy versions" ON strategy_versions
    FOR ALL USING (EXISTS (
        SELECT 1 FROM strategies WHERE strategies.id = strategy_versions.strategy_id AND strategies.user_id = auth.uid()
    ));

-- Trades
CREATE POLICY "Users can manage own trades" ON trades
    FOR ALL USING (auth.uid() = user_id);

-- Trade Allocations
CREATE POLICY "Users can manage own trade allocations" ON trade_allocations
    FOR ALL USING (EXISTS (
        SELECT 1 FROM trades WHERE trades.id = trade_allocations.trade_id AND trades.user_id = auth.uid()
    ));

-- Trade Executions
CREATE POLICY "Users can manage own trade executions" ON trade_executions
    FOR ALL USING (EXISTS (
        SELECT 1 FROM trades WHERE trades.id = trade_executions.trade_id AND trades.user_id = auth.uid()
    ));

-- Snapshots
CREATE POLICY "Users can manage own snapshots" ON account_snapshots
    FOR ALL USING (EXISTS (
        SELECT 1 FROM trading_accounts WHERE trading_accounts.id = account_snapshots.account_id AND trading_accounts.user_id = auth.uid()
    ));

-- Journal & Psychology
CREATE POLICY "Users can manage own journal" ON journal_entries
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own psychology reviews" ON psychology_reviews
    FOR ALL USING (auth.uid() = user_id);

-- Import Jobs
CREATE POLICY "Users can manage own import jobs" ON import_jobs
    FOR ALL USING (auth.uid() = user_id);

-- Instruments (Global Read)
ALTER TABLE instruments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can view instruments" ON instruments
    FOR SELECT TO authenticated USING (true);

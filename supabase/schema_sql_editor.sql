-- ====================================================================
-- EDGELEDGER — COMPLETE SUPABASE SQL EDITOR SCHEMA
-- Run this entire script once in the Supabase Dashboard -> SQL Editor.
-- Safe to re-run (uses IF NOT EXISTS / ON CONFLICT / idempotent blocks).
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ENUM TYPES
DO $$ BEGIN
    CREATE TYPE account_type_enum AS ENUM (
        'personal', 'prop_evaluation', 'prop_verification',
        'funded', 'instant_funding', 'demo', 'custom'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE trade_direction_enum AS ENUM ('BUY', 'SELL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE trade_status_enum AS ENUM (
        'PLANNED', 'OPEN', 'PARTIALLY_CLOSED', 'CLOSED', 'CANCELLED', 'INVALIDATED'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE rule_status_enum AS ENUM ('SAFE', 'WARNING', 'BREACHED', 'UNKNOWN');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. PROFILES (Optional Supabase Auth profile table)
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

-- 4. INSTRUMENTS SPECIFICATIONS
CREATE TABLE IF NOT EXISTS instruments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
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

-- 5. TRADING ACCOUNTS
CREATE TABLE IF NOT EXISTS trading_accounts (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    name TEXT NOT NULL,
    broker_or_firm TEXT NOT NULL DEFAULT 'Personal',
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

-- 6. ACCOUNT TRANSACTIONS LEDGER (APPEND-ONLY)
CREATE TABLE IF NOT EXISTS account_transactions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    account_id TEXT NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
    transaction_type TEXT NOT NULL CHECK (
        transaction_type IN ('DEPOSIT', 'WITHDRAWAL', 'REALIZED_PNL', 'COMMISSION', 'SWAP', 'FEE_ADJUSTMENT', 'PHASE_RESET')
    ),
    amount NUMERIC(18, 2) NOT NULL,
    balance_after NUMERIC(18, 2) NOT NULL,
    reference_id TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. ACCOUNT RULESETS & RULES
CREATE TABLE IF NOT EXISTS account_rulesets (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    account_id TEXT NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Standard Prop Ruleset',
    description TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    effective_from TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS account_rules (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    ruleset_id TEXT REFERENCES account_rulesets(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
    rule_type TEXT NOT NULL,
    threshold_value NUMERIC(18, 4) NOT NULL,
    threshold_unit TEXT NOT NULL DEFAULT 'currency' CHECK (threshold_unit IN ('currency', 'percent', 'count', 'days', 'hours')),
    calculation_method TEXT NOT NULL DEFAULT 'balance_based' CHECK (calculation_method IN ('balance_based', 'equity_based', 'relative_trailing', 'static')),
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
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    account_id TEXT NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
    rule_id TEXT REFERENCES account_rules(id) ON DELETE SET NULL,
    rule_type TEXT NOT NULL,
    status rule_status_enum NOT NULL,
    metric_value NUMERIC(18, 4) NOT NULL,
    threshold_value NUMERIC(18, 4) NOT NULL,
    remaining_allowance NUMERIC(18, 4),
    message TEXT NOT NULL,
    evaluated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. RISK ALERTS
CREATE TABLE IF NOT EXISTS risk_alerts (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    account_id TEXT NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
    account_name TEXT DEFAULT 'Account',
    severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    rule_type TEXT,
    acknowledged BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. STRATEGIES & VERSIONS
CREATE TABLE IF NOT EXISTS strategies (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
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
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    strategy_id TEXT NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL DEFAULT 1,
    change_notes TEXT,
    entry_conditions TEXT,
    exit_conditions TEXT,
    effective_from TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. TRADES
CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    instrument_symbol TEXT NOT NULL,
    strategy_id TEXT REFERENCES strategies(id) ON DELETE SET NULL,
    strategy_name TEXT,
    strategy_version INTEGER DEFAULT 1,
    direction trade_direction_enum NOT NULL,
    status trade_status_enum NOT NULL DEFAULT 'OPEN',
    environment TEXT NOT NULL DEFAULT 'live' CHECK (environment IN ('live', 'demo', 'backtest')),
    timeframe TEXT DEFAULT '15M',
    session TEXT DEFAULT 'London' CHECK (session IN ('Asia', 'Asian', 'London', 'London Close', 'New York', 'Sydney', 'Off-Hours')),
    setup_type TEXT,
    entry_price NUMERIC(18, 6) NOT NULL,
    stop_loss NUMERIC(18, 6) NOT NULL,
    take_profit NUMERIC(18, 6),
    planned_risk_usd NUMERIC(18, 2) NOT NULL DEFAULT 0,
    planned_risk_pct NUMERIC(8, 2) NOT NULL DEFAULT 1.0,
    planned_rr NUMERIC(8, 2) NOT NULL DEFAULT 2.0,
    realized_pnl NUMERIC(18, 2) NOT NULL DEFAULT 0,
    net_pnl NUMERIC(18, 2) NOT NULL DEFAULT 0,
    realized_r NUMERIC(8, 2) NOT NULL DEFAULT 0,
    total_commission NUMERIC(18, 2) NOT NULL DEFAULT 0,
    total_swap NUMERIC(18, 2) NOT NULL DEFAULT 0,
    total_fees NUMERIC(18, 2) NOT NULL DEFAULT 0,
    entry_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    exit_time TIMESTAMPTZ,
    trade_thesis TEXT,
    technical_bias TEXT,
    macro_bias TEXT,
    macro_bias_context JSONB,
    market_conditions TEXT,
    screenshots TEXT[] DEFAULT ARRAY[]::TEXT[],
    tags TEXT[] DEFAULT ARRAY[]::TEXT[],
    checklist_answers JSONB DEFAULT '{}'::jsonb,
    is_rule_compliant BOOLEAN DEFAULT TRUE,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. TRADE ALLOCATIONS (PER ACCOUNT)
CREATE TABLE IF NOT EXISTS trade_allocations (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
    allocated_position_size NUMERIC(18, 4) NOT NULL,
    allocated_risk_usd NUMERIC(18, 2) NOT NULL DEFAULT 0,
    allocated_risk_pct NUMERIC(8, 2) NOT NULL DEFAULT 1.0,
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

-- 13. TRADE EXECUTIONS (ORDERS, PARTIALS, FILLS)
CREATE TABLE IF NOT EXISTS trade_executions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    trade_id TEXT NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    allocation_id TEXT REFERENCES trade_allocations(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
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
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    account_id TEXT NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
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

-- 15. JOURNAL ENTRIES
CREATE TABLE IF NOT EXISTS journal_entries (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    entry_date DATE NOT NULL,
    market_conditions TEXT,
    macro_environment TEXT,
    higher_timeframe_bias TEXT,
    technical_bias TEXT,
    trading_plan TEXT,
    important_economic_events TEXT,
    emotional_state TEXT DEFAULT 'Disciplined',
    daily_summary TEXT,
    lessonslearned TEXT,
    discipline_score INTEGER CHECK (discipline_score BETWEEN 1 AND 10),
    preparation_score INTEGER CHECK (preparation_score BETWEEN 1 AND 10),
    execution_score INTEGER CHECK (execution_score BETWEEN 1 AND 10),
    fomo_detected BOOLEAN DEFAULT FALSE,
    revenge_trading BOOLEAN DEFAULT FALSE,
    overtrading BOOLEAN DEFAULT FALSE,
    moved_stop_loss BOOLEAN DEFAULT FALSE,
    premature_exit BOOLEAN DEFAULT FALSE,
    ignored_rules BOOLEAN DEFAULT FALSE,
    is_locked BOOLEAN DEFAULT FALSE,
    locked_at TIMESTAMPTZ,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, entry_date)
);

-- 16. AUDIT LOG (IMMUTABLE AUDIT TRAIL)
CREATE TABLE IF NOT EXISTS audit_log (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id TEXT,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    before_state JSONB,
    after_state JSONB,
    request_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 17. PERSONALIZED PROP-FIRM RULE TEMPLATES & GATE ENGINE TABLES
CREATE TABLE IF NOT EXISTS firm_rule_templates (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    firm_id TEXT NOT NULL,
    firm_name TEXT NOT NULL,
    phase INTEGER CHECK (phase IN (1, 2) OR phase IS NULL),
    daily_loss_pct NUMERIC(5, 2) NOT NULL,
    total_loss_pct NUMERIC(5, 2) NOT NULL,
    total_loss_mode TEXT NOT NULL CHECK (total_loss_mode IN ('static_start', 'trailing_peak')),
    profit_target_pct NUMERIC(5, 2),
    min_trading_days INTEGER,
    max_risk_per_trade_pct NUMERIC(5, 2),
    news_restricted BOOLEAN DEFAULT TRUE,
    weekend_hold BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (firm_id, phase)
);

CREATE TABLE IF NOT EXISTS rulesets (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    account_id TEXT NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    daily_loss_mode TEXT NOT NULL CHECK (daily_loss_mode IN ('pct_day_start', 'fixed_amount')),
    daily_loss_value NUMERIC(18, 4) NOT NULL CHECK (daily_loss_value > 0),
    daily_reset_local_time VARCHAR(5) NOT NULL DEFAULT '00:00',
    daily_reset_timezone TEXT NOT NULL DEFAULT 'UTC',
    total_loss_mode TEXT NOT NULL CHECK (total_loss_mode IN ('static_start', 'trailing_peak')),
    total_loss_value NUMERIC(18, 4) NOT NULL CHECK (total_loss_value > 0),
    warn_threshold_pct NUMERIC(5, 2) NOT NULL DEFAULT 80.00 CHECK (warn_threshold_pct >= 50 AND warn_threshold_pct <= 99),
    enforcement TEXT NOT NULL DEFAULT 'enforce' CHECK (enforcement IN ('enforce', 'warn_only')),
    profit_target_value NUMERIC(18, 4),
    min_trading_days INTEGER,
    max_risk_per_trade_pct NUMERIC(5, 2),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (account_id, version)
);

CREATE TABLE IF NOT EXISTS gate_states (
    account_id TEXT PRIMARY KEY REFERENCES trading_accounts(id) ON DELETE CASCADE,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    daily_loss_used_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    daily_loss_used_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    total_loss_used_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    total_loss_used_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    profit_progress_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    status TEXT NOT NULL CHECK (status IN ('allowed', 'warning', 'blocked', 'locked')),
    blocking_rule TEXT,
    next_reset_at TIMESTAMPTZ NOT NULL,
    cache_expires_at TIMESTAMPTZ NOT NULL
);

-- 18. INDEXES FOR QUERY PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_trades_user_created ON trades(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_instrument ON trades(instrument_symbol);
CREATE INDEX IF NOT EXISTS idx_allocations_account ON trade_allocations(account_id);
CREATE INDEX IF NOT EXISTS idx_allocations_trade ON trade_allocations(trade_id);
CREATE INDEX IF NOT EXISTS idx_executions_trade ON trade_executions(trade_id);
CREATE INDEX IF NOT EXISTS idx_rules_account ON account_rules(account_id);
CREATE INDEX IF NOT EXISTS idx_journal_user_date ON journal_entries(user_id, entry_date DESC);

-- 19. SEED STANDARD CONTRACT SPECIFICATIONS & FIRM TEMPLATES
INSERT INTO instruments (symbol, name, category, contract_size, tick_size, tick_value, point_value, lot_step, min_lot, base_currency, quote_currency)
VALUES
    ('XAUUSD', 'Gold / US Dollar', 'metals', 100.0, 0.01, 1.0, 100.0, 0.01, 0.01, 'XAU', 'USD'),
    ('US30', 'Dow Jones Industrial 30', 'indices', 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 'USD', 'USD'),
    ('US500', 'S&P 500 Index', 'indices', 1.0, 0.1, 0.1, 1.0, 0.1, 0.1, 'USD', 'USD'),
    ('NAS100', 'Nasdaq 100 Index', 'indices', 1.0, 0.25, 0.25, 1.0, 0.1, 0.1, 'USD', 'USD'),
    ('EURUSD', 'Euro / US Dollar', 'forex', 100000.0, 0.00001, 1.0, 100000.0, 0.01, 0.01, 'EUR', 'USD'),
    ('GBPUSD', 'British Pound / US Dollar', 'forex', 100000.0, 0.00001, 1.0, 100000.0, 0.01, 0.01, 'GBP', 'USD'),
    ('USDJPY', 'US Dollar / Japanese Yen', 'forex', 100000.0, 0.001, 0.67, 1000.0, 0.01, 0.01, 'USD', 'JPY'),
    ('BTCUSD', 'Bitcoin / US Dollar', 'crypto', 1.0, 0.5, 0.5, 1.0, 0.01, 0.01, 'BTC', 'USD'),
    ('ETHUSD', 'Ethereum / US Dollar', 'crypto', 1.0, 0.01, 0.01, 1.0, 0.01, 0.01, 'ETH', 'USD'),
    ('USOIL', 'WTI Crude Oil', 'commodities', 1000.0, 0.01, 10.0, 1000.0, 0.01, 0.01, 'USD', 'USD')
ON CONFLICT (symbol) DO NOTHING;

INSERT INTO firm_rule_templates (firm_id, firm_name, phase, daily_loss_pct, total_loss_pct, total_loss_mode, profit_target_pct, min_trading_days, max_risk_per_trade_pct, news_restricted, weekend_hold)
VALUES
    ('apex', 'Apex Trader Funding', 1, 5.00, 5.00, 'trailing_peak', 6.00, 7, 2.00, false, false),
    ('apex', 'Apex Trader Funding', NULL, 5.00, 5.00, 'trailing_peak', NULL, NULL, 2.00, false, false),
    ('ftmo', 'FTMO', 1, 5.00, 10.00, 'static_start', 10.00, 4, 1.50, true, false),
    ('ftmo', 'FTMO', 2, 5.00, 10.00, 'static_start', 5.00, 4, 1.50, true, false),
    ('ftmo', 'FTMO', NULL, 5.00, 10.00, 'static_start', NULL, NULL, 1.50, false, true),
    ('topstep', 'Topstep', 1, 4.00, 6.00, 'trailing_peak', 6.00, 5, 2.00, true, false),
    ('topstep', 'Topstep', NULL, 4.00, 6.00, 'trailing_peak', NULL, NULL, 2.00, true, false),
    ('fundednext', 'FundedNext', 1, 5.00, 10.00, 'static_start', 10.00, 5, 2.00, false, true),
    ('fundednext', 'FundedNext', 2, 5.00, 10.00, 'static_start', 5.00, 5, 2.00, false, true)
ON CONFLICT (firm_id, phase) DO NOTHING;

-- 20. ROW LEVEL SECURITY (RLS)
-- Supports authenticated Supabase Auth users (auth.uid()::text = user_id)
-- AND single-workspace anon sync using the default workspace user_id.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE instruments ENABLE ROW LEVEL SECURITY;
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
ALTER TABLE firm_rule_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE rulesets ENABLE ROW LEVEL SECURITY;
ALTER TABLE gate_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_own" ON profiles;
CREATE POLICY "profiles_own" ON profiles FOR ALL USING (auth.uid() = id);

DROP POLICY IF EXISTS "instruments_read" ON instruments;
CREATE POLICY "instruments_read" ON instruments FOR SELECT USING (true);

DROP POLICY IF EXISTS "firm_templates_read" ON firm_rule_templates;
CREATE POLICY "firm_templates_read" ON firm_rule_templates FOR SELECT USING (true);

DROP POLICY IF EXISTS "trading_accounts_access" ON trading_accounts;
CREATE POLICY "trading_accounts_access" ON trading_accounts FOR ALL
    USING (auth.uid()::text = user_id OR user_id = '00000000-0000-0000-0000-000000000000')
    WITH CHECK (auth.uid()::text = user_id OR user_id = '00000000-0000-0000-0000-000000000000');

DROP POLICY IF EXISTS "account_rules_access" ON account_rules;
CREATE POLICY "account_rules_access" ON account_rules FOR ALL
    USING (EXISTS (SELECT 1 FROM trading_accounts a WHERE a.id = account_rules.account_id AND (auth.uid()::text = a.user_id OR a.user_id = '00000000-0000-0000-0000-000000000000')));

DROP POLICY IF EXISTS "account_rulesets_access" ON account_rulesets;
CREATE POLICY "account_rulesets_access" ON account_rulesets FOR ALL
    USING (EXISTS (SELECT 1 FROM trading_accounts a WHERE a.id = account_rulesets.account_id AND (auth.uid()::text = a.user_id OR a.user_id = '00000000-0000-0000-0000-000000000000')));

DROP POLICY IF EXISTS "account_transactions_access" ON account_transactions;
CREATE POLICY "account_transactions_access" ON account_transactions FOR ALL
    USING (EXISTS (SELECT 1 FROM trading_accounts a WHERE a.id = account_transactions.account_id AND (auth.uid()::text = a.user_id OR a.user_id = '00000000-0000-0000-0000-000000000000')));

DROP POLICY IF EXISTS "rule_evaluations_access" ON rule_evaluations;
CREATE POLICY "rule_evaluations_access" ON rule_evaluations FOR ALL
    USING (EXISTS (SELECT 1 FROM trading_accounts a WHERE a.id = rule_evaluations.account_id AND (auth.uid()::text = a.user_id OR a.user_id = '00000000-0000-0000-0000-000000000000')));

DROP POLICY IF EXISTS "account_snapshots_access" ON account_snapshots;
CREATE POLICY "account_snapshots_access" ON account_snapshots FOR ALL
    USING (EXISTS (SELECT 1 FROM trading_accounts a WHERE a.id = account_snapshots.account_id AND (auth.uid()::text = a.user_id OR a.user_id = '00000000-0000-0000-0000-000000000000')));

DROP POLICY IF EXISTS "rulesets_access" ON rulesets;
CREATE POLICY "rulesets_access" ON rulesets FOR ALL
    USING (EXISTS (SELECT 1 FROM trading_accounts a WHERE a.id = rulesets.account_id AND (auth.uid()::text = a.user_id OR a.user_id = '00000000-0000-0000-0000-000000000000')));

DROP POLICY IF EXISTS "gate_states_access" ON gate_states;
CREATE POLICY "gate_states_access" ON gate_states FOR ALL
    USING (EXISTS (SELECT 1 FROM trading_accounts a WHERE a.id = gate_states.account_id AND (auth.uid()::text = a.user_id OR a.user_id = '00000000-0000-0000-0000-000000000000')));

DROP POLICY IF EXISTS "risk_alerts_access" ON risk_alerts;
CREATE POLICY "risk_alerts_access" ON risk_alerts FOR ALL
    USING (auth.uid()::text = user_id OR user_id = '00000000-0000-0000-0000-000000000000')
    WITH CHECK (auth.uid()::text = user_id OR user_id = '00000000-0000-0000-0000-000000000000');

DROP POLICY IF EXISTS "strategies_access" ON strategies;
CREATE POLICY "strategies_access" ON strategies FOR ALL
    USING (auth.uid()::text = user_id OR user_id = '00000000-0000-0000-0000-000000000000')
    WITH CHECK (auth.uid()::text = user_id OR user_id = '00000000-0000-0000-0000-000000000000');

DROP POLICY IF EXISTS "strategy_versions_access" ON strategy_versions;
CREATE POLICY "strategy_versions_access" ON strategy_versions FOR ALL
    USING (EXISTS (SELECT 1 FROM strategies s WHERE s.id = strategy_versions.strategy_id AND (auth.uid()::text = s.user_id OR s.user_id = '00000000-0000-0000-0000-000000000000')));

DROP POLICY IF EXISTS "trades_access" ON trades;
CREATE POLICY "trades_access" ON trades FOR ALL
    USING (auth.uid()::text = user_id OR user_id = '00000000-0000-0000-0000-000000000000')
    WITH CHECK (auth.uid()::text = user_id OR user_id = '00000000-0000-0000-0000-000000000000');

DROP POLICY IF EXISTS "trade_allocations_access" ON trade_allocations;
CREATE POLICY "trade_allocations_access" ON trade_allocations FOR ALL
    USING (EXISTS (SELECT 1 FROM trades t WHERE t.id = trade_allocations.trade_id AND (auth.uid()::text = t.user_id OR t.user_id = '00000000-0000-0000-0000-000000000000')));

DROP POLICY IF EXISTS "trade_executions_access" ON trade_executions;
CREATE POLICY "trade_executions_access" ON trade_executions FOR ALL
    USING (EXISTS (SELECT 1 FROM trades t WHERE t.id = trade_executions.trade_id AND (auth.uid()::text = t.user_id OR t.user_id = '00000000-0000-0000-0000-000000000000')));

DROP POLICY IF EXISTS "journal_entries_access" ON journal_entries;
CREATE POLICY "journal_entries_access" ON journal_entries FOR ALL
    USING (auth.uid()::text = user_id OR user_id = '00000000-0000-0000-0000-000000000000')
    WITH CHECK (auth.uid()::text = user_id OR user_id = '00000000-0000-0000-0000-000000000000');

DROP POLICY IF EXISTS "audit_log_access" ON audit_log;
CREATE POLICY "audit_log_access" ON audit_log FOR SELECT
    USING (auth.uid()::text = user_id OR user_id = '00000000-0000-0000-0000-000000000000');

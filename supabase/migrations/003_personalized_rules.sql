-- Migration: 003_personalized_rules.sql
-- Personalised trading rules, versioned rulesets, firm templates, gate states, and audit log

-- 1. FIRM RULE TEMPLATES (Read-only ceiling for trader limits)
CREATE TABLE IF NOT EXISTS firm_rule_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firm_id TEXT NOT NULL,
    firm_name TEXT NOT NULL,
    phase INTEGER CHECK (phase IN (1, 2, NULL)),
    daily_loss_pct NUMERIC(5, 2) NOT NULL, -- e.g. 5.00%
    total_loss_pct NUMERIC(5, 2) NOT NULL, -- e.g. 10.00%
    total_loss_mode TEXT NOT NULL CHECK (total_loss_mode IN ('static_start', 'trailing_peak')),
    profit_target_pct NUMERIC(5, 2),       -- e.g. 10.00% or 5.00%
    min_trading_days INTEGER,              -- e.g. 4
    max_risk_per_trade_pct NUMERIC(5, 2),  -- e.g. 1.00%
    news_restricted BOOLEAN DEFAULT TRUE,
    weekend_hold BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (firm_id, phase)
);

-- 2. ACCOUNTS TABLE (Updated for personalized rules & optimistic locking)
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    label TEXT NOT NULL,
    broker_or_firm_id TEXT, -- nullable for Live
    account_type TEXT NOT NULL CHECK (account_type IN ('evaluation', 'funded', 'payout', 'live')),
    base_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    starting_balance NUMERIC(18, 2) NOT NULL CHECK (starting_balance > 0),
    current_balance NUMERIC(18, 2) NOT NULL,
    current_equity NUMERIC(18, 2) NOT NULL,
    peak_equity NUMERIC(18, 2) NOT NULL,
    daily_start_equity NUMERIC(18, 2) NOT NULL,
    phase INTEGER CHECK (phase IN (1, 2, NULL)),
    phase_status TEXT NOT NULL DEFAULT 'active' CHECK (phase_status IN ('active', 'passed', 'failed', 'paused')),
    notes TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. RULESETS (Versioned, append-only, never updated in place)
CREATE TABLE IF NOT EXISTS rulesets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    version INTEGER NOT NULL DEFAULT 1,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    daily_loss_mode TEXT NOT NULL CHECK (daily_loss_mode IN ('pct_day_start', 'fixed_amount')),
    daily_loss_value NUMERIC(18, 4) NOT NULL CHECK (daily_loss_value > 0),
    daily_reset_local_time VARCHAR(5) NOT NULL DEFAULT '00:00', -- HH:MM
    daily_reset_timezone TEXT NOT NULL DEFAULT 'UTC',           -- IANA timezone
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

-- 4. GATE STATES (Computed, cached, recomputed on every execution write)
CREATE TABLE IF NOT EXISTS gate_states (
    account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
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

-- 5. AUDIT EVENTS (Append-only audit log)
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    actor TEXT NOT NULL,
    event_type TEXT NOT NULL,
    before_state JSONB,
    after_state JSONB,
    reason TEXT,
    request_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. DAILY RESET HISTORY (Idempotent per account_id and reset_date)
CREATE TABLE IF NOT EXISTS daily_reset_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    reset_date DATE NOT NULL,
    reset_instant TIMESTAMPTZ NOT NULL,
    daily_start_equity NUMERIC(18, 2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (account_id, reset_date)
);

-- Seed Firm Rule Templates
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
ON CONFLICT (firm_id, phase) DO UPDATE SET
    daily_loss_pct = EXCLUDED.daily_loss_pct,
    total_loss_pct = EXCLUDED.total_loss_pct,
    total_loss_mode = EXCLUDED.total_loss_mode,
    profit_target_pct = EXCLUDED.profit_target_pct,
    min_trading_days = EXCLUDED.min_trading_days,
    max_risk_per_trade_pct = EXCLUDED.max_risk_per_trade_pct,
    news_restricted = EXCLUDED.news_restricted,
    weekend_hold = EXCLUDED.weekend_hold;

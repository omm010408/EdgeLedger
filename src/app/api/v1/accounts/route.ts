import { NextRequest, NextResponse } from 'next/server';
import { AccountRepository } from '@/lib/data/accountRepository';
import { validateRuleSetAgainstFirmCeiling } from '@/lib/calculations/gateEngine';
import { problemResponse } from '@/lib/api/problemDetails';

export async function GET() {
  const accounts = AccountRepository.getAllAccounts();
  const result = accounts.map((account) => {
    const ruleSet = AccountRepository.getActiveRuleSet(account.id);
    const gateState = AccountRepository.getGateState(account.id);
    return {
      account,
      ruleSet,
      gateState,
    };
  });

  return NextResponse.json({ accounts: result });
}

export async function POST(req: NextRequest) {
  const idempotencyKey = req.headers.get('Idempotency-Key');
  if (!idempotencyKey) {
    return problemResponse(
      400,
      'Missing Idempotency-Key Header',
      'The Idempotency-Key header is required for creating accounts and rule sets in one transaction.'
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return problemResponse(
      400,
      'Invalid JSON Payload',
      'The request body could not be parsed as valid JSON.'
    );
  }

  const {
    label,
    broker_or_firm_id,
    account_type,
    base_currency = 'USD',
    starting_balance,
    phase = 1,
    phase_status = 'active',
    daily_loss_mode = 'pct_day_start',
    daily_loss_value,
    daily_reset_local_time = '00:00',
    daily_reset_timezone = 'UTC',
    total_loss_mode = 'static_start',
    total_loss_value,
    warn_threshold_pct = 80,
    enforcement = 'enforce',
    profit_target_value,
    min_trading_days,
    max_risk_per_trade_pct,
    notes = '',
  } = body;

  if (!label || typeof label !== 'string' || label.trim().length === 0) {
    return problemResponse(
      422,
      'Validation Error',
      'One or more fields failed validation.',
      [{ name: 'label', reason: 'Account label is required.' }]
    );
  }

  const validAccountTypes = ['evaluation', 'funded', 'payout', 'live'];
  if (!validAccountTypes.includes(account_type)) {
    return problemResponse(
      422,
      'Validation Error',
      'Invalid account_type provided.',
      [
        {
          name: 'account_type',
          reason: `account_type must be one of: ${validAccountTypes.join(', ')}.`,
        },
      ]
    );
  }

  // Look up firm ceiling template
  const firmTemplate = broker_or_firm_id
    ? AccountRepository.getFirmTemplate(broker_or_firm_id, phase)
    : null;

  // Validate rule set draft against bounds and firm ceiling
  const draft = {
    dailyLossMode: daily_loss_mode,
    dailyLossValue: daily_loss_value,
    dailyResetLocalTime: daily_reset_local_time,
    dailyResetTimezone: daily_reset_timezone,
    totalLossMode: total_loss_mode,
    totalLossValue: total_loss_value,
    warnThresholdPct: Number(warn_threshold_pct),
    enforcement,
    profitTargetValue: profit_target_value,
    minTradingDays: min_trading_days,
    maxRiskPerTradePct: max_risk_per_trade_pct,
  };

  const validation = validateRuleSetAgainstFirmCeiling(draft, starting_balance, firmTemplate);

  if (!validation.isValid) {
    return problemResponse(
      422,
      'Validation Error',
      'Trader limits failed schema bounds or exceeded the firm ceiling.',
      validation.errors
    );
  }

  // Create account and rule set in one transaction
  const created = AccountRepository.createAccountWithRuleSet(
    {
      userId: 'user-default',
      label: label.trim(),
      brokerOrFirmId: broker_or_firm_id || null,
      accountType: account_type,
      baseCurrency: base_currency.toUpperCase(),
      startingBalance: Number(starting_balance).toFixed(2),
      phase: phase !== null && phase !== undefined ? Number(phase) : null,
      phaseStatus: phase_status,
      notes,
    },
    {
      createdBy: 'user-default',
      dailyLossMode: daily_loss_mode,
      dailyLossValue: String(daily_loss_value),
      dailyResetLocalTime: daily_reset_local_time,
      dailyResetTimezone: daily_reset_timezone,
      totalLossMode: total_loss_mode,
      totalLossValue: String(total_loss_value),
      warnThresholdPct: Number(warn_threshold_pct),
      enforcement,
      profitTargetValue: profit_target_value ? String(profit_target_value) : null,
      minTradingDays: min_trading_days ? Number(min_trading_days) : null,
      maxRiskPerTradePct: max_risk_per_trade_pct ? String(max_risk_per_trade_pct) : null,
    },
    idempotencyKey
  );

  return NextResponse.json(created, {
    status: 201,
    headers: {
      Location: `/v1/accounts/${created.account.id}`,
    },
  });
}

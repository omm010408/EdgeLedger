import { NextRequest, NextResponse } from 'next/server';
import { AccountRepository } from '@/lib/data/accountRepository';
import { validateRuleSetAgainstFirmCeiling } from '@/lib/calculations/gateEngine';
import { problemResponse } from '@/lib/api/problemDetails';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const account = AccountRepository.getAccount(id);
  if (!account) {
    return problemResponse(
      404,
      'Account Not Found',
      `Trading account with id "${id}" does not exist.`
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
  } = body;

  const firmTemplate = account.brokerOrFirmId
    ? AccountRepository.getFirmTemplate(account.brokerOrFirmId, account.phase)
    : null;

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

  const validation = validateRuleSetAgainstFirmCeiling(draft, account.startingBalance, firmTemplate);

  if (!validation.isValid) {
    return problemResponse(
      422,
      'Validation Error',
      'Trader limits failed schema bounds or exceeded the firm ceiling.',
      validation.errors
    );
  }

  const result = AccountRepository.createRuleSetVersion(id, {
    createdBy: 'trader',
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
  });

  return NextResponse.json(result, { status: 201 });
}

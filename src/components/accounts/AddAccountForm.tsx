'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTrading } from '../../context/TradingContext';
import { SEED_FIRM_TEMPLATES } from '../../lib/data/accountRepository';
import { computeGateState, validateRuleSetAgainstFirmCeiling } from '../../lib/calculations/gateEngine';
import { AccountTypeCategory, DailyLossMode, TotalLossMode, EnforcementMode } from '../../lib/types/gate';
import { AccountRule } from '../../lib/types/financial';
import { Check, AlertTriangle, ShieldAlert, Lock, RefreshCw } from 'lucide-react';

interface AddAccountFormProps {
  onCancel?: () => void;
  onSuccess?: () => void;
  isModal?: boolean;
}

const COMMON_TIMEZONES = [
  { value: 'UTC', label: 'UTC (+00:00)' },
  { value: 'America/New_York', label: 'New York (EST/EDT)' },
  { value: 'America/Chicago', label: 'Chicago (CST/CDT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Prague', label: 'Prague / CE(S)T' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Dubai', label: 'Dubai (GST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST)' },
];

export const AddAccountForm: React.FC<AddAccountFormProps> = ({
  onCancel,
  onSuccess,
  isModal = false,
}) => {
  const router = useRouter();
  const { addAccount } = useTrading();

  // Form Fields - Clean initial state with informative placeholders
  const [label, setLabel] = useState('');
  // Manual prop firm / broker name (NO dropdown/select)
  const [brokerOrFirm, setBrokerOrFirm] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [accountType, setAccountType] = useState<AccountTypeCategory>('evaluation');
  const [startingBalance, setStartingBalance] = useState('');
  const [phase, setPhase] = useState<number | null>(1);

  // Personalized Loss Limits
  const [dailyLossMode, setDailyLossMode] = useState<DailyLossMode>('pct_day_start');
  const [dailyLossValue, setDailyLossValue] = useState('');
  const [dailyResetLocalTime, setDailyResetLocalTime] = useState('00:00');
  const [dailyResetTimezone, setDailyResetTimezone] = useState('UTC');

  const [totalLossMode, setTotalLossMode] = useState<TotalLossMode>('trailing_peak');
  const [totalLossValue, setTotalLossValue] = useState('');
  const [profitTargetMode, setProfitTargetMode] = useState<'pct' | 'currency'>('pct');
  const [profitTargetValue, setProfitTargetValue] = useState('8.0');
  const [warnThresholdPct, setWarnThresholdPct] = useState(80);
  const [enforcement, setEnforcement] = useState<EnforcementMode>('enforce');
  const [newsRestricted, setNewsRestricted] = useState(false);

  const [notes, setNotes] = useState('');

  // Stepper & Submission State
  const [activeStep, setActiveStep] = useState<'identity' | 'limits' | 'review'>('identity');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverErrors, setServerErrors] = useState<Array<{ name: string; reason: string }>>([]);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Match known firm template based on user's manually typed firm name
  const activeFirmTemplate = useMemo(() => {
    const firmLower = (brokerOrFirm || '').trim().toLowerCase();
    if (!firmLower) return null;
    const match = SEED_FIRM_TEMPLATES.find((t) => {
      const isMatch = firmLower.includes(t.firmId) || t.firmName.toLowerCase().includes(firmLower);
      return isMatch && (t.phase === phase || (t.phase === null && phase === null));
    });
    if (match) return match;
    return SEED_FIRM_TEMPLATES.find((t) =>
      firmLower.includes(t.firmId) || t.firmName.toLowerCase().includes(firmLower)
    ) || null;
  }, [brokerOrFirm, phase]);

  // Sync news restricted flag if firm specifies it
  useEffect(() => {
    if (activeFirmTemplate) {
      setNewsRestricted(activeFirmTemplate.newsRestricted);
    }
  }, [activeFirmTemplate]);

  // Adjust defaults when a recognized firm name is typed
  useEffect(() => {
    if (activeFirmTemplate) {
      setDailyLossValue(activeFirmTemplate.dailyLossPct.toFixed(1));
      setTotalLossValue(activeFirmTemplate.totalLossPct.toFixed(1));
      setTotalLossMode(activeFirmTemplate.totalLossMode);
      if (activeFirmTemplate.profitTargetPct) {
        setProfitTargetMode('pct');
        setProfitTargetValue(activeFirmTemplate.profitTargetPct.toFixed(1));
      }
    }
  }, [activeFirmTemplate?.id]);

  // Calculate live limits in currency
  const calculatedLimits = useMemo(() => {
    const startBal = parseFloat(startingBalance) || 100000;
    let dailyLimitDollars = 0;
    if (dailyLossMode === 'pct_day_start') {
      dailyLimitDollars = startBal * ((parseFloat(dailyLossValue) || 5) / 100);
    } else {
      dailyLimitDollars = parseFloat(dailyLossValue) || 5000;
    }

    const totalLossPct = (parseFloat(totalLossValue) || 10) / 100;
    const totalLimitDollars = startBal * totalLossPct;
    const totalFloorDollars = startBal - totalLimitDollars;
    const rawTarget = parseFloat(profitTargetValue);
    let targetDollars = 0;
    let targetPct = 0;
    if (accountType !== 'live') {
      if (Number.isFinite(rawTarget) && rawTarget > 0) {
        targetDollars = profitTargetMode === 'pct' ? startBal * (rawTarget / 100) : rawTarget;
        targetPct = profitTargetMode === 'pct' ? rawTarget : (rawTarget / startBal) * 100;
      } else {
        targetPct = activeFirmTemplate?.profitTargetPct || 8;
        targetDollars = startBal * (targetPct / 100);
      }
    }

    return {
      dailyLimitDollars,
      totalLimitDollars,
      totalFloorDollars,
      targetDollars,
      targetPct,
      startBal,
    };
  }, [
    startingBalance,
    dailyLossMode,
    dailyLossValue,
    totalLossMode,
    totalLossValue,
    profitTargetMode,
    profitTargetValue,
    accountType,
    activeFirmTemplate,
  ]);

  // Client-Side Gate Preview
  const previewGateState = useMemo(() => {
    try {
      const mockAcc: any = {
        id: 'preview',
        userId: 'preview',
        label,
        brokerOrFirmId: brokerOrFirm,
        accountType,
        baseCurrency,
        startingBalance: calculatedLimits.startBal.toFixed(2),
        currentBalance: calculatedLimits.startBal.toFixed(2),
        currentEquity: calculatedLimits.startBal.toFixed(2),
        peakEquity: calculatedLimits.startBal.toFixed(2),
        dailyStartEquity: calculatedLimits.startBal.toFixed(2),
        phase,
        phaseStatus: 'active',
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const mockRuleSet: any = {
        id: 'ruleset-preview',
        accountId: 'preview',
        version: 1,
        createdAt: new Date().toISOString(),
        effectiveFrom: new Date().toISOString(),
        dailyLossMode,
        dailyLossValue,
        dailyResetLocalTime,
        dailyResetTimezone,
        totalLossMode,
        totalLossValue,
        warnThresholdPct,
        enforcement,
        profitTargetValue:
          accountType !== 'live' && calculatedLimits.targetPct > 0
            ? calculatedLimits.targetPct.toFixed(2)
            : null,
        minTradingDays: activeFirmTemplate?.minTradingDays || null,
        maxRiskPerTradePct: activeFirmTemplate?.maxRiskPerTradePct ? String(activeFirmTemplate.maxRiskPerTradePct) : null,
        isActive: true,
      };

      return computeGateState({
        account: mockAcc,
        ruleSet: mockRuleSet,
        firmTemplate: activeFirmTemplate,
        currentEquity: calculatedLimits.startBal,
        peakEquity: calculatedLimits.startBal,
        dailyStartEquity: calculatedLimits.startBal,
        openFloatingPnl: 0,
      });
    } catch {
      return null;
    }
  }, [
    label,
    brokerOrFirm,
    accountType,
    baseCurrency,
    calculatedLimits,
    phase,
    dailyLossMode,
    dailyLossValue,
    dailyResetLocalTime,
    dailyResetTimezone,
    totalLossMode,
    totalLossValue,
    warnThresholdPct,
    enforcement,
    activeFirmTemplate,
  ]);

  // Pre-validate locally
  const localValidation = useMemo(() => {
    const draft = {
      dailyLossMode,
      dailyLossValue,
      dailyResetLocalTime,
      dailyResetTimezone,
      totalLossMode,
      totalLossValue,
      warnThresholdPct,
      enforcement,
    };
    return validateRuleSetAgainstFirmCeiling(draft, startingBalance, activeFirmTemplate);
  }, [
    dailyLossMode,
    dailyLossValue,
    dailyResetLocalTime,
    dailyResetTimezone,
    totalLossMode,
    totalLossValue,
    warnThresholdPct,
    enforcement,
    startingBalance,
    activeFirmTemplate,
  ]);

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      router.push('/accounts');
    }
  };

  const validateIdentityStep = (): boolean => {
    const errs: Array<{ name: string; reason: string }> = [];
    if (!label.trim()) {
      errs.push({ name: 'label', reason: 'Account label is required.' });
    }
    if (!brokerOrFirm.trim()) {
      errs.push({ name: 'brokerOrFirm', reason: 'Broker or prop firm name is required.' });
    }
    const parsedBal = parseFloat(startingBalance);
    if (!Number.isFinite(parsedBal) || parsedBal < 100) {
      errs.push({ name: 'startingBalance', reason: 'Enter a starting balance of at least 100.' });
    }
    if (errs.length > 0) {
      setServerErrors(errs);
      setActiveStep('identity');
      return false;
    }
    setServerErrors([]);
    return true;
  };

  const handleGoToStep = (nextStep: 'identity' | 'limits' | 'review') => {
    setGeneralError(null);
    if (nextStep === 'identity') {
      setServerErrors([]);
      setActiveStep('identity');
      return;
    }
    if (!validateIdentityStep()) return;
    if (nextStep === 'review' && !localValidation.isValid) {
      setServerErrors(localValidation.errors);
      setActiveStep('limits');
      return;
    }
    setServerErrors([]);
    setActiveStep(nextStep);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerErrors([]);
    setGeneralError(null);

    if (!validateIdentityStep()) {
      return;
    }

    if (!localValidation.isValid) {
      setServerErrors(localValidation.errors);
      setActiveStep('limits');
      return;
    }

    setIsSubmitting(true);
    const idempotencyKey = `idemp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    try {
      const payload = {
        label: label.trim(),
        broker_or_firm_id: brokerOrFirm.trim(),
        account_type: accountType,
        base_currency: baseCurrency,
        starting_balance: startingBalance,
        phase: phase,
        daily_loss_mode: dailyLossMode,
        daily_loss_value: dailyLossValue,
        daily_reset_local_time: dailyResetLocalTime,
        daily_reset_timezone: dailyResetTimezone,
        total_loss_mode: totalLossMode,
        total_loss_value: totalLossValue,
        warn_threshold_pct: warnThresholdPct,
        enforcement: enforcement,
        profit_target_value:
          accountType !== 'live' && calculatedLimits.targetPct > 0
            ? Number(calculatedLimits.targetPct.toFixed(2))
            : activeFirmTemplate?.profitTargetPct,
        min_trading_days: activeFirmTemplate?.minTradingDays,
        max_risk_per_trade_pct: activeFirmTemplate?.maxRiskPerTradePct,
        notes: notes,
      };

      const res = await fetch('/api/v1/accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.invalid_params) {
          setServerErrors(data.invalid_params);
        } else {
          setGeneralError(data.detail || 'Server rejected account creation.');
        }
        setIsSubmitting(false);
        return;
      }

      // Build exact personalized AccountRules from the user's configured limits so Accounts & Risk reflect them immediately
      const size = parseFloat(startingBalance) || 100000;
      const newAccId = data.account?.id || `acc-${Date.now()}`;
      const dailyNum = parseFloat(dailyLossValue) || (dailyLossMode === 'pct_day_start' ? 5 : size * 0.05);
      const totalNum = parseFloat(totalLossValue) || 10;
      const nowIso = new Date().toISOString();

      const customRules: AccountRule[] = [
        {
          id: `rule-${Date.now()}-daily`,
          accountId: newAccId,
          ruleType: 'daily_loss_limit',
          thresholdValue: dailyNum,
          thresholdUnit: (dailyLossMode === 'pct_day_start' ? 'percent' : 'currency') as 'percent' | 'currency',
          calculationMethod: 'equity_based' as const,
          warningThresholdPct: warnThresholdPct,
          isEnabled: true,
          currentStatus: 'SAFE' as const,
          currentMetricValue: 0,
          resetFrequency: 'daily' as const,
          applicableTimezone: dailyResetTimezone,
          version: 1,
          effectiveFrom: nowIso,
        },
        {
          id: `rule-${Date.now()}-total`,
          accountId: newAccId,
          ruleType: totalLossMode === 'trailing_peak' ? 'trailing_drawdown' : 'max_overall_loss',
          thresholdValue: totalNum,
          thresholdUnit: 'percent' as const,
          calculationMethod: (totalLossMode === 'trailing_peak' ? 'relative_trailing' : 'static') as 'relative_trailing' | 'static',
          warningThresholdPct: warnThresholdPct,
          isEnabled: true,
          currentStatus: 'SAFE' as const,
          currentMetricValue: 0,
          resetFrequency: 'none' as const,
          applicableTimezone: dailyResetTimezone,
          version: 1,
          effectiveFrom: nowIso,
        },
        ...(accountType !== 'live' && calculatedLimits.targetDollars > 0
          ? [
              {
                id: `rule-${Date.now()}-target`,
                accountId: newAccId,
                ruleType: 'profit_target' as const,
                thresholdValue: Math.round(calculatedLimits.targetDollars),
                thresholdUnit: 'currency' as const,
                calculationMethod: 'static' as const,
                warningThresholdPct: 90,
                isEnabled: true,
                currentStatus: 'SAFE' as const,
                currentMetricValue: 0,
                resetFrequency: 'none' as const,
                applicableTimezone: dailyResetTimezone,
                version: 1,
                effectiveFrom: nowIso,
              },
            ]
          : []),
        ...(activeFirmTemplate?.maxRiskPerTradePct
          ? [
              {
                id: `rule-${Date.now()}-risk`,
                accountId: newAccId,
                ruleType: 'max_risk_per_trade_pct' as const,
                thresholdValue: activeFirmTemplate.maxRiskPerTradePct,
                thresholdUnit: 'percent' as const,
                calculationMethod: 'equity_based' as const,
                warningThresholdPct: warnThresholdPct,
                isEnabled: true,
                currentStatus: 'SAFE' as const,
                currentMetricValue: 0,
                resetFrequency: 'none' as const,
                applicableTimezone: dailyResetTimezone,
                version: 1,
                effectiveFrom: nowIso,
              },
            ]
          : []),
      ];

      // Add to TradingContext state
      addAccount({
        id: newAccId,
        name: data.account.label,
        brokerOrFirm: brokerOrFirm.trim(),
        accountType:
          accountType === 'live'
            ? 'personal'
            : accountType === 'funded'
            ? 'funded'
            : 'prop_evaluation',
        accountSize: size,
        startingBalance: size,
        currentBalance: size,
        currentEquity: size,
        highWaterMark: size,
        currency: baseCurrency,
        challengePhase: phase ? `Phase ${phase}` : 'Funded',
        rules: customRules,
        notes: notes,
      });

      setIsSubmitting(false);
      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/accounts');
      }
    } catch (err: any) {
      setGeneralError(err.message || 'Network error communicating with gate engine.');
      setIsSubmitting(false);
    }
  };

  const getFieldError = (fieldName: string) => {
    return serverErrors.find((e) => e.name === fieldName)?.reason;
  };

  return (
    <div className={`tw-add-account-board w-full ${isModal ? 'p-6 sm:p-8 !bg-transparent' : 'max-w-[1440px] mx-auto p-4 sm:p-7'}`}>
      
      {/* Top Header & Steps */}
      <div className="tw-titlerow pb-4 border-b border-[var(--line)]">
        <div>
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-[12px] bg-[var(--hero)] text-[var(--hero-ink)] font-bold grid place-items-center text-sm shadow-sm">
              E
            </span>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--ink)]">
              Add trading account
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-[var(--ink-2)] mt-1.5">
            Set the account's phase, your own loss limits, and whether a breach blocks new trades.
          </p>
        </div>
        <div className="tw-controls flex-wrap">
          <div className="tw-steps" role="tablist" aria-label="Account setup steps">
            <button
              type="button"
              role="tab"
              aria-selected={activeStep === 'identity'}
              aria-current={activeStep === 'identity' ? 'step' : undefined}
              onClick={() => handleGoToStep('identity')}
            >
              <b>1</b>Identity
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeStep === 'limits'}
              aria-current={activeStep === 'limits' ? 'step' : undefined}
              onClick={() => handleGoToStep('limits')}
            >
              <b>2</b>Limits
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeStep === 'review'}
              aria-current={activeStep === 'review' ? 'step' : undefined}
              onClick={() => handleGoToStep('review')}
            >
              <b>3</b>Review
            </button>
          </div>
          <button
            onClick={handleCancel}
            className="btn quiet hover:bg-[var(--pill)] px-4 py-2 rounded-full border border-[var(--line-strong)] text-[var(--ink-2)] text-xs sm:text-sm font-medium"
            type="button"
          >
            Cancel
          </button>
          {activeStep === 'review' ? (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="btn dark px-5 py-2 rounded-full bg-[var(--ink)] text-[var(--tile)] font-semibold text-xs sm:text-sm flex items-center gap-2 hover:opacity-90 disabled:opacity-50 cursor-pointer"
              type="button"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Validating...</span>
                </>
              ) : (
                'Create account'
              )}
            </button>
          ) : (
            <button
              onClick={() => handleGoToStep(activeStep === 'identity' ? 'limits' : 'review')}
              className="btn dark px-5 py-2 rounded-full bg-[var(--ink)] text-[var(--tile)] font-semibold text-xs sm:text-sm flex items-center gap-2 hover:opacity-90 cursor-pointer"
              type="button"
            >
              {activeStep === 'identity' ? 'Continue to Limits' : 'Review account'}
            </button>
          )}
        </div>
      </div>

      {/* Validation Error Alert */}
      {(serverErrors.length > 0 || generalError) && (
        <div className="mt-4 p-4 rounded-2xl bg-[var(--warn-bg)] border border-[var(--warn-line)] text-[var(--warn)] flex items-start gap-3">
          <ShieldAlert size={20} className="shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <b className="font-semibold text-sm">Gate Validation Rejected:</b>
            {generalError && <div>{generalError}</div>}
            {serverErrors.map((err, i) => (
              <div key={i} className="font-mono">
                • <span className="font-semibold">{err.name}</span>: {err.reason}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 12-Column Grid */}
      <form onSubmit={handleSubmit} className="tw-grid mt-6">

        {/* STEP 1: IDENTITY (Account Identity + Capital & Phase) */}
        {activeStep === 'identity' && (
          <>
            {/* Section 1: Account Identity (Cols 1-7) */}
            <section className="tw-tile tw-ident" aria-label="Account identity">
          <div className="tw-thead">
            <span className="tw-lbl">Account identity</span>
            <span className="tw-sub">Required fields are marked by their label</span>
          </div>

          <div className="tw-field" style={{ marginBottom: '12px' }}>
            <span className="tw-lbl">Account label</span>
            <div className={`tw-input ${getFieldError('label') ? 'border-[var(--loss)]' : ''}`}>
              <input
                type="text"
                placeholder="e.g. Apex 100K Funded Live #1"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                required
              />
            </div>
            {getFieldError('label') && (
              <span className="text-[11px] text-[var(--loss)]">{getFieldError('label')}</span>
            )}
          </div>

          <div className="tw-grid2" style={{ marginBottom: '12px' }}>
            {/* MANUAL PROP FIRM / BROKER NAME - NO DROPDOWN/SELECT */}
            <div className="tw-field">
              <div className="flex items-center justify-between">
                <span className="tw-lbl">Broker or prop firm</span>
                {activeFirmTemplate && (
                  <span className="text-[10px] text-[var(--gain)] font-mono font-medium">Ceilings detected</span>
                )}
              </div>
              <div className="tw-input">
                <input
                  type="text"
                  placeholder="e.g. Apex, FTMO, Topstep, IC Markets"
                  value={brokerOrFirm}
                  onChange={(e) => setBrokerOrFirm(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="tw-field">
              <span className="tw-lbl">Base currency</span>
              <div className="tw-input">
                <select
                  value={baseCurrency}
                  onChange={(e) => setBaseCurrency(e.target.value)}
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                </select>
                <span className="tw-chev">▼</span>
              </div>
            </div>
          </div>

          <div className="tw-field">
            <span className="tw-lbl">Account type</span>
            <div className="tw-cats" role="group" aria-label="Account type">
              <button
                className="tw-cat"
                type="button"
                aria-pressed={accountType === 'evaluation'}
                onClick={() => {
                  setAccountType('evaluation');
                  setPhase(1);
                }}
              >
                <b>Evaluation</b>
                <small>Challenge, phased</small>
              </button>
              <button
                className="tw-cat"
                type="button"
                aria-pressed={accountType === 'funded'}
                onClick={() => {
                  setAccountType('funded');
                  setPhase(null);
                }}
              >
                <b>Funded</b>
                <small>Firm capital</small>
              </button>
              <button
                className="tw-cat"
                type="button"
                aria-pressed={accountType === 'payout'}
                onClick={() => {
                  setAccountType('payout');
                  setPhase(null);
                }}
              >
                <b>Payout</b>
                <small>Withdrawal stage</small>
              </button>
              <button
                className="tw-cat"
                type="button"
                aria-pressed={accountType === 'live'}
                onClick={() => {
                  setAccountType('live');
                  setPhase(null);
                }}
              >
                <b>Live</b>
                <small>Your own capital</small>
              </button>
            </div>
          </div>
        </section>

        {/* Section 2: Capital and Phase (Cols 8-12, Sun Tile) */}
        <section className="tw-tile tw-capital" aria-label="Capital and phase">
          <div className="tw-thead" style={{ marginBottom: '6px' }}>
            <span className="tw-lbl font-semibold">Capital and phase</span>
            <span className="pill px-3 py-0.5 rounded-full text-xs font-bold bg-[var(--sun-ink)] text-[var(--sun)]">
              {accountType === 'evaluation' ? `Phase ${phase || 1} of 2` : 'Funded Stage'}
            </span>
          </div>

          <div className="tw-big">
            {Number(startingBalance || 0).toLocaleString('en-US')}
            <small>{baseCurrency}</small>
          </div>

          <div className="tw-sub font-medium" style={{ marginTop: '6px' }}>
            Starting balance. {activeFirmTemplate?.profitTargetPct ? `Profit target ${activeFirmTemplate.profitTargetPct}%, from the firm rules below.` : 'Trader-defined target.'}
          </div>

          <div className="mt-3">
            <span className="tw-lbl text-[11px] uppercase tracking-wider block mb-1">Starting balance</span>
            <div className="tw-input mono font-semibold">
              <input
                type="number"
                value={startingBalance}
                onChange={(e) => setStartingBalance(e.target.value)}
                min="1000"
                step="1000"
              />
              <span className="text-xs">{baseCurrency}</span>
            </div>
          </div>

          <div className="tw-phases">
            <div
              className="tw-ph"
              aria-current={phase === 1 ? 'step' : undefined}
              onClick={() => setPhase(1)}
            >
              <b>Phase 1</b>
              <small>
                Target ${Math.round(calculatedLimits.targetDollars).toLocaleString('en-US')}
              </small>
            </div>
            <div
              className="tw-ph"
              aria-current={phase === 2 ? 'step' : undefined}
              onClick={() => setPhase(2)}
            >
              <b>Phase 2</b>
              <small>
                Target ${Math.round(calculatedLimits.startBal * 0.05).toLocaleString('en-US')}
              </small>
            </div>
          </div>
        </section>

        {/* Identity Step Footer Bar */}
        <section className="tw-tile col-span-12" aria-label="Identity step actions">
          <div className="tw-actionbar !mt-0">
            <span>Step 1 of 3 · Define desk label, firm, currency, and starting balance before setting loss gates.</span>
            <div>
              <button
                type="button"
                onClick={handleCancel}
                className="btn quiet hover:bg-[var(--pill)] px-4 py-2 rounded-full border border-[var(--line-strong)] text-[var(--ink-2)] text-xs sm:text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleGoToStep('limits')}
                className="btn dark px-5 py-2 rounded-full bg-[var(--ink)] text-[var(--tile)] font-semibold text-xs sm:text-sm hover:opacity-90 cursor-pointer"
              >
                Next: Risk &amp; limits
              </button>
            </div>
          </div>
        </section>
          </>
        )}

        {/* STEP 2: LIMITS (Loss Limits, Live Gate Preview, Firm Rules, Notes) */}
        {activeStep === 'limits' && (
          <>
        {/* Section 3: Personal Loss & Prop Firm Profit Limits (Cols 1-6) */}
        <section className="tw-tile tw-limits" aria-label="Your loss and profit limits">
          <div className="tw-thead">
            <span className="tw-lbl">
              {accountType !== 'live' ? 'Loss & profit target limits' : 'Your loss limits'}
            </span>
            <span className="tw-sub">
              {activeFirmTemplate ? 'Stricter than the firm is allowed' : 'Configure risk & target thresholds'}
            </span>
          </div>

          {/* Daily Loss Card */}
          <div className="tw-lim">
            <div className="tw-limhead">
              <b>Daily loss limit</b>
              <span className="loss font-mono">−${calculatedLimits.dailyLimitDollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="tw-limrow">
              <div className="tw-field">
                <span className="tw-lbl">Measured as</span>
                <div className="tw-seg two" role="group" aria-label="Daily loss measured as">
                  <button
                    type="button"
                    aria-pressed={dailyLossMode === 'pct_day_start'}
                    onClick={() => setDailyLossMode('pct_day_start')}
                  >
                    % of day start
                  </button>
                  <button
                    type="button"
                    aria-pressed={dailyLossMode === 'fixed_amount'}
                    onClick={() => setDailyLossMode('fixed_amount')}
                  >
                    Fixed $
                  </button>
                </div>
              </div>

              <div className="tw-field">
                <span className="tw-lbl">Limit</span>
                <div className={`tw-input mono ${getFieldError('dailyLossValue') ? 'border-[var(--loss)]' : ''}`}>
                  <input
                    type="number"
                    step={dailyLossMode === 'pct_day_start' ? '0.1' : '100'}
                    placeholder={dailyLossMode === 'pct_day_start' ? '5.0' : '2500'}
                    value={dailyLossValue}
                    onChange={(e) => setDailyLossValue(e.target.value)}
                  />
                  <span className="tw-chev">{dailyLossMode === 'pct_day_start' ? '%' : '$'}</span>
                </div>
              </div>

              <div className="tw-field">
                <span className="tw-lbl">Resets at</span>
                <div className="tw-input mono">
                  <select
                    value={dailyResetTimezone}
                    onChange={(e) => setDailyResetTimezone(e.target.value)}
                    className="text-xs"
                  >
                    {COMMON_TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {dailyResetLocalTime} {tz.value.split('/')[1] || tz.value}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            {getFieldError('dailyLossValue') && (
              <div className="text-[11px] text-[var(--loss)] mt-1 font-mono">
                {getFieldError('dailyLossValue')}
              </div>
            )}
          </div>

          {/* Total Loss Card */}
          <div className="tw-lim">
            <div className="tw-limhead">
              <b>Total loss limit</b>
              <span className="loss font-mono">Floor ${calculatedLimits.totalFloorDollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
            <div className="tw-limrow">
              <div className="tw-field">
                <span className="tw-lbl">Counted from</span>
                <div className="tw-seg two" role="group" aria-label="Total loss counted from">
                  <button
                    type="button"
                    aria-pressed={totalLossMode === 'static_start'}
                    onClick={() => setTotalLossMode('static_start')}
                  >
                    Start balance
                  </button>
                  <button
                    type="button"
                    aria-pressed={totalLossMode === 'trailing_peak'}
                    onClick={() => setTotalLossMode('trailing_peak')}
                  >
                    Peak equity
                  </button>
                </div>
              </div>

              <div className="tw-field">
                <span className="tw-lbl">Limit</span>
                <div className={`tw-input mono ${getFieldError('totalLossValue') ? 'border-[var(--loss)]' : ''}`}>
                  <input
                    type="number"
                    step="0.5"
                    placeholder="e.g. 5.0 or 10.0"
                    value={totalLossValue}
                    onChange={(e) => setTotalLossValue(e.target.value)}
                  />
                  <span className="tw-chev">%</span>
                </div>
              </div>

              <div className="tw-field">
                <span className="tw-lbl">Warn at</span>
                <div className="tw-input mono">
                  <input
                    type="number"
                    min="50"
                    max="99"
                    value={warnThresholdPct}
                    onChange={(e) => setWarnThresholdPct(parseInt(e.target.value, 10) || 80)}
                  />
                  <span className="tw-chev">%</span>
                </div>
              </div>
            </div>
            {getFieldError('totalLossValue') && (
              <div className="text-[11px] text-[var(--loss)] mt-1 font-mono">
                {getFieldError('totalLossValue')}
              </div>
            )}
          </div>

          {/* Prop Firm Profit Target Section */}
          {accountType !== 'live' && (
            <div className="tw-lim">
              <div className="tw-limhead">
                <b>Profit target (Prop firm)</b>
                <span className="font-mono" style={{ color: 'var(--tw-gain)' }}>
                  +${calculatedLimits.targetDollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="tw-limrow">
                <div className="tw-field">
                  <span className="tw-lbl">Measured as</span>
                  <div className="tw-seg two" role="group" aria-label="Profit target measured as">
                    <button
                      type="button"
                      aria-pressed={profitTargetMode === 'pct'}
                      onClick={() => setProfitTargetMode('pct')}
                    >
                      % of start
                    </button>
                    <button
                      type="button"
                      aria-pressed={profitTargetMode === 'currency'}
                      onClick={() => setProfitTargetMode('currency')}
                    >
                      Fixed $
                    </button>
                  </div>
                </div>

                <div className="tw-field">
                  <span className="tw-lbl">Target</span>
                  <div className="tw-input mono">
                    <input
                      type="number"
                      step={profitTargetMode === 'pct' ? '0.5' : '100'}
                      min="0"
                      placeholder={profitTargetMode === 'pct' ? '8.0' : '8000'}
                      value={profitTargetValue}
                      onChange={(e) => setProfitTargetValue(e.target.value)}
                    />
                    <span className="tw-chev">{profitTargetMode === 'pct' ? '%' : '$'}</span>
                  </div>
                </div>

                <div className="tw-field">
                  <span className="tw-lbl">Stage</span>
                  <div className="tw-input mono text-xs flex items-center px-3">
                    {accountType === 'evaluation' ? `Phase ${phase || 1}` : accountType === 'payout' ? 'Payout' : 'Funded'}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Section 4: Gate Live Preview (Cols 7-12) */}
        <section className="tw-tile tw-gate" aria-label="Trading gate preview">
          <div className="tw-thead">
            <span className="tw-lbl">Trading gate, live preview</span>
            <span className="tw-sub">Updates as you edit limits</span>
          </div>

          <div className={`tw-gate-state ${previewGateState?.status || 'allowed'}`}>
            <span className={`tw-gate-dot ${previewGateState?.status || 'allowed'}`} aria-hidden="true">
              {previewGateState?.status === 'warning' ? (
                <AlertTriangle size={20} />
              ) : previewGateState?.status === 'blocked' ? (
                <ShieldAlert size={20} />
              ) : previewGateState?.status === 'locked' ? (
                <Lock size={20} />
              ) : (
                <Check size={20} strokeWidth={3} />
              )}
            </span>
            <div>
              <b>
                {previewGateState?.status === 'warning'
                  ? 'Warning threshold'
                  : previewGateState?.status === 'locked'
                  ? 'Trading locked until reset'
                  : previewGateState?.status === 'blocked'
                  ? 'Trading blocked by rule'
                  : 'Trading allowed'}
              </b>
              <small>
                {previewGateState?.status === 'allowed'
                  ? 'Nothing has been used yet. Blocks start at 100% of a limit.'
                  : 'Server gate enforces write block on execution recording.'}
              </small>
            </div>
          </div>

          <div className="tw-gate-bars">
            <div className="tw-gate-bar">
              <span>Daily loss used</span>
              <span className="mono font-mono">$0.00 of ${calculatedLimits.dailyLimitDollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <div className="tw-gate-track">
                <i style={{ width: '0%' }}></i>
                <em style={{ left: `${warnThresholdPct}%` }}></em>
              </div>
            </div>

            <div className="tw-gate-bar">
              <span>Total loss used</span>
              <span className="mono font-mono">$0.00 of ${calculatedLimits.totalLimitDollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <div className="tw-gate-track">
                <i style={{ width: '0%' }}></i>
                <em style={{ left: `${warnThresholdPct}%` }}></em>
              </div>
            </div>

            <div className="tw-gate-bar">
              <span>Phase target progress</span>
              <span className="mono font-mono">$0.00 of ${calculatedLimits.targetDollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <div className="tw-gate-track">
                <i style={{ width: '0%', background: 'var(--hero)' }}></i>
              </div>
            </div>
          </div>

          <div className="tw-enforce">
            <p>When a limit is reached, new executions are blocked until the reset. Warn-only shows the state but lets you record.</p>
            <div className="tw-seg two" role="group" aria-label="Enforcement">
              <button
                type="button"
                aria-pressed={enforcement === 'enforce'}
                onClick={() => setEnforcement('enforce')}
              >
                Enforce
              </button>
              <button
                type="button"
                aria-pressed={enforcement === 'warn_only'}
                onClick={() => setEnforcement('warn_only')}
              >
                Warn only
              </button>
            </div>
          </div>
        </section>

        {/* Section 5: Firm Rules (Cols 1-6) */}
        <section className="tw-tile tw-firm" aria-label="Firm rules">
          <div className="tw-thead">
            <span className="tw-lbl">Firm rules, applied as published</span>
            <span className="tw-sub">{activeFirmTemplate ? 'Editable only by the firm' : 'Custom desk rules'}</span>
          </div>
          <div className="tw-rules">
            <div className="tw-rule">
              <div>
                <b>Profit target</b>
                <small>{accountType === 'live' ? 'No firm target' : accountType === 'evaluation' ? `Phase ${phase || 1}` : 'Prop firm target'}</small>
              </div>
              <span className="mono">
                {accountType !== 'live' && calculatedLimits.targetDollars > 0
                  ? `${calculatedLimits.targetPct.toFixed(1)}% · $${Math.round(calculatedLimits.targetDollars).toLocaleString('en-US')}`
                  : 'Trader target'}
              </span>
              <span></span>
            </div>

            <div className="tw-rule">
              <div>
                <b>Minimum trading days</b>
                <small>{activeFirmTemplate ? `Phase ${phase || 1}` : 'Trader set'}</small>
              </div>
              <span className="mono">
                {activeFirmTemplate?.minTradingDays ? `${activeFirmTemplate.minTradingDays} days` : 'No minimum'}
              </span>
              <span></span>
            </div>

            <div className="tw-rule">
              <div>
                <b>Max risk per trade</b>
                <small>{activeFirmTemplate ? 'Firm cap' : 'Trader set'}</small>
              </div>
              <span className="mono">
                {activeFirmTemplate?.maxRiskPerTradePct ? `${activeFirmTemplate.maxRiskPerTradePct.toFixed(1)}%` : 'No firm cap'}
              </span>
              <span></span>
            </div>

            <div className="tw-rule">
              <div>
                <b>Block trading near high-impact news</b>
                <small>{activeFirmTemplate ? 'Firm rule, shown for awareness' : 'Personal rule toggle'}</small>
              </div>
              <span></span>
              <button
                type="button"
                onClick={() => {
                  if (!activeFirmTemplate) {
                    setNewsRestricted(!newsRestricted);
                  }
                }}
                className={`tw-tog ${newsRestricted ? 'on' : ''} ${activeFirmTemplate ? 'cursor-default' : 'cursor-pointer'}`}
                aria-label="Toggle news trading restriction"
              ></button>
            </div>
          </div>
        </section>

        {/* Section 6: Notes & Actions (Cols 7-12) */}
        <section className="tw-tile tw-notes" aria-label="Account notes">
          <div className="tw-thead">
            <span className="tw-lbl">Strategy and rules notes</span>
            <span className="tw-sub">Optional. Shown on the account card.</span>
          </div>
          <textarea
            className="tw-area"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Trailing drawdown from peak, scale down after 3 losing days, no trading during the first 15 minutes of London."
          />
          <div className="tw-actionbar">
            <span>Step 2 of 3 · Review your identity and risk gates next before creating.</span>
            <div>
              <button
                type="button"
                onClick={() => handleGoToStep('identity')}
                className="btn quiet hover:bg-[var(--pill)] px-4 py-2 rounded-full border border-[var(--line-strong)] text-[var(--ink-2)] text-xs sm:text-sm font-medium"
              >
                Back: Identity
              </button>
              <button
                type="button"
                onClick={() => handleGoToStep('review')}
                className="btn dark px-5 py-2 rounded-full bg-[var(--ink)] text-[var(--tile)] font-semibold text-xs sm:text-sm hover:opacity-90 flex items-center gap-2 cursor-pointer"
              >
                Next: Review
              </button>
            </div>
          </div>
        </section>
          </>
        )}

        {/* STEP 3: REVIEW (Full Summary before Account Provisioning) */}
        {activeStep === 'review' && (
          <>
            {/* Identity Review Summary (Cols 1-5) */}
            <section className="tw-tile col-span-12 lg:col-span-5" aria-label="Review account identity">
              <div className="tw-thead">
                <span className="tw-lbl">Account identity</span>
                <button
                  type="button"
                  onClick={() => handleGoToStep('identity')}
                  className="text-xs font-semibold hover:underline"
                  style={{ color: 'var(--tw-focus)' }}
                >
                  Edit identity
                </button>
              </div>
              <div className="space-y-1">
                <div className="tw-review-row">
                  <span className="tw-review-k">Desk / Account Label</span>
                  <span className="tw-review-v">{label.trim() || '—'}</span>
                </div>
                <div className="tw-review-row">
                  <span className="tw-review-k">Broker / Prop Firm</span>
                  <span className="tw-review-v">{brokerOrFirm.trim() || '—'}</span>
                </div>
                <div className="tw-review-row">
                  <span className="tw-review-k">Account Type</span>
                  <span className="tw-review-v capitalize">{accountType}</span>
                </div>
                <div className="tw-review-row">
                  <span className="tw-review-k">Stage / Phase</span>
                  <span className="tw-review-v">
                    {accountType === 'evaluation' ? `Phase ${phase || 1}` : accountType === 'payout' ? 'Payout' : accountType === 'live' ? 'Live' : 'Funded'}
                  </span>
                </div>
                <div className="tw-review-row">
                  <span className="tw-review-k">Base Currency</span>
                  <span className="tw-review-v font-mono">{baseCurrency}</span>
                </div>
                <div className="tw-review-row">
                  <span className="tw-review-k">Starting Balance</span>
                  <span className="tw-review-v font-mono">
                    {Number(calculatedLimits.startBal).toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    {baseCurrency}
                  </span>
                </div>
              </div>
            </section>

            {/* Risk Limits & Firm Rules Summary (Cols 6-12) */}
            <section className="tw-tile col-span-12 lg:col-span-7" aria-label="Review risk limits and enforcement">
              <div className="tw-thead">
                <span className="tw-lbl">Limits, profit target &amp; enforcement</span>
                <button
                  type="button"
                  onClick={() => handleGoToStep('limits')}
                  className="text-xs font-semibold hover:underline"
                  style={{ color: 'var(--tw-focus)' }}
                >
                  Edit limits
                </button>
              </div>
              <div className="space-y-1">
                <div className="tw-review-row">
                  <span className="tw-review-k">Daily Loss Limit</span>
                  <span className="tw-review-v font-mono" style={{ color: 'var(--tw-loss)' }}>
                    −${calculatedLimits.dailyLimitDollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                    ({dailyLossMode === 'pct_day_start' ? `${parseFloat(dailyLossValue) || 5}% of day start` : 'Fixed'})
                  </span>
                </div>
                <div className="tw-review-row">
                  <span className="tw-review-k">Total Loss Limit</span>
                  <span className="tw-review-v font-mono" style={{ color: 'var(--tw-loss)' }}>
                    Floor ${calculatedLimits.totalFloorDollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{' '}
                    ({parseFloat(totalLossValue) || 10}% · {totalLossMode === 'trailing_peak' ? 'Trailing peak' : 'Static start'})
                  </span>
                </div>
                <div className="tw-review-row">
                  <span className="tw-review-k">Daily Reset Window</span>
                  <span className="tw-review-v font-mono">
                    {dailyResetLocalTime} {dailyResetTimezone}
                  </span>
                </div>
                <div className="tw-review-row">
                  <span className="tw-review-k">Warning Alert Threshold</span>
                  <span className="tw-review-v font-mono">{warnThresholdPct}% of limit</span>
                </div>
                <div className="tw-review-row">
                  <span className="tw-review-k">Profit Target</span>
                  <span className="tw-review-v font-mono" style={{ color: 'var(--tw-gain)' }}>
                    {accountType === 'live'
                      ? 'Trader-defined (Live)'
                      : `+$${calculatedLimits.targetDollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${calculatedLimits.targetPct.toFixed(1)}%)`}
                  </span>
                </div>
                <div className="tw-review-row">
                  <span className="tw-review-k">Gate Enforcement</span>
                  <span className="tw-review-v">
                    {enforcement === 'enforce' ? 'Enforce (blocks new trades on breach)' : 'Warn only'}
                  </span>
                </div>
                <div className="tw-review-row">
                  <span className="tw-review-k">News Trading Restriction</span>
                  <span className="tw-review-v">{newsRestricted ? 'Restricted around red-folder news' : 'Allowed'}</span>
                </div>
              </div>
            </section>

            {/* Gate Readiness & Strategy Notes + Final Create Action (Cols 1-12) */}
            <section className="tw-tile col-span-12" aria-label="Confirm and create account">
              <div className="tw-thead">
                <span className="tw-lbl">Ready to provision · Review notes &amp; confirm</span>
                <span className="tw-sub">
                  {previewGateState?.status === 'allowed' ? 'Gate Status: Allowed' : `Gate Status: ${previewGateState?.status || 'Allowed'}`}
                </span>
              </div>

              <div
                className="p-3.5 rounded-2xl text-xs mb-4"
                style={{
                  background: 'var(--pill)',
                  border: '1px solid var(--line)',
                  color: 'var(--ink-2)',
                }}
              >
                <span className="font-semibold block mb-1" style={{ color: 'var(--ink)' }}>
                  Strategy &amp; rules notes
                </span>
                {notes.trim() ? notes.trim() : 'No optional notes provided.'}
              </div>

              <div className="tw-actionbar !mt-0">
                <span>Step 3 of 3 · Creating this desk persists rules across Overview, Accounts, Risk &amp; Trades.</span>
                <div>
                  <button
                    type="button"
                    onClick={() => handleGoToStep('limits')}
                    className="btn quiet hover:bg-[var(--pill)] px-4 py-2 rounded-full border border-[var(--line-strong)] text-[var(--ink-2)] text-xs sm:text-sm font-medium"
                  >
                    Back: Limits
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="btn dark px-5 py-2 rounded-full bg-[var(--ink)] text-[var(--tile)] font-semibold text-xs sm:text-sm hover:opacity-90 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                  >
                    {isSubmitting ? 'Saving...' : 'Create account'}
                  </button>
                </div>
              </div>
            </section>
          </>
        )}

      </form>
    </div>
  );
};

'use client';

import React, { useState, useMemo } from 'react';
import { useTrading } from '../../context/TradingContext';
import {
  ShieldAlert,
  ShieldCheck,
  Calculator,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  TrendingDown,
  Percent,
  DollarSign,
  Sliders,
  Settings2,
  Check,
  X
} from 'lucide-react';
import { calculatePositionSize, evaluateAccountRule } from '../../lib/calculations/financialEngine';
import { AccountRule, RuleStatus } from '../../lib/types/financial';

export default function RiskTerminalPage() {
  const {
    accounts,
    selectedAccountId,
    setSelectedAccountId,
    instruments,
    trades,
    toggleRule,
    updateRule,
  } = useTrading();

  // Selected account state for risk terminal (can be local or synced with context)
  const [localAccountId, setLocalAccountId] = useState<string>(() => {
    if (selectedAccountId && selectedAccountId !== 'ALL') return selectedAccountId;
    return accounts[0]?.id || '';
  });

  const activeAccount = useMemo(() => {
    return accounts.find((a) => a.id === localAccountId) || accounts[0];
  }, [accounts, localAccountId]);

  // Editing rule modal state
  const [editingRule, setEditingRule] = useState<AccountRule | null>(null);
  const [editThreshold, setEditThreshold] = useState<string>('');
  const [editWarningPct, setEditWarningPct] = useState<string>('');

  const openEditModal = (rule: AccountRule) => {
    setEditingRule(rule);
    setEditThreshold(rule.thresholdValue.toString());
    setEditWarningPct(rule.warningThresholdPct.toString());
  };

  const handleSaveRule = () => {
    if (!editingRule || !activeAccount) return;
    const newThreshold = parseFloat(editThreshold);
    const newWarningPct = parseFloat(editWarningPct);

    if (!isNaN(newThreshold) && !isNaN(newWarningPct)) {
      updateRule(activeAccount.id, {
        ...editingRule,
        thresholdValue: newThreshold,
        warningThresholdPct: Math.min(99, Math.max(10, newWarningPct)),
      });
    }
    setEditingRule(null);
  };

  // Calculator inputs
  const [calcSymbol, setCalcSymbol] = useState('XAUUSD');
  const [calcRiskPct, setCalcRiskPct] = useState('1.0');
  const [calcEntry, setCalcEntry] = useState('2710.00');
  const [calcSl, setCalcSl] = useState('2702.00');
  const [calcTp, setCalcTp] = useState('2726.00');

  const selectedInst = instruments.find((i) => i.symbol === calcSymbol) || instruments[0];

  // Position calculation
  const numEntry = parseFloat(calcEntry) || 0;
  const numSl = parseFloat(calcSl) || 0;
  const numTp = parseFloat(calcTp) || 0;
  const numRiskPct = parseFloat(calcRiskPct) || 1.0;

  // Personalized Rule Enforcement: Check if planned risk % breaches active account's personalized max_risk_per_trade_pct rule
  const maxRiskRule = activeAccount?.rules?.find(
    (r) => r.ruleType === 'max_risk_per_trade_pct' && r.isEnabled
  );
  const isRiskBreached = maxRiskRule ? numRiskPct > maxRiskRule.thresholdValue : false;
  const isRiskWarning = maxRiskRule
    ? numRiskPct >= (maxRiskRule.thresholdValue * maxRiskRule.warningThresholdPct) / 100 &&
      numRiskPct <= maxRiskRule.thresholdValue
    : false;

  let calcResult = null;
  let calcError = null;

  try {
    if (activeAccount && numEntry > 0 && numSl > 0 && numEntry !== numSl) {
      calcResult = calculatePositionSize({
        accountEquity: activeAccount.currentEquity,
        riskPercentage: numRiskPct,
        entryPrice: numEntry,
        stopLossPrice: numSl,
        takeProfitPrice: numTp > 0 ? numTp : undefined,
        instrument: selectedInst,
      });
    }
  } catch (e: any) {
    calcError = e.message;
  }

  // Pre-trade checklist state
  const [checklist, setChecklist] = useState({
    c1: false,
    c2: false,
    c3: false,
    c4: false,
    c5: false,
    c6: false,
    c7: false,
    c8: false,
  });

  const allPassed = Object.values(checklist).every(Boolean);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(val);
  };

  // Evaluate all rules for active account
  const evaluatedRules = useMemo(() => {
    if (!activeAccount || !activeAccount.rules) return [];

    return activeAccount.rules.map((rule) => {
      let metricVal = rule.currentMetricValue;

      // If metric is trailing drawdown, compute live: HWM - currentEquity
      if (rule.ruleType === 'trailing_drawdown') {
        metricVal = Math.max(0, activeAccount.highWaterMark - activeAccount.currentEquity);
      }

      const evalResult = evaluateAccountRule(
        rule,
        metricVal,
        activeAccount.startingBalance,
        activeAccount.currentEquity,
        activeAccount.highWaterMark
      );

      return {
        rule,
        evalResult,
      };
    });
  }, [activeAccount]);

  // Find key rules for top cards
  const dailyLossRule = evaluatedRules.find((r) => r.rule.ruleType === 'daily_loss_limit');
  const drawdownRule = evaluatedRules.find(
    (r) => r.rule.ruleType === 'trailing_drawdown' || r.rule.ruleType === 'max_overall_loss'
  );
  const tradeRiskRule = evaluatedRules.find((r) => r.rule.ruleType === 'max_risk_per_trade_pct');
  const targetOrGovernanceRule = evaluatedRules.find(
    (r) =>
      r.rule.ruleType === 'profit_target' ||
      r.rule.ruleType === 'max_open_risk_pct' ||
      r.rule.ruleType === 'min_trading_days' ||
      r.rule.ruleType === 'max_open_positions'
  );

  const getStatusBadge = (status: RuleStatus) => {
    switch (status) {
      case 'SAFE':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[var(--tw-aqua)] text-[var(--tw-aqua-ink)]">
            SAFE
          </span>
        );
      case 'WARNING':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[var(--tw-warn-bg)] text-[var(--tw-warn)]">
            WARNING
          </span>
        );
      case 'BREACHED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[var(--tw-loss)]/15 text-[var(--tw-loss)]">
            BREACHED
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[var(--tw-pill)] text-[var(--tw-ink-2)]">
            UNKNOWN
          </span>
        );
    }
  };

  if (!activeAccount) {
    return (
      <div className="p-8 text-center text-[var(--tw-ink-2)]">
        No accounts configured. Please provision a trading account.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Header & Institutional Risk Identity */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--tw-line)]">
        <div>
          <div className="flex items-center space-x-2">
            <ShieldAlert size={20} className="text-[var(--tw-hero-line)]" />
            <h1 className="text-xl font-mono font-bold tracking-tight text-[var(--tw-ink)] uppercase">
              INSTITUTIONAL RISK TERMINAL
            </h1>
          </div>
          <p className="text-xs text-[var(--tw-ink-2)] mt-0.5 font-sans">
            Account-segregated quantitative risk governance, personalized rules, and pre-execution compliance gates.
          </p>
        </div>

        <div className="flex items-center space-x-2 font-mono text-xs">
          <span className="text-[var(--tw-ink-3)]">Active Surveillance Desk:</span>
          <span className="font-bold text-[var(--tw-ink)] px-2.5 py-1 rounded-full bg-[var(--tw-tile)] border border-[var(--tw-line-strong)]">
            {activeAccount.name}
          </span>
        </div>
      </div>

      {/* 2. Personalized Account Switcher Bar */}
      <div className="bg-[var(--tw-tile)] p-2 rounded-2xl border border-[var(--tw-line)] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] font-mono text-[var(--tw-ink-3)] uppercase px-2 font-semibold">
            Select Desk:
          </span>
          {accounts.map((acc) => {
            const isSelected = acc.id === activeAccount.id;
            return (
              <button
                key={acc.id}
                type="button"
                onClick={() => {
                  setLocalAccountId(acc.id);
                  setSelectedAccountId(acc.id);
                }}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-sans transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[var(--tw-hero)] text-[var(--tw-hero-ink)] font-semibold shadow-sm border border-[var(--tw-hero-line)]/50'
                    : 'text-[var(--tw-ink-2)] hover:text-[var(--tw-ink)] hover:bg-[var(--tw-pill)] border border-transparent'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isSelected ? 'bg-[var(--tw-hero-line)]' : 'bg-[var(--tw-line-strong)]'
                  }`}
                />
                <span>{acc.name}</span>
                <span className="text-[10px] font-mono opacity-80">
                  (${acc.currentEquity.toLocaleString('en-US')})
                </span>
              </button>
            );
          })}
        </div>

        <div className="text-xs font-mono text-[var(--tw-ink-3)] px-2">
          {activeAccount.brokerOrFirm} • {activeAccount.challengePhase}
        </div>
      </div>

      {/* 3. Top 4 Surveillance KPI Tiles — Evaluated from activeAccount's actual rules */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Tile 1: Daily Loss Allowance */}
        <div className="p-4 rounded-2xl border border-[var(--tw-line)] bg-[var(--tw-tile)] space-y-1.5 font-mono">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[var(--tw-ink-3)] uppercase">Daily Loss Buffer</span>
            {dailyLossRule ? getStatusBadge(dailyLossRule.evalResult.status) : null}
          </div>
          <div className="text-xl font-bold text-[var(--tw-ink)] tabular-nums">
            {dailyLossRule
              ? formatCurrency(dailyLossRule.evalResult.remainingAllowance)
              : formatCurrency(activeAccount.accountSize * 0.05)}
          </div>
          <div className="text-[11px] text-[var(--tw-gain)] flex items-center justify-between font-sans">
            <span>
              Limit: {dailyLossRule ? formatCurrency(dailyLossRule.rule.thresholdValue) : '$2,500'}
            </span>
            <span className="text-[10px] text-[var(--tw-ink-3)] font-mono">
              {dailyLossRule?.rule.calculationMethod || 'equity_based'}
            </span>
          </div>
        </div>

        {/* Tile 2: Drawdown Allowance */}
        <div className="p-4 rounded-2xl border border-[var(--tw-line)] bg-[var(--tw-tile)] space-y-1.5 font-mono">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[var(--tw-ink-3)] uppercase">
              {drawdownRule?.rule.ruleType === 'trailing_drawdown'
                ? 'Trailing Drawdown'
                : 'Overall Drawdown'}
            </span>
            {drawdownRule ? getStatusBadge(drawdownRule.evalResult.status) : null}
          </div>
          <div className="text-xl font-bold text-[var(--tw-ink)] tabular-nums">
            {drawdownRule
              ? formatCurrency(drawdownRule.evalResult.remainingAllowance)
              : formatCurrency(activeAccount.highWaterMark - activeAccount.currentEquity)}
          </div>
          <div className="text-[11px] text-[var(--tw-hero-line)] flex items-center justify-between font-sans">
            <span>
              Peak: ${activeAccount.highWaterMark.toLocaleString('en-US')}
            </span>
            <span className="text-[10px] text-[var(--tw-ink-3)] font-mono">
              Limit: {drawdownRule ? formatCurrency(drawdownRule.rule.thresholdValue) : '$5,000'}
            </span>
          </div>
        </div>

        {/* Tile 3: Max Risk Per Trade */}
        <div className="p-4 rounded-2xl border border-[var(--tw-line)] bg-[var(--tw-tile)] space-y-1.5 font-mono">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[var(--tw-ink-3)] uppercase">Max Risk Per Trade</span>
            {tradeRiskRule ? getStatusBadge(tradeRiskRule.evalResult.status) : null}
          </div>
          <div className="text-xl font-bold text-[var(--tw-ink)] tabular-nums">
            {tradeRiskRule ? `${tradeRiskRule.rule.thresholdValue}%` : '2.0%'}
          </div>
          <div className="text-[11px] text-[var(--tw-ink-2)] flex items-center justify-between font-sans">
            <span>
              Max Risk USD:{' '}
              {formatCurrency(
                (activeAccount.currentEquity * (tradeRiskRule?.rule.thresholdValue || 2.0)) / 100
              )}
            </span>
            <span className="text-[10px] text-[var(--tw-gain)] font-mono">Enforced</span>
          </div>
        </div>

        {/* Tile 4: Governance / Firm Goal (Profit Target, Min Days, Max Open Risk) */}
        <div className="p-4 rounded-2xl border border-[var(--tw-line)] bg-[var(--tw-tile)] space-y-1.5 font-mono">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[var(--tw-ink-3)] uppercase">
              {targetOrGovernanceRule?.rule.ruleType.replace(/_/g, ' ') || 'Desk Governance'}
            </span>
            {targetOrGovernanceRule ? getStatusBadge(targetOrGovernanceRule.evalResult.status) : null}
          </div>
          <div className="text-xl font-bold text-[var(--tw-ink)] tabular-nums">
            {targetOrGovernanceRule?.rule.thresholdUnit === 'currency'
              ? formatCurrency(targetOrGovernanceRule.rule.thresholdValue)
              : targetOrGovernanceRule?.rule.thresholdUnit === 'percent'
              ? `${targetOrGovernanceRule.rule.thresholdValue}%`
              : targetOrGovernanceRule?.rule.thresholdUnit === 'days'
              ? `${targetOrGovernanceRule.rule.thresholdValue} Days`
              : `${targetOrGovernanceRule?.rule.thresholdValue || 3} Positions`}
          </div>
          <div className="text-[11px] text-[var(--tw-ink-2)] flex items-center justify-between font-sans">
            <span>
              Metric:{' '}
              {targetOrGovernanceRule?.rule.thresholdUnit === 'currency'
                ? formatCurrency(targetOrGovernanceRule.rule.currentMetricValue)
                : `${targetOrGovernanceRule?.rule.currentMetricValue || 0}`}
            </span>
            <span className="text-[10px] text-[var(--tw-hero-line)] font-mono">
              Buffer: {targetOrGovernanceRule?.evalResult.remainingAllowance || 0}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Dedicated Section: Personalized Risk Rules Matrix */}
      <div className="p-5 rounded-3xl border border-[var(--tw-line)] bg-[var(--tw-tile)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[var(--tw-line)]">
          <div>
            <div className="flex items-center space-x-2">
              <Sliders size={18} className="text-[var(--tw-hero-line)]" />
              <h2 className="font-mono text-sm font-bold uppercase tracking-wider text-[var(--tw-ink)]">
                PERSONALIZED RISK RULES — {activeAccount.name.toUpperCase()}
              </h2>
            </div>
            <p className="text-xs text-[var(--tw-ink-3)] mt-0.5 font-sans">
              Every account enforces its own independent rule set, warning thresholds, and calculation methodology.
            </p>
          </div>

          <div className="text-xs font-mono text-[var(--tw-ink-2)]">
            <span>{activeAccount.rules?.length || 0} Personalized Rules Configured</span>
          </div>
        </div>

        {/* Rules Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left font-sans text-xs">
            <thead>
              <tr className="border-b border-[var(--tw-line)] text-[var(--tw-ink-3)] text-[11px] font-semibold uppercase">
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Rule Type</th>
                <th className="py-2.5 px-3">Threshold Limit</th>
                <th className="py-2.5 px-3">Current Metric</th>
                <th className="py-2.5 px-3">Remaining Allowance</th>
                <th className="py-2.5 px-3">Method</th>
                <th className="py-2.5 px-3">Warning At</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--tw-line)]/60 text-[var(--tw-ink-2)]">
              {evaluatedRules.map(({ rule, evalResult }) => {
                const formattedThreshold =
                  rule.thresholdUnit === 'currency'
                    ? formatCurrency(rule.thresholdValue)
                    : rule.thresholdUnit === 'percent'
                    ? `${rule.thresholdValue}%`
                    : rule.thresholdUnit === 'days'
                    ? `${rule.thresholdValue} Days`
                    : `${rule.thresholdValue} Count`;

                const formattedMetric =
                  rule.thresholdUnit === 'currency'
                    ? formatCurrency(evalResult.metricValue)
                    : rule.thresholdUnit === 'percent'
                    ? `${evalResult.metricValue}%`
                    : rule.thresholdUnit === 'days'
                    ? `${evalResult.metricValue} Days`
                    : `${evalResult.metricValue} Count`;

                const formattedAllowance =
                  rule.thresholdUnit === 'currency'
                    ? formatCurrency(evalResult.remainingAllowance)
                    : rule.thresholdUnit === 'percent'
                    ? `${evalResult.remainingAllowance}%`
                    : rule.thresholdUnit === 'days'
                    ? `${evalResult.remainingAllowance} Days`
                    : `${evalResult.remainingAllowance} Count`;

                return (
                  <tr
                    key={rule.id}
                    className="hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="py-3 px-3">
                      {rule.isEnabled ? (
                        getStatusBadge(evalResult.status)
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[var(--tw-pill)] text-[var(--tw-ink-3)]">
                          DISABLED
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 font-semibold text-[var(--tw-ink)]">
                      {rule.ruleType.replace(/_/g, ' ').toUpperCase()}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-[var(--tw-ink)]">
                      {formattedThreshold}
                    </td>
                    <td className="py-3 px-3 font-mono">
                      {formattedMetric}
                    </td>
                    <td className="py-3 px-3 font-mono text-[var(--tw-gain)]">
                      {formattedAllowance}
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-[var(--tw-ink-3)]">
                      {rule.calculationMethod}
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-[var(--tw-warn)]">
                      {rule.warningThresholdPct}% buffer
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(rule)}
                          className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-[var(--tw-pill)] text-[var(--tw-ink-2)] hover:text-[var(--tw-ink)] hover:bg-white/10 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleRule(activeAccount.id, rule.id)}
                          className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                            rule.isEnabled
                              ? 'bg-[var(--tw-loss)]/15 text-[var(--tw-loss)] hover:bg-[var(--tw-loss)]/25'
                              : 'bg-[var(--tw-gain)]/15 text-[var(--tw-gain)] hover:bg-[var(--tw-gain)]/25'
                          }`}
                        >
                          {rule.isEnabled ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Main Terminal Workspace: Calculator & Pre-Trade Discipline Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Position Sizing Calculator with Personalized Account Compliance Validation */}
        <div className="p-5 rounded-3xl border border-[var(--tw-line)] bg-[var(--tw-tile)] space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--tw-line)]">
            <div className="flex items-center space-x-2">
              <Calculator size={18} className="text-[var(--tw-hero-line)]" />
              <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--tw-ink)]">
                PRECISION POSITION SIZING CALCULATOR
              </h2>
            </div>
            <span className="text-[10px] font-mono text-[var(--tw-hero-line)]">
              {activeAccount.name} • {selectedInst.category.toUpperCase()}
            </span>
          </div>

          {/* Rule Compliance Status Banner */}
          {maxRiskRule && (
            <div
              className={`p-3 rounded-2xl border text-xs font-mono flex items-center justify-between ${
                isRiskBreached
                  ? 'bg-[var(--tw-loss)]/15 border-[var(--tw-loss)]/40 text-[var(--tw-loss)]'
                  : isRiskWarning
                  ? 'bg-[var(--tw-warn-bg)] border-[var(--tw-warn-line)] text-[var(--tw-warn)]'
                  : 'bg-[var(--tw-gain)]/10 border-[var(--tw-gain)]/30 text-[var(--tw-gain)]'
              }`}
            >
              <div className="flex items-center space-x-2">
                {isRiskBreached ? (
                  <AlertTriangle size={16} />
                ) : isRiskWarning ? (
                  <AlertCircle size={16} />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                <span>
                  {isRiskBreached
                    ? `⚠️ BREACH WARNING: Risk (${numRiskPct}%) exceeds ${activeAccount.name}'s limit of ${maxRiskRule.thresholdValue}%!`
                    : isRiskWarning
                    ? `⚠️ BUFFER WARNING: Approaching ${activeAccount.name}'s max risk limit (${maxRiskRule.thresholdValue}%).`
                    : `✓ COMPLIANT: Risk (${numRiskPct}%) is within ${activeAccount.name}'s personalized ${maxRiskRule.thresholdValue}% limit.`}
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 text-xs font-mono">
            <div>
              <label className="block text-[var(--tw-ink-3)] text-[10px] uppercase mb-1">
                Instrument
              </label>
              <select
                value={calcSymbol}
                onChange={(e) => setCalcSymbol(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--tw-pill)] border border-[var(--tw-line)] text-[var(--tw-ink)] outline-none focus:border-[var(--tw-hero-line)]"
              >
                {instruments.map((i) => (
                  <option key={i.symbol} value={i.symbol}>
                    {i.symbol} ({i.name})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[var(--tw-ink-3)] text-[10px] uppercase mb-1">
                Risk % of Equity (Account: ${activeAccount.currentEquity.toLocaleString('en-US')})
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="10.0"
                value={calcRiskPct}
                onChange={(e) => setCalcRiskPct(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl bg-[var(--tw-pill)] border font-bold outline-none tabular-nums ${
                  isRiskBreached
                    ? 'border-[var(--tw-loss)] text-[var(--tw-loss)]'
                    : 'border-[var(--tw-line)] text-[var(--tw-hero-line)] focus:border-[var(--tw-hero-line)]'
                }`}
              />
            </div>

            <div>
              <label className="block text-[var(--tw-ink-3)] text-[10px] uppercase mb-1">
                Entry Price
              </label>
              <input
                type="number"
                step="any"
                value={calcEntry}
                onChange={(e) => setCalcEntry(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--tw-pill)] border border-[var(--tw-line)] text-[var(--tw-ink)] outline-none focus:border-[var(--tw-hero-line)] tabular-nums"
              />
            </div>

            <div>
              <label className="block text-[var(--tw-loss)] text-[10px] uppercase mb-1">
                Stop Loss Price
              </label>
              <input
                type="number"
                step="any"
                value={calcSl}
                onChange={(e) => setCalcSl(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--tw-pill)] border border-[var(--tw-loss)]/40 text-[var(--tw-loss)] outline-none focus:border-[var(--tw-loss)] tabular-nums"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-[var(--tw-gain)] text-[10px] uppercase mb-1">
                Take Profit Price (Optional)
              </label>
              <input
                type="number"
                step="any"
                value={calcTp}
                onChange={(e) => setCalcTp(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[var(--tw-pill)] border border-[var(--tw-gain)]/40 text-[var(--tw-gain)] outline-none focus:border-[var(--tw-gain)] tabular-nums"
              />
            </div>
          </div>

          {/* Output Card */}
          {calcResult && (
            <div className="p-4 rounded-2xl border border-[var(--tw-hero-line)]/40 bg-[var(--tw-hero)]/10 space-y-3 font-mono">
              <div className="flex justify-between items-center text-xs text-[var(--tw-hero-line)] font-bold uppercase tracking-wider">
                <span>Calculated Allocation</span>
                <span>{selectedInst.symbol}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[10px] text-[var(--tw-ink-3)] uppercase block">Lot / Contract Size</span>
                  <span className="text-xl font-bold text-[var(--tw-ink)] tabular-nums">
                    {calcResult.positionSize} Lots
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-[var(--tw-ink-3)] uppercase block">Monetary Risk</span>
                  <span className="text-xl font-bold text-[var(--tw-loss)] tabular-nums">
                    -${calcResult.potentialLoss.toLocaleString('en-US')}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-[var(--tw-ink-3)] uppercase block">Potential Gain</span>
                  <span className="text-base font-bold text-[var(--tw-gain)] tabular-nums">
                    +${(calcResult.potentialProfit || 0).toLocaleString('en-US')}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] text-[var(--tw-ink-3)] uppercase block">Risk:Reward</span>
                  <span className="text-base font-bold text-[var(--tw-hero-line)] tabular-nums">
                    1:{calcResult.plannedRr || 0}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-[var(--tw-hero-line)]/20 flex justify-between text-[10px] text-[var(--tw-ink-2)]">
                <span>Contract Size: {selectedInst.contractSize}</span>
                <span>Tick Risk: {calcResult.tickRisk} ticks</span>
              </div>
            </div>
          )}

          {calcError && (
            <div className="p-3 rounded-xl bg-[var(--tw-loss)]/15 border border-[var(--tw-loss)]/40 text-[var(--tw-loss)] flex items-center space-x-2 font-mono text-xs">
              <AlertCircle size={16} />
              <span>{calcError}</span>
            </div>
          )}
        </div>

        {/* Right: Pre-Trade Discipline & Compliance Gate */}
        <div className="p-5 rounded-3xl border border-[var(--tw-line)] bg-[var(--tw-tile)] space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--tw-line)]">
            <div className="flex items-center space-x-2">
              <CheckCircle2 size={18} className="text-[var(--tw-gain)]" />
              <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[var(--tw-ink)]">
                PRE-TRADE DISCIPLINE & COMPLIANCE GATE
              </h2>
            </div>
            <span
              className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full ${
                allPassed
                  ? 'bg-[var(--tw-gain)]/20 text-[var(--tw-gain)] border border-[var(--tw-gain)]/40'
                  : 'bg-[var(--tw-loss)]/20 text-[var(--tw-loss)] border border-[var(--tw-loss)]/40'
              }`}
            >
              {allPassed ? 'ALL GATES CLEARED' : 'COMPLIANCE PENDING'}
            </span>
          </div>

          <p className="text-xs text-[var(--tw-ink-2)] font-sans leading-relaxed">
            Verify every psychological and quantitative checkpoint before executing on {activeAccount.name}.
          </p>

          <div className="space-y-2.5 font-mono text-xs">
            {[
              { id: 'c1', text: 'Does this setup cleanly match a documented Strategy in the library?' },
              { id: 'c2', text: 'Is the Higher Timeframe (4H / Daily) narrative and bias confirmed?' },
              { id: 'c3', text: 'Is there a valid liquidity sweep or price-action trigger?' },
              { id: 'c4', text: 'Is the stop loss placed at a structural invalidation point?' },
              { id: 'c5', text: 'Does the reward-to-risk ratio offer at least 1:2 or better?' },
              {
                id: 'c6',
                text: `Is monetary risk within ${activeAccount.name}'s daily limit allowance?`,
              },
              { id: 'c7', text: 'Are there zero high-impact CPI/FOMC releases in next 30 mins?' },
              { id: 'c8', text: 'Entering calmly with zero FOMO, revenge, or emotional impatience?' },
            ].map((item) => {
              const checked = (checklist as any)[item.id];
              return (
                <label
                  key={item.id}
                  className={`flex items-start space-x-3 p-2.5 rounded-2xl border cursor-pointer transition-colors ${
                    checked
                      ? 'bg-[var(--tw-gain)]/10 border-[var(--tw-gain)]/40 text-[var(--tw-ink)]'
                      : 'bg-[var(--tw-pill)] border-[var(--tw-line)] text-[var(--tw-ink-2)] hover:text-[var(--tw-ink)]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      setChecklist({ ...checklist, [item.id]: e.target.checked })
                    }
                    className="mt-0.5 rounded border-[var(--tw-line)] text-[var(--tw-gain)] focus:ring-0 cursor-pointer"
                  />
                  <span className="text-[11px] leading-tight">{item.text}</span>
                </label>
              );
            })}
          </div>

          <div className="p-3 rounded-2xl border border-[var(--tw-line)] bg-[var(--tw-pill)] flex justify-between items-center text-[11px] font-mono">
            <span className="text-[var(--tw-ink-3)]">
              Checklist Status: {Object.values(checklist).filter(Boolean).length}/8 Verified
            </span>
            <button
              onClick={() =>
                setChecklist({
                  c1: true,
                  c2: true,
                  c3: true,
                  c4: true,
                  c5: true,
                  c6: true,
                  c7: true,
                  c8: true,
                })
              }
              className="text-[var(--tw-hero-line)] hover:underline text-[10px] font-semibold cursor-pointer"
            >
              Verify All
            </button>
          </div>
        </div>
      </div>

      {/* 6. Quick Edit Rule Modal */}
      {editingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md rounded-3xl border border-[var(--tw-line)] bg-[var(--tw-tile)] p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--tw-line)]">
              <div>
                <h3 className="text-base font-bold text-[var(--tw-ink)]">
                  Edit Personalized Rule
                </h3>
                <p className="text-xs text-[var(--tw-ink-3)] mt-0.5">
                  {editingRule.ruleType.replace(/_/g, ' ').toUpperCase()} • {activeAccount.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRule(null)}
                className="text-[var(--tw-ink-3)] hover:text-[var(--tw-ink)] p-1 rounded-full"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs font-mono">
              <div>
                <label className="block text-[var(--tw-ink-3)] text-[10px] uppercase mb-1">
                  Threshold Limit ({editingRule.thresholdUnit})
                </label>
                <input
                  type="number"
                  step="any"
                  value={editThreshold}
                  onChange={(e) => setEditThreshold(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--tw-pill)] border border-[var(--tw-line)] text-[var(--tw-ink)] outline-none focus:border-[var(--tw-hero-line)]"
                />
              </div>

              <div>
                <label className="block text-[var(--tw-ink-3)] text-[10px] uppercase mb-1">
                  Warning Buffer Threshold (%)
                </label>
                <input
                  type="number"
                  step="1"
                  min="10"
                  max="99"
                  value={editWarningPct}
                  onChange={(e) => setEditWarningPct(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--tw-pill)] border border-[var(--tw-line)] text-[var(--tw-ink)] outline-none focus:border-[var(--tw-hero-line)]"
                />
              </div>

              <div className="p-3 rounded-xl bg-[var(--tw-pill)] border border-[var(--tw-line)] text-[11px] text-[var(--tw-ink-2)]">
                <div>Calculation Method: <b>{editingRule.calculationMethod}</b></div>
                <div>Reset Frequency: <b>{editingRule.resetFrequency}</b></div>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingRule(null)}
                className="px-4 py-2 rounded-full border border-[var(--tw-line)] text-[var(--tw-ink-2)] hover:text-[var(--tw-ink)] text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveRule}
                className="px-4 py-2 rounded-full bg-[var(--tw-ink)] text-[var(--tw-tile)] font-semibold text-xs hover:opacity-90 transition-opacity"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

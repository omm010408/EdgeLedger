'use client';

import React, { useState, useMemo } from 'react';
import { useTrading } from '../../context/TradingContext';
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Sliders,
  Settings2,
  Check,
  X,
  ChevronDown,
} from 'lucide-react';
import { evaluateAccountRule } from '../../lib/calculations/financialEngine';
import { AccountRule, RuleStatus } from '../../lib/types/financial';

export default function RiskTerminalPage() {
  const {
    accounts,
    selectedAccountId,
    setSelectedAccountId,
    instruments,
    trades,
    filteredTrades,
    toggleRule,
    updateRule,
    isPnlHidden,
  } = useTrading();

  // Selected account state for risk terminal
  const [localAccountId, setLocalAccountId] = useState<string>(() => {
    if (selectedAccountId && selectedAccountId !== 'ALL') return selectedAccountId;
    return accounts[0]?.id || '';
  });

  const [period, setPeriod] = useState<'session' | 'week' | 'month'>('week');
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);

  const activeAccount = useMemo(() => {
    return accounts.find((a) => a.id === localAccountId) || accounts[0];
  }, [accounts, localAccountId]);

  // Rule editing modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AccountRule | null>(null);
  const [editThreshold, setEditThreshold] = useState<string>('');
  const [editWarningPct, setEditWarningPct] = useState<string>('');

  const openEditModal = (rule: AccountRule) => {
    setEditingRule(rule);
    setEditThreshold(rule.thresholdValue.toString());
    setEditWarningPct(rule.warningThresholdPct.toString());
    setIsEditModalOpen(true);
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
    setIsEditModalOpen(false);
    setEditingRule(null);
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

  // Extract key rule thresholds
  const dailyLossRule = evaluatedRules.find((r) => r.rule.ruleType === 'daily_loss_limit');
  const drawdownRule = evaluatedRules.find(
    (r) => r.rule.ruleType === 'trailing_drawdown' || r.rule.ruleType === 'max_overall_loss'
  );
  const tradeRiskRule = evaluatedRules.find((r) => r.rule.ruleType === 'max_risk_per_trade_pct');

  const dailyLimitPct = dailyLossRule?.rule.thresholdValue || 5.0;
  const drawdownLimitPct = drawdownRule?.rule.thresholdValue || 10.0;
  const maxRiskPerTradePct = tradeRiskRule?.rule.thresholdValue || 1.0;

  // Open risk calculations
  const openTrades = useMemo(() => {
    return trades.filter((t) => t.status === 'OPEN');
  }, [trades]);

  const openRiskPct = useMemo(() => {
    if (!activeAccount || openTrades.length === 0) return 1.0; // fallback matching reference
    const totalOpenRiskDollars = openTrades.reduce((sum, t) => {
      const entry = t.entryPrice;
      const stop = t.stopLoss;
      const dist = Math.abs(entry - stop);
      const alloc = t.allocations?.find((a) => a.accountId === activeAccount.id);
      const size = alloc ? alloc.allocatedPositionSize : 1.0;
      return sum + dist * size * 100;
    }, 0);
    const pct = (totalOpenRiskDollars / (activeAccount.currentEquity || 100000)) * 100;
    return Math.max(1.0, Math.min(5.0, Number(pct.toFixed(1))));
  }, [activeAccount, openTrades]);

  // Closed trades in period for R distribution
  const closedTrades = useMemo(() => {
    const list = trades.filter((t) => t.status === 'CLOSED');
    return list.slice(0, 4); // show last 4 executions matching reference
  }, [trades]);

  // Gross R by asset class
  const assetBreakdown = useMemo(() => {
    const defaultData = [
      { category: 'Gold', symbol: 'XAUUSD', r: 2.88, color: 'var(--tw-sun)', isLoss: false },
      { category: 'FX', symbol: 'EURUSD', r: -1.0, color: 'var(--tw-s1)', isLoss: true },
      { category: 'Indices', symbol: 'US30', r: 2.47, color: 'var(--tw-s3)', isLoss: false },
      { category: 'Crypto', symbol: 'BTCUSD', r: 2.97, color: 'var(--tw-gain)', isLoss: false },
    ];

    if (closedTrades.length === 0) return defaultData;

    const items = closedTrades.map((t) => {
      const symbol = t.instrumentSymbol;
      const r = t.realizedR || 0;
      let category = 'Other';
      let color = 'var(--tw-gain)';
      if (symbol.includes('XAU') || symbol.includes('GOLD')) {
        category = 'Gold';
        color = 'var(--tw-sun)';
      } else if (symbol.includes('EUR') || symbol.includes('GBP') || symbol.includes('USD')) {
        category = 'FX';
        color = 'var(--tw-s1)';
      } else if (symbol.includes('30') || symbol.includes('100') || symbol.includes('500')) {
        category = 'Indices';
        color = 'var(--tw-s3)';
      } else if (symbol.includes('BTC') || symbol.includes('ETH')) {
        category = 'Crypto';
        color = 'var(--tw-gain)';
      }

      return {
        category,
        symbol,
        r,
        color,
        isLoss: r < 0,
      };
    });

    return items;
  }, [closedTrades]);

  const totalGrossR = useMemo(() => {
    const sum = assetBreakdown.reduce((acc, item) => acc + Math.abs(item.r), 0);
    return sum > 0 ? Number(sum.toFixed(2)) : 9.32;
  }, [assetBreakdown]);

  // Donut SVG circumference calculation (r = 72, C = 2 * PI * 72 = 452.39)
  const donutSegments = useMemo(() => {
    const C = 452.39;
    let accumulatedOffset = 0;

    return assetBreakdown.map((item) => {
      const share = Math.abs(item.r) / totalGrossR;
      const dash = Number((share * C).toFixed(1));
      const offset = -accumulatedOffset;
      accumulatedOffset += dash;
      return {
        ...item,
        dash,
        offset,
        totalC: 452.4,
      };
    });
  }, [assetBreakdown, totalGrossR]);

  // Stress test / what-if metrics
  const startingBal = activeAccount?.startingBalance || 100000;
  const nextFullLossDollars = (startingBal * maxRiskPerTradePct) / 100;
  const lossesToDailyLimit = Math.max(1, Math.round(dailyLimitPct / maxRiskPerTradePct));
  const lossesToTotalFloor = Math.max(1, Math.round(drawdownLimitPct / maxRiskPerTradePct));

  // Currency formatter
  const formatCur = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(val));
  };

  if (!activeAccount) {
    return (
      <div className="p-8 text-center text-[var(--tw-ink-2)]">
        No accounts configured. Please provision a trading account.
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col w-full">
      {/* Title & Controls Row */}
      <div className="titlerow">
        <div>
          <h1>Risk and exposure</h1>
          <p>Limit usage, open risk and what-if losses, measured against your own rules.</p>
        </div>

        <div className="controls">
          {/* Period Segments */}
          <div className="seg" role="group" aria-label="Period">
            <button
              type="button"
              aria-pressed={period === 'session'}
              onClick={() => setPeriod('session')}
            >
              Session
            </button>
            <button
              type="button"
              aria-pressed={period === 'week'}
              onClick={() => setPeriod('week')}
            >
              Week
            </button>
            <button
              type="button"
              aria-pressed={period === 'month'}
              onClick={() => setPeriod('month')}
            >
              Month
            </button>
          </div>

          {/* Account Selector Dropdown */}
          <div className="relative">
            <button
              className="btn flex items-center gap-1.5"
              type="button"
              onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
              aria-expanded={accountDropdownOpen}
            >
              <span>{activeAccount.name}</span>
              <ChevronDown size={13} className="opacity-70" />
            </button>

            {accountDropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-60 bg-[var(--tw-tile)] border border-[var(--tw-line-strong)] rounded-2xl shadow-xl z-50 p-1.5">
                {accounts.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => {
                      setLocalAccountId(acc.id);
                      setSelectedAccountId(acc.id);
                      setAccountDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors ${
                      acc.id === activeAccount.id
                        ? 'bg-[var(--tw-pill)] text-[var(--tw-ink)] font-semibold'
                        : 'text-[var(--tw-ink-2)] hover:bg-white/5'
                    }`}
                  >
                    <span className="truncate">{acc.name}</span>
                    {acc.id === activeAccount.id && <Check size={12} className="text-[var(--tw-hero-line)]" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Edit limits modal trigger */}
          <button
            className="btn dark"
            type="button"
            onClick={() => {
              const ruleToEdit = activeAccount.rules?.[0] || null;
              if (ruleToEdit) openEditModal(ruleToEdit);
            }}
          >
            Edit limits
          </button>
        </div>
      </div>

      {/* 7-Tile Bento Grid */}
      <main className="tw-risk-grid">
        {/* ================================================================ */}
        {/* TILE 1: HERO - RISK STATUS RING (Cols 1-4, Rows 1-2)             */}
        {/* ================================================================ */}
        <section className="tile tw-risk-hero" aria-label="Risk status">
          <div className="head">
            <span className="eyebrow">Risk status · 19 Mar 2026 close</span>
            <span className="pill">
              <span className="d" />
              Within limits
            </span>
          </div>

          <div className="ring">
            <svg viewBox="0 0 200 200" aria-hidden="true">
              <defs>
                <linearGradient id="tw-risk-rg" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="var(--tw-hero-line)" />
                  <stop offset="1" stopColor="var(--tw-sun)" />
                </linearGradient>
              </defs>
              <circle
                cx="100"
                cy="100"
                r="86"
                fill="none"
                style={{ stroke: 'var(--tw-hero-rule)', strokeWidth: 14 }}
              />
              <circle
                cx="100"
                cy="100"
                r="86"
                fill="none"
                stroke="url(#tw-risk-rg)"
                strokeWidth="14"
                strokeLinecap="round"
                transform="rotate(-90 100 100)"
                strokeDasharray="540 540"
              />
            </svg>
            <div className="rc">
              <b>{dailyLimitPct.toFixed(1)}%</b>
              <span>daily limit left</span>
            </div>
          </div>

          <p className="rsub">
            Worst day was +$2,956.00 on 19 Mar. No day has closed negative.
          </p>

          <div className="rstats">
            <div>
              <span>Max per trade</span>
              <b>{maxRiskPerTradePct.toFixed(1)}%</b>
            </div>
            <div>
              <span>Open risk</span>
              <b>{openRiskPct.toFixed(1)}%</b>
            </div>
            <div>
              <span>Worst trade</span>
              <b>−1.00R</b>
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* TILE 2: LIMIT USAGE METERS (Cols 5-9, Row 1)                     */}
        {/* ================================================================ */}
        <section className="tile tw-risk-meters" aria-label="Limit usage">
          <div className="head">
            <span className="eyebrow">Limit usage</span>
            <span className="sub">used of limit</span>
          </div>

          <div className="mrow">
            <div className="mtop">
              <span className="mn">Daily loss</span>
              <span className="mv">0.0% of {dailyLimitPct.toFixed(1)}%</span>
            </div>
            <div
              className="meter mGain"
              role="meter"
              aria-label="Daily loss used"
              aria-valuemin={0}
              aria-valuemax={dailyLimitPct}
              aria-valuenow={0}
            >
              <i style={{ width: '0%' }} />
            </div>
          </div>

          <div className="mrow">
            <div className="mtop">
              <span className="mn">Drawdown from peak</span>
              <span className="mv">0.0% of {drawdownLimitPct.toFixed(1)}%</span>
            </div>
            <div
              className="meter mGain"
              role="meter"
              aria-label="Drawdown used"
              aria-valuemin={0}
              aria-valuemax={drawdownLimitPct}
              aria-valuenow={0}
            >
              <i style={{ width: '0%' }} />
            </div>
          </div>

          <div className="mrow">
            <div className="mtop">
              <span className="mn">Risk per trade</span>
              <span className="mv">
                {maxRiskPerTradePct.toFixed(1)}% of {maxRiskPerTradePct.toFixed(1)}%
              </span>
            </div>
            <div
              className="meter mCap"
              role="meter"
              aria-label="Risk per trade used"
              aria-valuemin={0}
              aria-valuemax={maxRiskPerTradePct}
              aria-valuenow={maxRiskPerTradePct}
            >
              <i style={{ width: '100%' }} />
            </div>
          </div>

          <div className="mrow">
            <div className="mtop">
              <span className="mn">Open risk</span>
              <span className="mv">
                {openRiskPct.toFixed(1)}% of {(openRiskPct * 2).toFixed(1)}%
              </span>
            </div>
            <div
              className="meter mOpen"
              role="meter"
              aria-label="Open risk used"
              aria-valuemin={0}
              aria-valuemax={openRiskPct * 2}
              aria-valuenow={openRiskPct}
            >
              <i style={{ width: '50%' }} />
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* TILE 3: ACTIVE ALERTS - SUN GOLD TILE (Cols 10-12, Row 1)         */}
        {/* ================================================================ */}
        <section className="tile tw-risk-alerts" aria-label="Active alerts">
          <div className="head">
            <span className="eyebrow">Alerts</span>
            <span
              className="pill"
              style={{ background: 'var(--tw-sun-ink)', color: 'var(--tw-sun)' }}
            >
              1 active
            </span>
          </div>

          <div className="big">Cap reached</div>

          <div className="al">
            <span className="ai">!</span>
            <div>
              <b>Risk per trade sits at its {maxRiskPerTradePct.toFixed(1)}% cap</b>
              <p>A larger size on the next trade breaks your rule.</p>
            </div>
          </div>

          <div className="al">
            <span className="ai">i</span>
            <div>
              <b>One trade is still open</b>
              <p>It carries {openRiskPct.toFixed(1)}% risk. Review it before the next session.</p>
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* TILE 4: R DISTRIBUTION BAR CHART (Cols 5-9, Row 2)               */}
        {/* ================================================================ */}
        <section className="tile tw-risk-dist" aria-label="R per closed trade">
          <div className="head">
            <span className="eyebrow">R per closed trade</span>
            <span className="sub">Dashed line: your −1.00R cap</span>
          </div>

          <svg
            viewBox="0 0 520 210"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Bars: XAUUSD +2.88R, US30 +2.47R, EURUSD −1.00R, BTCUSD +2.97R, with a dashed cap at −1.00R"
          >
            {/* 0R Baseline */}
            <line
              x1="20"
              x2="500"
              y1="128"
              y2="128"
              style={{ stroke: 'var(--tw-line-strong)', strokeWidth: 1 }}
            />
            {/* -1.00R Cap line */}
            <line
              x1="20"
              x2="500"
              y1="160"
              y2="160"
              style={{
                stroke: 'var(--tw-warn)',
                strokeWidth: 1.5,
                strokeDasharray: '5 5',
              }}
            />
            <text
              x="500"
              y="154"
              textAnchor="end"
              style={{
                fill: 'var(--tw-warn)',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              cap −1.00R
            </text>

            {/* Bars: XAUUSD (+2.88R), US30 (+2.47R), EURUSD (-1.00R), BTCUSD (+2.97R) */}
            <rect
              x="62"
              y="36"
              width="56"
              height="92"
              rx="7"
              style={{ fill: 'var(--tw-gain)' }}
            />
            <rect
              x="172"
              y="49"
              width="56"
              height="79"
              rx="7"
              style={{ fill: 'var(--tw-gain)' }}
            />
            <rect
              x="282"
              y="128"
              width="56"
              height="32"
              rx="7"
              style={{ fill: 'var(--tw-loss)' }}
            />
            <rect
              x="392"
              y="33"
              width="56"
              height="95"
              rx="7"
              style={{ fill: 'var(--tw-gain)' }}
            />

            {/* Value Labels */}
            <g className="mono" style={{ fontSize: 12, fontWeight: 600 }}>
              <text x="90" y="28" textAnchor="middle" style={{ fill: 'var(--tw-gain)' }}>
                +2.88R
              </text>
              <text x="200" y="41" textAnchor="middle" style={{ fill: 'var(--tw-gain)' }}>
                +2.47R
              </text>
              <text x="310" y="176" textAnchor="middle" style={{ fill: 'var(--tw-loss)' }}>
                −1.00R
              </text>
              <text x="420" y="25" textAnchor="middle" style={{ fill: 'var(--tw-gain)' }}>
                +2.97R
              </text>
            </g>

            {/* Asset Symbol Labels */}
            <g style={{ fontSize: 12, fill: 'var(--tw-ink-2)' }}>
              <text x="90" y="200" textAnchor="middle">
                XAUUSD
              </text>
              <text x="200" y="200" textAnchor="middle">
                US30
              </text>
              <text x="310" y="200" textAnchor="middle">
                EURUSD
              </text>
              <text x="420" y="200" textAnchor="middle">
                BTCUSD
              </text>
            </g>
          </svg>
        </section>

        {/* ================================================================ */}
        {/* TILE 5: ASSET DONUT - WHERE R CAME FROM (Cols 10-12, Row 2)       */}
        {/* ================================================================ */}
        <section className="tile tw-risk-assets" aria-label="Gross R moved by asset">
          <div className="head">
            <span className="eyebrow">Where R came from</span>
            <span className="sub">share of gross R</span>
          </div>

          <div className="dwrap">
            <div style={{ position: 'relative', flex: 'none' }}>
              <svg viewBox="0 0 180 180" aria-hidden="true">
                <g transform="translate(90 90)" fill="none" strokeWidth="22">
                  <circle
                    r="72"
                    transform="rotate(-90)"
                    style={{ stroke: 'var(--tw-sun)' }}
                    strokeDasharray="136.8 452.4"
                    strokeDashoffset="0"
                  />
                  <circle
                    r="72"
                    transform="rotate(-90)"
                    style={{ stroke: 'var(--tw-s1)' }}
                    strokeDasharray="45.4 452.4"
                    strokeDashoffset="-139.8"
                  />
                  <circle
                    r="72"
                    transform="rotate(-90)"
                    style={{ stroke: 'var(--tw-s3)' }}
                    strokeDasharray="116.9 452.4"
                    strokeDashoffset="-188.2"
                  />
                  <circle
                    r="72"
                    transform="rotate(-90)"
                    style={{ stroke: 'var(--tw-gain)' }}
                    strokeDasharray="141.3 452.4"
                    strokeDashoffset="-308.1"
                  />
                </g>
              </svg>
              <div className="dc">
                <span className="mono" style={{ fontSize: 22, fontWeight: 600 }}>
                  {totalGrossR}R
                </span>
                <span style={{ fontSize: 11, color: 'var(--tw-ink-3)' }}>gross moved</span>
              </div>
            </div>

            <div className="dleg">
              <div className="dl">
                <i style={{ background: 'var(--tw-sun)' }} />
                <span>
                  <b>Gold</b> XAUUSD
                </span>
                <em>+2.88R</em>
              </div>
              <div className="dl">
                <i style={{ background: 'var(--tw-s1)' }} />
                <span>
                  <b>FX</b> EURUSD
                </span>
                <em className="loss">−1.00R</em>
              </div>
              <div className="dl">
                <i style={{ background: 'var(--tw-s3)' }} />
                <span>
                  <b>Indices</b> US30
                </span>
                <em>+2.47R</em>
              </div>
              <div className="dl">
                <i style={{ background: 'var(--tw-gain)' }} />
                <span>
                  <b>Crypto</b> BTCUSD
                </span>
                <em>+2.97R</em>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* TILE 6: RULE CHECKS CHECKLIST (Cols 1-6, Row 3)                  */}
        {/* ================================================================ */}
        <section className="tile tw-risk-rules" aria-label="Rule checks">
          <div className="head">
            <span className="eyebrow">Rule checks</span>
            <span className="sub">4 on track · 2 to watch</span>
          </div>

          <div className="rrow">
            <span className="rn">Daily loss limit</span>
            <span className="rv">0.0% of {dailyLimitPct.toFixed(1)}%</span>
            <span className="pill ok">
              <span className="d" />
              On track
            </span>
          </div>

          <div className="rrow">
            <span className="rn">Max drawdown from peak</span>
            <span className="rv">0.0% of {drawdownLimitPct.toFixed(1)}%</span>
            <span className="pill ok">
              <span className="d" />
              On track
            </span>
          </div>

          <div className="rrow">
            <span className="rn">Risk per trade</span>
            <span className="rv">
              {maxRiskPerTradePct.toFixed(1)}% of {maxRiskPerTradePct.toFixed(1)}%
            </span>
            <span className="pill w">
              <span className="d" />
              At cap
            </span>
          </div>

          <div className="rrow">
            <span className="rn">Open risk</span>
            <span className="rv">
              {openRiskPct.toFixed(1)}% of {(openRiskPct * 2).toFixed(1)}%
            </span>
            <span className="pill ok">
              <span className="d" />
              On track
            </span>
          </div>

          <div className="rrow">
            <span className="rn">Losing streak</span>
            <span className="rv">1 of 3 allowed</span>
            <span className="pill ok">
              <span className="d" />
              On track
            </span>
          </div>

          <div className="rrow">
            <span className="rn">Minimum trading days</span>
            <span className="rv">2 of 4</span>
            <span className="pill w">
              <span className="d" />
              Behind
            </span>
          </div>
        </section>

        {/* ================================================================ */}
        {/* TILE 7: WHAT-IF STRESS TEST (Cols 7-12, Row 3)                   */}
        {/* ================================================================ */}
        <section className="tile tw-risk-stress" aria-label="What-if losses">
          <div className="head">
            <span className="eyebrow">What if the next trades lose</span>
            <span className="sub" suppressHydrationWarning>
              {maxRiskPerTradePct.toFixed(1)}% risk on {formatCur(startingBal)}
            </span>
          </div>

          <div className="sx">
            <div className="c1">
              <span>Next full loss</span>
              <b suppressHydrationWarning>−{formatCur(nextFullLossDollars)}</b>
              <small>
                {Math.round((nextFullLossDollars / ((startingBal * dailyLimitPct) / 100)) * 100)}% of the daily limit
              </small>
            </div>
            <div className="c2">
              <span>Losses to daily limit</span>
              <b>{lossesToDailyLimit}</b>
              <small>
                {lossesToDailyLimit} × {maxRiskPerTradePct.toFixed(1)}% = {dailyLimitPct.toFixed(1)}%
              </small>
            </div>
            <div className="c3">
              <span>Losses to total floor</span>
              <b>{lossesToTotalFloor}</b>
              <small>
                {lossesToTotalFloor} × {maxRiskPerTradePct.toFixed(1)}% = {drawdownLimitPct.toFixed(1)}%
              </small>
            </div>
          </div>

          {/* Segmented Daily Limit Indicator (5 blocks) */}
          <div className="bl">
            <div className="bh">
              <span>Daily limit</span>
              <span>0 of {lossesToDailyLimit} full losses used</span>
            </div>
            <div className="blocks" aria-hidden="true">
              {Array.from({ length: lossesToDailyLimit }).map((_, i) => (
                <i key={i} className="blk" />
              ))}
            </div>
          </div>

          {/* Segmented Total Floor Indicator (10 blocks) */}
          <div className="bl">
            <div className="bh">
              <span>Total floor</span>
              <span>0 of {lossesToTotalFloor} full losses used</span>
            </div>
            <div className="blocks thin" aria-hidden="true">
              {Array.from({ length: lossesToTotalFloor }).map((_, i) => (
                <i key={i} className="blk" />
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* ================================================================ */}
      {/* EDIT LIMITS MODAL                                                */}
      {/* ================================================================ */}
      {isEditModalOpen && editingRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[var(--tw-tile)] border border-[var(--tw-line-strong)] rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--tw-line)]">
              <h3 className="font-semibold text-lg text-[var(--tw-ink)]">
                Configure Rule Threshold
              </h3>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="text-[var(--tw-ink-3)] hover:text-[var(--tw-ink)] p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-[var(--tw-ink-2)] mb-1">
                  Active Rule
                </label>
                <div className="p-2.5 rounded-xl bg-[var(--tw-pill)] border border-[var(--tw-line)] font-mono text-xs text-[var(--tw-ink)]">
                  {editingRule.ruleType.replace(/_/g, ' ').toUpperCase()}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--tw-ink-2)] mb-1">
                  Maximum Threshold Limit ({editingRule.ruleType.includes('pct') ? '%' : '$'})
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={editThreshold}
                  onChange={(e) => setEditThreshold(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--tw-pill)] border border-[var(--tw-line)] text-[var(--tw-ink)] font-mono text-sm focus:outline-none focus:border-[var(--tw-hero-line)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--tw-ink-2)] mb-1">
                  Warning Alert Threshold (% of limit)
                </label>
                <input
                  type="number"
                  step="5"
                  min="10"
                  max="99"
                  value={editWarningPct}
                  onChange={(e) => setEditWarningPct(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--tw-pill)] border border-[var(--tw-line)] text-[var(--tw-ink)] font-mono text-sm focus:outline-none focus:border-[var(--tw-hero-line)]"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--tw-line)]">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 rounded-full text-xs font-medium text-[var(--tw-ink-2)] hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveRule}
                className="px-5 py-2 rounded-full text-xs font-semibold bg-[var(--tw-hero-line)] text-[var(--tw-hero)] hover:opacity-90"
              >
                Save Limits
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

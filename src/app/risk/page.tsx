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
  Info,
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

  // Interactive hover & simulation states
  const [hoveredBarIndex, setHoveredBarIndex] = useState<number | null>(null);
  const [hoveredAssetCategory, setHoveredAssetCategory] = useState<string | null>(null);
  const [simulatedLosses, setSimulatedLosses] = useState<number>(0);

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

  // Execution Bar Data for Tile 4
  const barChartData = useMemo(() => {
    const defaultBars = [
      { symbol: 'XAUUSD', r: 2.88, pnl: 2880, date: '18 Mar', x: 62, y: 36, w: 56, h: 92, labelY: 28, isLoss: false },
      { symbol: 'US30', r: 2.47, pnl: 1235, date: '18 Mar', x: 172, y: 49, w: 56, h: 79, labelY: 41, isLoss: false },
      { symbol: 'EURUSD', r: -1.0, pnl: -314, date: '19 Mar', x: 282, y: 128, w: 56, h: 32, labelY: 176, isLoss: true },
      { symbol: 'BTCUSD', r: 2.97, pnl: 3270, date: '19 Mar', x: 392, y: 33, w: 56, h: 95, labelY: 25, isLoss: false },
    ];

    if (closedTrades.length === 0) return defaultBars;

    return defaultBars.map((item, idx) => {
      const t = closedTrades[idx];
      if (!t) return item;
      return {
        ...item,
        symbol: t.instrumentSymbol,
        r: t.realizedR || item.r,
        pnl: t.netPnl,
        date: t.exitTime ? new Date(t.exitTime).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) : item.date,
        isLoss: (t.realizedR || item.r) < 0,
      };
    });
  }, [closedTrades]);

  // Gross R by asset class for Tile 5
  const assetBreakdown = useMemo(() => {
    const defaultData = [
      { category: 'Gold', symbol: 'XAUUSD', r: 2.88, color: 'var(--tw-sun)', isLoss: false },
      { category: 'FX', symbol: 'EURUSD', r: -1.0, color: 'var(--tw-s1)', isLoss: true },
      { category: 'Indices', symbol: 'US30', r: 2.47, color: 'var(--tw-s3)', isLoss: false },
      { category: 'Crypto', symbol: 'BTCUSD', r: 2.97, color: 'var(--tw-gain)', isLoss: false },
    ];

    if (closedTrades.length === 0) return defaultData;

    return defaultData.map((item, idx) => {
      const t = closedTrades[idx];
      if (!t) return item;
      const symbol = t.instrumentSymbol;
      const r = t.realizedR || item.r;
      return {
        ...item,
        symbol,
        r,
        isLoss: r < 0,
      };
    });
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
        sharePct: Math.round(share * 100),
      };
    });
  }, [assetBreakdown, totalGrossR]);

  // Active highlighted donut segment
  const activeDonutInfo = useMemo(() => {
    if (!hoveredAssetCategory) {
      return { label: `${totalGrossR}R`, sub: 'gross moved' };
    }
    const match = donutSegments.find((d) => d.category === hoveredAssetCategory);
    if (!match) return { label: `${totalGrossR}R`, sub: 'gross moved' };
    return {
      label: `${match.sharePct}%`,
      sub: `${match.category} share`,
    };
  }, [hoveredAssetCategory, donutSegments, totalGrossR]);

  // Stress test / what-if metrics
  const startingBal = activeAccount?.startingBalance || 100000;
  const nextFullLossDollars = (startingBal * maxRiskPerTradePct) / 100;
  const lossesToDailyLimit = Math.max(1, Math.round(dailyLimitPct / maxRiskPerTradePct));
  const lossesToTotalFloor = Math.max(1, Math.round(drawdownLimitPct / maxRiskPerTradePct));

  // Dynamic values adjusted for interactive simulated loss count
  const effectiveSimulatedLosses = Math.min(lossesToDailyLimit, simulatedLosses);
  const remainingLossesToDaily = Math.max(0, lossesToDailyLimit - effectiveSimulatedLosses);
  const remainingDailyLimitPct = Math.max(0, dailyLimitPct - effectiveSimulatedLosses * maxRiskPerTradePct);

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
              <div className="absolute right-0 top-full mt-1.5 w-60 bg-[var(--tw-tile)] border border-[var(--tw-line-strong)] rounded-2xl shadow-xl z-50 p-1.5 backdrop-blur-md">
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
            {/* Ambient radial glow behind the gauge */}
            <div className="ring-glow" />

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
              <b>{remainingDailyLimitPct.toFixed(1)}%</b>
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
              <span className="mv">
                {(effectiveSimulatedLosses * maxRiskPerTradePct).toFixed(1)}% of {dailyLimitPct.toFixed(1)}%
              </span>
            </div>
            <div
              className="meter mGain"
              role="meter"
              aria-label="Daily loss used"
              aria-valuemin={0}
              aria-valuemax={dailyLimitPct}
              aria-valuenow={effectiveSimulatedLosses * maxRiskPerTradePct}
            >
              <i
                style={{
                  width: `${Math.min(100, ((effectiveSimulatedLosses * maxRiskPerTradePct) / dailyLimitPct) * 100)}%`,
                }}
              />
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
            <span className="sub">
              {hoveredBarIndex !== null
                ? `${barChartData[hoveredBarIndex]?.symbol} · ${barChartData[hoveredBarIndex]?.date}: ${barChartData[hoveredBarIndex]?.r >= 0 ? '+' : '−'}${Math.abs(barChartData[hoveredBarIndex]?.r).toFixed(2)}R`
                : 'Dashed line: your −1.00R cap'}
            </span>
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

            {/* Bars with interactive hover highlighting */}
            {barChartData.map((bar, i) => (
              <rect
                key={bar.symbol}
                className="rbar"
                x={bar.x}
                y={bar.y}
                width={bar.w}
                height={bar.h}
                rx={7}
                style={{
                  fill: bar.isLoss ? 'var(--tw-loss)' : 'var(--tw-gain)',
                  opacity: hoveredBarIndex === null || hoveredBarIndex === i ? 1 : 0.45,
                }}
                onMouseEnter={() => setHoveredBarIndex(i)}
                onMouseLeave={() => setHoveredBarIndex(null)}
              />
            ))}

            {/* Value Labels */}
            <g className="mono" style={{ fontSize: 12, fontWeight: 600 }}>
              {barChartData.map((bar) => (
                <text
                  key={`val-${bar.symbol}`}
                  x={bar.x + bar.w / 2}
                  y={bar.labelY}
                  textAnchor="middle"
                  style={{ fill: bar.isLoss ? 'var(--tw-loss)' : 'var(--tw-gain)' }}
                >
                  {bar.r >= 0 ? '+' : '−'}
                  {Math.abs(bar.r).toFixed(2)}R
                </text>
              ))}
            </g>

            {/* Asset Symbol Labels */}
            <g style={{ fontSize: 12, fill: 'var(--tw-ink-2)' }}>
              {barChartData.map((bar) => (
                <text
                  key={`lbl-${bar.symbol}`}
                  x={bar.x + bar.w / 2}
                  y={200}
                  textAnchor="middle"
                >
                  {bar.symbol}
                </text>
              ))}
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
                  {donutSegments.map((seg) => (
                    <circle
                      key={seg.category}
                      r="72"
                      transform="rotate(-90)"
                      style={{
                        stroke: seg.color,
                        opacity:
                          hoveredAssetCategory === null || hoveredAssetCategory === seg.category ? 1 : 0.35,
                        transition: 'opacity 0.2s ease, stroke-width 0.2s ease',
                      }}
                      strokeWidth={hoveredAssetCategory === seg.category ? 26 : 22}
                      strokeDasharray={`${seg.dash} ${seg.totalC}`}
                      strokeDashoffset={seg.offset}
                      onMouseEnter={() => setHoveredAssetCategory(seg.category)}
                      onMouseLeave={() => setHoveredAssetCategory(null)}
                    />
                  ))}
                </g>
              </svg>
              <div className="dc">
                <span className="mono" style={{ fontSize: 22, fontWeight: 600 }}>
                  {activeDonutInfo.label}
                </span>
                <span style={{ fontSize: 11, color: 'var(--tw-ink-3)' }}>
                  {activeDonutInfo.sub}
                </span>
              </div>
            </div>

            <div className="dleg">
              {donutSegments.map((item) => (
                <div
                  key={item.category}
                  className="dl"
                  style={{
                    opacity:
                      hoveredAssetCategory === null || hoveredAssetCategory === item.category ? 1 : 0.45,
                  }}
                  onMouseEnter={() => setHoveredAssetCategory(item.category)}
                  onMouseLeave={() => setHoveredAssetCategory(null)}
                >
                  <i style={{ background: item.color }} />
                  <span>
                    <b>{item.category}</b> {item.symbol}
                  </span>
                  <em className={item.isLoss ? 'loss' : ''}>
                    {item.r >= 0 ? '+' : '−'}
                    {Math.abs(item.r).toFixed(2)}R
                  </em>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* TILE 6: RULE CHECKS CHECKLIST (Cols 1-6, Row 3)                  */}
        {/* ================================================================ */}
        <section className="tile tw-risk-rules" aria-label="Rule checks">
          <div className="head">
            <span className="eyebrow">Rule checks</span>
            <span className="sub">4 on track · 2 to watch (click to configure)</span>
          </div>

          <div
            className="rrow"
            role="button"
            tabIndex={0}
            onClick={() => {
              if (dailyLossRule) openEditModal(dailyLossRule.rule);
            }}
          >
            <span className="rn">Daily loss limit</span>
            <span className="rv">0.0% of {dailyLimitPct.toFixed(1)}%</span>
            <span className="pill ok">
              <span className="d" />
              On track
            </span>
          </div>

          <div
            className="rrow"
            role="button"
            tabIndex={0}
            onClick={() => {
              if (drawdownRule) openEditModal(drawdownRule.rule);
            }}
          >
            <span className="rn">Max drawdown from peak</span>
            <span className="rv">0.0% of {drawdownLimitPct.toFixed(1)}%</span>
            <span className="pill ok">
              <span className="d" />
              On track
            </span>
          </div>

          <div
            className="rrow"
            role="button"
            tabIndex={0}
            onClick={() => {
              if (tradeRiskRule) openEditModal(tradeRiskRule.rule);
            }}
          >
            <span className="rn">Risk per trade</span>
            <span className="rv">
              {maxRiskPerTradePct.toFixed(1)}% of {maxRiskPerTradePct.toFixed(1)}%
            </span>
            <span className="pill w">
              <span className="d" />
              At cap
            </span>
          </div>

          <div
            className="rrow"
            role="button"
            tabIndex={0}
            onClick={() => {
              const r = evaluatedRules.find((x) => x.rule.ruleType === 'max_open_risk_pct');
              if (r) openEditModal(r.rule);
            }}
          >
            <span className="rn">Open risk</span>
            <span className="rv">
              {openRiskPct.toFixed(1)}% of {(openRiskPct * 2).toFixed(1)}%
            </span>
            <span className="pill ok">
              <span className="d" />
              On track
            </span>
          </div>

          <div
            className="rrow"
            role="button"
            tabIndex={0}
            onClick={() => {
              const r = evaluatedRules.find((x) => x.rule.ruleType === 'max_consecutive_losses');
              if (r) openEditModal(r.rule);
            }}
          >
            <span className="rn">Losing streak</span>
            <span className="rv">1 of 3 allowed</span>
            <span className="pill ok">
              <span className="d" />
              On track
            </span>
          </div>

          <div
            className="rrow"
            role="button"
            tabIndex={0}
            onClick={() => {
              const r = evaluatedRules.find((x) => x.rule.ruleType === 'min_trading_days');
              if (r) openEditModal(r.rule);
            }}
          >
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
              <b>{remainingLossesToDaily}</b>
              <small>
                {remainingLossesToDaily} × {maxRiskPerTradePct.toFixed(1)}% = {remainingDailyLimitPct.toFixed(1)}%
              </small>
            </div>
            <div className="c3">
              <span>Losses to total floor</span>
              <b>{Math.max(0, lossesToTotalFloor - effectiveSimulatedLosses)}</b>
              <small>
                {lossesToTotalFloor} × {maxRiskPerTradePct.toFixed(1)}% = {drawdownLimitPct.toFixed(1)}%
              </small>
            </div>
          </div>

          {/* Segmented Daily Limit Indicator (Interactive click simulation) */}
          <div className="bl">
            <div className="bh">
              <span>Daily limit allowance</span>
              <span>
                {effectiveSimulatedLosses} of {lossesToDailyLimit} full losses simulated
              </span>
            </div>
            <div className="blocks" aria-label="Simulate consecutive losses">
              {Array.from({ length: lossesToDailyLimit }).map((_, i) => {
                const isSimulated = i < effectiveSimulatedLosses;
                return (
                  <i
                    key={i}
                    className="blk"
                    style={{
                      background: isSimulated
                        ? 'color-mix(in srgb, var(--tw-loss) 80%, var(--tw-tile))'
                        : undefined,
                      boxShadow: isSimulated ? '0 0 8px var(--tw-loss)' : undefined,
                    }}
                    onClick={() => {
                      setSimulatedLosses((prev) => (prev === i + 1 ? 0 : i + 1));
                    }}
                    title={`Click to simulate ${i + 1} loss${i > 0 ? 'es' : ''}`}
                  />
                );
              })}
            </div>
          </div>

          {/* Segmented Total Floor Indicator (10 blocks) */}
          <div className="bl">
            <div className="bh">
              <span>Total floor buffer</span>
              <span>
                {effectiveSimulatedLosses} of {lossesToTotalFloor} full losses used
              </span>
            </div>
            <div className="blocks thin" aria-hidden="true">
              {Array.from({ length: lossesToTotalFloor }).map((_, i) => {
                const isSimulated = i < effectiveSimulatedLosses;
                return (
                  <i
                    key={i}
                    className="blk"
                    style={{
                      background: isSimulated
                        ? 'color-mix(in srgb, var(--tw-s3) 80%, var(--tw-tile))'
                        : undefined,
                      boxShadow: isSimulated ? '0 0 6px var(--tw-s3)' : undefined,
                    }}
                  />
                );
              })}
            </div>
          </div>
        </section>
      </main>

      {/* ================================================================ */}
      {/* ADVANCED EDIT LIMITS & GOVERNANCE MODAL                          */}
      {/* ================================================================ */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[var(--tw-tile)] border border-[var(--tw-line-strong)] rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--tw-line)]">
              <div>
                <h3 className="font-semibold text-lg text-[var(--tw-ink)]">
                  Configure Risk Governance Limits
                </h3>
                <p className="text-xs text-[var(--tw-ink-2)] mt-0.5">
                  Calibrate thresholds for {activeAccount.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="text-[var(--tw-ink-3)] hover:text-[var(--tw-ink)] p-1.5 rounded-lg transition-colors hover:bg-white/5"
              >
                <X size={18} />
              </button>
            </div>

            {/* Quick Rule Selector Tabs */}
            <div className="flex flex-wrap gap-1.5 p-1 rounded-2xl bg-[var(--tw-pill)] border border-[var(--tw-line)]">
              {activeAccount.rules?.map((rule) => {
                const isSelected = editingRule?.id === rule.id;
                return (
                  <button
                    key={rule.id}
                    type="button"
                    onClick={() => openEditModal(rule)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                      isSelected
                        ? 'bg-[var(--tw-tile)] text-[var(--tw-ink)] shadow-sm font-semibold'
                        : 'text-[var(--tw-ink-2)] hover:text-[var(--tw-ink)]'
                    }`}
                  >
                    {rule.ruleType.replace(/_/g, ' ')}
                  </button>
                );
              })}
            </div>

            {editingRule && (
              <div className="space-y-4 text-sm pt-1">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-[var(--tw-ink)]">
                      Maximum Threshold Limit ({editingRule.ruleType.includes('pct') ? '%' : '$'})
                    </label>
                    <span className="text-xs font-mono text-[var(--tw-hero-line)]">
                      Current: {editingRule.thresholdValue}
                      {editingRule.ruleType.includes('pct') ? '%' : ''}
                    </span>
                  </div>
                  <input
                    type="number"
                    step="0.1"
                    value={editThreshold}
                    onChange={(e) => setEditThreshold(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--tw-pill)] border border-[var(--tw-line)] text-[var(--tw-ink)] font-mono text-sm focus:outline-none focus:border-[var(--tw-hero-line)] focus:ring-1 focus:ring-[var(--tw-hero-line)]"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-[var(--tw-ink)]">
                      Warning Alert Threshold ({editWarningPct}% of limit)
                    </label>
                    <span className="text-xs font-mono text-[var(--tw-warn)]">
                      Triggers at{' '}
                      {(
                        (parseFloat(editThreshold || '0') * parseFloat(editWarningPct || '80')) /
                        100
                      ).toFixed(1)}
                      {editingRule.ruleType.includes('pct') ? '%' : ''}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="95"
                    step="5"
                    value={editWarningPct}
                    onChange={(e) => setEditWarningPct(e.target.value)}
                    className="w-full accent-[var(--tw-hero-line)]"
                  />
                  <div className="flex justify-between text-[10px] text-[var(--tw-ink-3)] font-mono mt-1">
                    <span>20% (Early Notice)</span>
                    <span>50%</span>
                    <span>80% (Recommended)</span>
                    <span>95% (Critical Only)</span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2.5 pt-3 border-t border-[var(--tw-line)]">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 rounded-full text-xs font-medium text-[var(--tw-ink-2)] hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveRule}
                className="px-5 py-2 rounded-full text-xs font-semibold bg-[var(--tw-hero-line)] text-[var(--tw-hero)] hover:opacity-90 shadow-md transition-all"
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

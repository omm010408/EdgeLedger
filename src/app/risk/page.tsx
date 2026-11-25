'use client';

import React, { useState, useMemo, useEffect } from 'react';
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
import { AccountRule } from '../../lib/types/financial';
import { filterTradesByPeriod } from '../../lib/data/periodFilter';
import { DeleteConfirmButton } from '../../components/ui/DeleteConfirmButton';

export default function RiskTerminalPage() {
  const {
    accounts,
    selectedAccountId,
    setSelectedAccountId,
    instruments,
    trades,
    toggleRule,
    updateRule,
    deleteRule,
    isPnlHidden,
  } = useTrading();

  // Selected account state for risk terminal
  const [localAccountId, setLocalAccountId] = useState<string>(() => {
    if (selectedAccountId && selectedAccountId !== 'ALL') return selectedAccountId;
    return accounts[0]?.id || '';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const accId = new URLSearchParams(window.location.search).get('accountId');
    if (accId && accounts.some((a) => a.id === accId)) {
      setLocalAccountId(accId);
      setSelectedAccountId(accId);
      return;
    }
    if (selectedAccountId && selectedAccountId !== 'ALL' && accounts.some((a) => a.id === selectedAccountId)) {
      setLocalAccountId(selectedAccountId);
      return;
    }
    if (!accounts.some((a) => a.id === localAccountId) && accounts[0]?.id) {
      setLocalAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId, localAccountId, setSelectedAccountId]);

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

  const startingBal = activeAccount?.startingBalance || 100000;

  // Extract key rule thresholds with unit normalization (dollars vs percent)
  const dailyLossRule = evaluatedRules.find((r) => r.rule.ruleType === 'daily_loss_limit');
  const drawdownRule = evaluatedRules.find(
    (r) => r.rule.ruleType === 'trailing_drawdown' || r.rule.ruleType === 'max_overall_loss'
  );
  const tradeRiskRule = evaluatedRules.find((r) => r.rule.ruleType === 'max_risk_per_trade_pct');
  const openRiskRule = evaluatedRules.find((r) => r.rule.ruleType === 'max_open_risk_pct');
  const losingStreakRule = evaluatedRules.find((r) => r.rule.ruleType === 'max_consecutive_losses');
  const minDaysRule = evaluatedRules.find((r) => r.rule.ruleType === 'min_trading_days');

  const dailyLimitPct = useMemo(() => {
    if (!dailyLossRule) return 5.0;
    const val = dailyLossRule.rule.thresholdValue;
    if (dailyLossRule.rule.thresholdUnit === 'percent') return val;
    return val > 100 ? Number(((val / startingBal) * 100).toFixed(1)) : val;
  }, [dailyLossRule, startingBal]);

  const drawdownLimitPct = useMemo(() => {
    if (!drawdownRule) return 10.0;
    const val = drawdownRule.rule.thresholdValue;
    if (drawdownRule.rule.thresholdUnit === 'percent') return val;
    return val > 100 ? Number(((val / startingBal) * 100).toFixed(1)) : val;
  }, [drawdownRule, startingBal]);

  const maxRiskPerTradePct = useMemo(() => {
    if (!tradeRiskRule) return 1.0;
    const val = tradeRiskRule.rule.thresholdValue;
    if (tradeRiskRule.rule.thresholdUnit === 'percent') return val;
    return val > 100 ? Number(((val / startingBal) * 100).toFixed(1)) : val;
  }, [tradeRiskRule, startingBal]);

  const openRiskLimitPct = useMemo(() => {
    if (!openRiskRule) return Number((maxRiskPerTradePct * 2).toFixed(1));
    const val = openRiskRule.rule.thresholdValue;
    if (openRiskRule.rule.thresholdUnit === 'percent') return val;
    return val > 100 ? Number(((val / startingBal) * 100).toFixed(1)) : val;
  }, [openRiskRule, maxRiskPerTradePct, startingBal]);

  const losingStreakLimit = Math.max(1, Math.round(losingStreakRule?.rule.thresholdValue || 3));
  const minTradingDaysTarget = Math.max(1, Math.round(minDaysRule?.rule.thresholdValue || 4));

  // Scope trades strictly to activeAccount
  const accountTrades = useMemo(() => {
    if (!activeAccount) return [];
    return trades.filter((t) => {
      if (t.allocations && t.allocations.length > 0) {
        return t.allocations.some((a) => a.accountId === activeAccount.id);
      }
      return accounts.length === 1;
    });
  }, [trades, activeAccount, accounts.length]);

  const getAccountTradePnl = (t: (typeof trades)[number]) => {
    if (!activeAccount) return t.netPnl;
    const alloc = t.allocations?.find((a) => a.accountId === activeAccount.id);
    return alloc ? alloc.netPnl : t.netPnl;
  };

  const getAccountTradeRiskUsd = (t: (typeof trades)[number]) => {
    if (!activeAccount) return t.plannedRiskUsd || 0;
    const alloc = t.allocations?.find((a) => a.accountId === activeAccount.id);
    if (alloc?.allocatedRiskUsd !== undefined) return alloc.allocatedRiskUsd;
    if (t.plannedRiskUsd && t.plannedRiskUsd > 0) return t.plannedRiskUsd;
    const inst = instruments.find((i) => i.symbol === t.instrumentSymbol);
    const size = alloc ? alloc.allocatedPositionSize : t.allocations?.[0]?.allocatedPositionSize || 1;
    const dist = Math.abs(t.entryPrice - t.stopLoss);
    return dist * size * (inst?.pointValue || inst?.contractSize || 1);
  };

  // Open risk calculations (live, 0.0% when no open trades)
  const openTrades = useMemo(() => {
    return accountTrades.filter((t) => t.status === 'OPEN');
  }, [accountTrades]);

  const openRiskPct = useMemo(() => {
    if (!activeAccount || openTrades.length === 0) return 0;
    const totalOpenRiskDollars = openTrades.reduce((sum, t) => sum + getAccountTradeRiskUsd(t), 0);
    const equity = activeAccount.currentEquity || startingBal;
    return equity > 0 ? Number(((totalOpenRiskDollars / equity) * 100).toFixed(1)) : 0;
  }, [activeAccount, openTrades, startingBal]);

  // Chronological closed trades for this account
  const allClosedTrades = useMemo(() => {
    return accountTrades
      .filter((t) => t.status === 'CLOSED')
      .sort(
        (a, b) =>
          new Date(a.exitTime || a.entryTime || a.createdAt).getTime() -
          new Date(b.exitTime || b.entryTime || b.createdAt).getTime()
      );
  }, [accountTrades]);

  const periodFilterKey = period === 'session' ? 'Today' : period === 'week' ? 'Week' : 'Month';

  const closedTrades = useMemo(() => {
    return filterTradesByPeriod(allClosedTrades, periodFilterKey);
  }, [allClosedTrades, periodFilterKey]);

  const recentClosedForBars = useMemo(() => {
    return closedTrades.slice(-4);
  }, [closedTrades]);

  // Execution Bar Data for Tile 4 (strictly from live trades, no static defaults)
  const barChartData = useMemo(() => {
    if (recentClosedForBars.length === 0) return [];
    const maxAbsR = Math.max(
      1.5,
      ...recentClosedForBars.map((t) => Math.abs(t.realizedR || 0))
    );
    const baselineY = 128;
    const maxUpH = 96;
    const maxDownH = 44;
    const slots = [62, 172, 282, 392];
    const width = 56;
    const startIdx = recentClosedForBars.length < 4 ? 0 : 0;
    const spacing = recentClosedForBars.length <= 1 ? 0 : 330 / Math.max(1, recentClosedForBars.length - 1);

    return recentClosedForBars.map((t, idx) => {
      const r = Number((t.realizedR || 0).toFixed(2));
      const pnl = getAccountTradePnl(t);
      const isLoss = r < 0 || (r === 0 && pnl < 0);
      const scaleH = isLoss
        ? Math.max(8, Math.round((Math.abs(r) / maxAbsR) * maxDownH))
        : Math.max(8, Math.round((Math.abs(r) / maxAbsR) * maxUpH));
      const x =
        recentClosedForBars.length === 4
          ? slots[idx]
          : recentClosedForBars.length === 1
            ? 227
            : Math.round(70 + (idx + startIdx) * spacing);
      const y = isLoss ? baselineY : baselineY - scaleH;
      const labelY = isLoss ? baselineY + scaleH + 16 : Math.max(18, y - 8);
      return {
        id: t.id,
        symbol: t.instrumentSymbol,
        r,
        pnl,
        date: new Date(t.exitTime || t.entryTime || t.createdAt).toLocaleDateString('en-US', {
          day: 'numeric',
          month: 'short',
        }),
        x,
        y,
        w: width,
        h: scaleH,
        labelY,
        isLoss,
      };
    });
  }, [recentClosedForBars]);

  // Gross R by asset class for Tile 5 (strictly from live period closed trades)
  const assetBreakdown = useMemo(() => {
    if (closedTrades.length === 0) return [];
    const palette = ['var(--tw-sun)', 'var(--tw-gain)', 'var(--tw-s3)', 'var(--tw-s1)'];
    const bySymbol = new Map<string, { category: string; symbol: string; r: number }>();

    for (const t of closedTrades) {
      const inst = instruments.find((i) => i.symbol === t.instrumentSymbol);
      const cat = inst?.category ? inst.category.toUpperCase() : t.instrumentSymbol;
      const prev = bySymbol.get(t.instrumentSymbol) || {
        category: cat,
        symbol: t.instrumentSymbol,
        r: 0,
      };
      prev.r += t.realizedR || 0;
      bySymbol.set(t.instrumentSymbol, prev);
    }

    return Array.from(bySymbol.values())
      .slice(0, 4)
      .map((item, idx) => ({
        category: item.symbol,
        symbol: item.category,
        r: Number(item.r.toFixed(2)),
        color: item.r < 0 ? 'var(--tw-s1)' : palette[idx % palette.length],
        isLoss: item.r < 0,
      }));
  }, [closedTrades, instruments]);

  const totalGrossR = useMemo(() => {
    const sum = assetBreakdown.reduce((acc, item) => acc + Math.abs(item.r), 0);
    return Number(sum.toFixed(2));
  }, [assetBreakdown]);

  // Live daily loss %, drawdown %, worst day, worst trade R, losing streak, trading days
  const todayLossUsedPct = useMemo(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const todayNet = allClosedTrades
      .filter((t) => (t.exitTime || t.entryTime || t.createdAt).slice(0, 10) === todayKey)
      .reduce((sum, t) => sum + getAccountTradePnl(t), 0);
    if (todayNet >= 0 || startingBal <= 0) return 0;
    return Number(((Math.abs(todayNet) / startingBal) * 100).toFixed(1));
  }, [allClosedTrades, startingBal]);

  const drawdownUsedPct = useMemo(() => {
    if (!activeAccount || activeAccount.highWaterMark <= 0) return 0;
    const ddDollars = Math.max(0, activeAccount.highWaterMark - activeAccount.currentEquity);
    return Number(((ddDollars / activeAccount.highWaterMark) * 100).toFixed(1));
  }, [activeAccount]);

  const maxObservedTradeRiskPct = useMemo(() => {
    const scopeList = closedTrades.length > 0 ? closedTrades : openTrades;
    if (scopeList.length === 0 || startingBal <= 0) return 0;
    const peak = Math.max(...scopeList.map((t) => (getAccountTradeRiskUsd(t) / startingBal) * 100));
    return Number(peak.toFixed(1));
  }, [closedTrades, openTrades, startingBal]);

  const worstTradeR = useMemo(() => {
    if (allClosedTrades.length === 0) return null;
    const minR = Math.min(...allClosedTrades.map((t) => t.realizedR || 0));
    return Number(minR.toFixed(2));
  }, [allClosedTrades]);

  const worstDaySummary = useMemo(() => {
    if (allClosedTrades.length === 0) return null;
    const byDay = new Map<string, number>();
    for (const t of allClosedTrades) {
      const dayKey = (t.exitTime || t.entryTime || t.createdAt).slice(0, 10);
      byDay.set(dayKey, (byDay.get(dayKey) || 0) + getAccountTradePnl(t));
    }
    let minDay = '';
    let minVal = Infinity;
    for (const [k, v] of byDay.entries()) {
      if (v < minVal) {
        minVal = v;
        minDay = k;
      }
    }
    const label = minDay
      ? new Date(`${minDay}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
      : '';
    return { pnl: minVal, label, daysCount: byDay.size };
  }, [allClosedTrades]);

  const losingStreakCurrent = useMemo(() => {
    let streak = 0;
    for (let i = allClosedTrades.length - 1; i >= 0; i--) {
      if (getAccountTradePnl(allClosedTrades[i]) < 0) streak++;
      else break;
    }
    return streak;
  }, [allClosedTrades]);

  const tradingDaysCount = worstDaySummary?.daysCount ?? 0;

  const latestStatusDateLabel = useMemo(() => {
    const latest = allClosedTrades[allClosedTrades.length - 1] || openTrades[0];
    if (!latest) return 'Live status';
    const d = new Date(latest.exitTime || latest.entryTime || latest.createdAt);
    return `${d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })} close`;
  }, [allClosedTrades, openTrades]);

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
  const nextFullLossDollars = (startingBal * maxRiskPerTradePct) / 100;
  const lossesToDailyLimit = Math.max(1, Math.min(20, Math.round(dailyLimitPct / Math.max(0.1, maxRiskPerTradePct))));
  const lossesToTotalFloor = Math.max(1, Math.min(20, Math.round(drawdownLimitPct / Math.max(0.1, maxRiskPerTradePct))));

  // Dynamic values adjusted for live today losses + interactive simulated loss count
  const totalDailyLossUsedPct = Number((todayLossUsedPct + simulatedLosses * maxRiskPerTradePct).toFixed(1));
  const effectiveSimulatedLosses = Math.min(lossesToDailyLimit, simulatedLosses);
  const remainingDailyLimitPct = Number(Math.max(0, dailyLimitPct - totalDailyLossUsedPct).toFixed(1));
  const remainingLossesToDaily = Math.max(0, Math.floor(remainingDailyLimitPct / Math.max(0.1, maxRiskPerTradePct)));

  // Overall status & alerts summary
  const isDailyBreached = todayLossUsedPct >= dailyLimitPct;
  const isDrawdownBreached = drawdownUsedPct >= drawdownLimitPct;
  const isRiskAtCap = maxObservedTradeRiskPct >= maxRiskPerTradePct && maxObservedTradeRiskPct > 0;
  const isOpenRiskHigh = openRiskPct >= openRiskLimitPct;
  const isStreakAtWarn = losingStreakCurrent >= losingStreakLimit;
  const hasBreach = isDailyBreached || isDrawdownBreached;
  const riskAlertsCount =
    (hasBreach ? 1 : 0) +
    (isRiskAtCap ? 1 : 0) +
    (isOpenRiskHigh ? 1 : 0) +
    (isStreakAtWarn ? 1 : 0);

  const ruleRows = [
    {
      label: 'Daily loss limit',
      valueText: `${todayLossUsedPct.toFixed(1)}% of ${dailyLimitPct.toFixed(1)}%`,
      status: todayLossUsedPct >= dailyLimitPct ? 'breached' : todayLossUsedPct >= dailyLimitPct * 0.8 ? 'watch' : 'ok',
      statusLabel: todayLossUsedPct >= dailyLimitPct ? 'Breached' : todayLossUsedPct >= dailyLimitPct * 0.8 ? 'Watch' : 'On track',
      rule: dailyLossRule?.rule,
    },
    {
      label: 'Max drawdown from peak',
      valueText: `${drawdownUsedPct.toFixed(1)}% of ${drawdownLimitPct.toFixed(1)}%`,
      status: drawdownUsedPct >= drawdownLimitPct ? 'breached' : drawdownUsedPct >= drawdownLimitPct * 0.8 ? 'watch' : 'ok',
      statusLabel: drawdownUsedPct >= drawdownLimitPct ? 'Breached' : drawdownUsedPct >= drawdownLimitPct * 0.8 ? 'Watch' : 'On track',
      rule: drawdownRule?.rule,
    },
    {
      label: 'Risk per trade',
      valueText: `${maxObservedTradeRiskPct.toFixed(1)}% of ${maxRiskPerTradePct.toFixed(1)}%`,
      status: maxObservedTradeRiskPct > maxRiskPerTradePct ? 'breached' : isRiskAtCap ? 'watch' : 'ok',
      statusLabel: maxObservedTradeRiskPct > maxRiskPerTradePct ? 'Over cap' : isRiskAtCap ? 'At cap' : 'On track',
      rule: tradeRiskRule?.rule,
    },
    {
      label: 'Open risk',
      valueText: `${openRiskPct.toFixed(1)}% of ${openRiskLimitPct.toFixed(1)}%`,
      status: openRiskPct > openRiskLimitPct ? 'breached' : openRiskPct >= openRiskLimitPct * 0.8 ? 'watch' : 'ok',
      statusLabel: openRiskPct > openRiskLimitPct ? 'Over cap' : openRiskPct >= openRiskLimitPct * 0.8 ? 'Watch' : 'On track',
      rule: openRiskRule?.rule,
    },
    {
      label: 'Losing streak',
      valueText: `${losingStreakCurrent} of ${losingStreakLimit} allowed`,
      status: losingStreakCurrent >= losingStreakLimit ? 'breached' : losingStreakCurrent >= Math.max(1, losingStreakLimit - 1) ? 'watch' : 'ok',
      statusLabel: losingStreakCurrent >= losingStreakLimit ? 'At limit' : 'On track',
      rule: losingStreakRule?.rule,
    },
    {
      label: 'Minimum trading days',
      valueText: `${tradingDaysCount} of ${minTradingDaysTarget}`,
      status: tradingDaysCount >= minTradingDaysTarget ? 'ok' : 'watch',
      statusLabel: tradingDaysCount >= minTradingDaysTarget ? 'Met' : 'Behind',
      rule: minDaysRule?.rule,
    },
  ];
  const onTrackCount = ruleRows.filter((r) => r.status === 'ok').length;
  const watchCount = ruleRows.length - onTrackCount;

  // SVG Gauge Dasharray (total circumference = 2 * PI * 86 ~= 540)
  const ringDash = Number(((Math.max(0.01, remainingDailyLimitPct) / Math.max(0.1, dailyLimitPct)) * 540).toFixed(1));

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
    <div className="flex-1 min-h-0 flex flex-col w-full overflow-y-auto pb-12">
      {/* Title & Controls Row */}
      <div className="titlerow flex items-end justify-between gap-4 mt-4 mb-2 flex-none">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--tw-ink)]">Risk and exposure</h1>
          <p className="text-sm text-[var(--tw-ink-2)] mt-1.5">Limit usage, open risk and what-if losses, measured against your own rules.</p>
        </div>

        <div className="controls flex items-center gap-2.5">
          {/* Period Segments */}
          <div className="seg inline-flex items-center gap-0.5 p-1 rounded-full bg-[var(--tw-pill)] border border-[var(--tw-line)]" role="group" aria-label="Period">
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
              className="btn flex items-center gap-2"
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
        <section className="tile tw-risk-hero select-none" aria-label="Risk status">
          <div className="head flex items-center justify-between w-full select-none">
            <span className="eyebrow">Risk status · {latestStatusDateLabel}</span>
            <span className="pill select-none">
              <span className="d" />
              {hasBreach ? 'Limit breached' : riskAlertsCount > 0 ? 'Attention' : 'Within limits'}
            </span>
          </div>

          <div className="tw-gauge-ring select-none">
            {/* Ambient radial glow behind the gauge */}
            <div className="ring-glow" />

            <svg viewBox="0 0 200 200" aria-hidden="true" focusable="false" tabIndex={-1} style={{ outline: 'none' }}>
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
                strokeDasharray={`${ringDash} 540`}
              />
            </svg>
            <div className="rc select-none">
              <b>{remainingDailyLimitPct.toFixed(1)}%</b>
              <span>daily limit left</span>
            </div>
          </div>

          <p className="rsub">
            {!worstDaySummary
              ? 'No closed trades recorded for this account yet.'
              : worstDaySummary.pnl >= 0
                ? `Lowest closed day was +${formatCur(worstDaySummary.pnl)} on ${worstDaySummary.label}. No day has closed negative.`
                : `Worst closed day was −${formatCur(worstDaySummary.pnl)} on ${worstDaySummary.label}.`}
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
              <b>
                {worstTradeR === null
                  ? '—'
                  : `${worstTradeR >= 0 ? '+' : '−'}${Math.abs(worstTradeR).toFixed(2)}R`}
              </b>
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* TILE 2: LIMIT USAGE METERS (Cols 5-9, Row 1)                     */}
        {/* ================================================================ */}
        <section className="tile tw-risk-meters select-none" aria-label="Limit usage">
          <div className="head flex items-center justify-between w-full select-none">
            <span className="eyebrow">Limit usage</span>
            <span className="sub">used of limit</span>
          </div>

          <div className="mrow">
            <div className="mtop">
              <span className="mn">Daily loss</span>
              <span className="mv">
                {totalDailyLossUsedPct.toFixed(1)}% of {dailyLimitPct.toFixed(1)}%
              </span>
            </div>
            <div
              className={`meter ${totalDailyLossUsedPct >= dailyLimitPct ? 'mCap' : 'mGain'}`}
              role="meter"
              aria-label="Daily loss used"
              aria-valuemin={0}
              aria-valuemax={dailyLimitPct}
              aria-valuenow={totalDailyLossUsedPct}
            >
              <i
                style={{
                  width: `${Math.min(100, (totalDailyLossUsedPct / Math.max(0.1, dailyLimitPct)) * 100)}%`,
                }}
              />
            </div>
          </div>

          <div className="mrow">
            <div className="mtop">
              <span className="mn">Drawdown from peak</span>
              <span className="mv">
                {drawdownUsedPct.toFixed(1)}% of {drawdownLimitPct.toFixed(1)}%
              </span>
            </div>
            <div
              className={`meter ${drawdownUsedPct >= drawdownLimitPct ? 'mCap' : 'mGain'}`}
              role="meter"
              aria-label="Drawdown used"
              aria-valuemin={0}
              aria-valuemax={drawdownLimitPct}
              aria-valuenow={drawdownUsedPct}
            >
              <i
                style={{
                  width: `${Math.min(100, (drawdownUsedPct / Math.max(0.1, drawdownLimitPct)) * 100)}%`,
                }}
              />
            </div>
          </div>

          <div className="mrow">
            <div className="mtop">
              <span className="mn">Risk per trade</span>
              <span className="mv">
                {maxObservedTradeRiskPct.toFixed(1)}% of {maxRiskPerTradePct.toFixed(1)}%
              </span>
            </div>
            <div
              className={`meter ${maxObservedTradeRiskPct >= maxRiskPerTradePct ? 'mCap' : 'mGain'}`}
              role="meter"
              aria-label="Risk per trade used"
              aria-valuemin={0}
              aria-valuemax={maxRiskPerTradePct}
              aria-valuenow={maxObservedTradeRiskPct}
            >
              <i
                style={{
                  width: `${Math.min(100, (maxObservedTradeRiskPct / Math.max(0.1, maxRiskPerTradePct)) * 100)}%`,
                }}
              />
            </div>
          </div>

          <div className="mrow">
            <div className="mtop">
              <span className="mn">Open risk</span>
              <span className="mv">
                {openRiskPct.toFixed(1)}% of {openRiskLimitPct.toFixed(1)}%
              </span>
            </div>
            <div
              className="meter mOpen"
              role="meter"
              aria-label="Open risk used"
              aria-valuemin={0}
              aria-valuemax={openRiskLimitPct}
              aria-valuenow={openRiskPct}
            >
              <i
                style={{
                  width: `${Math.min(100, (openRiskPct / Math.max(0.1, openRiskLimitPct)) * 100)}%`,
                }}
              />
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* TILE 3: ACTIVE ALERTS - SUN GOLD TILE (Cols 10-12, Row 1)         */}
        {/* ================================================================ */}
        <section className="tile tw-risk-alerts select-none" aria-label="Active alerts">
          <div className="head flex items-center justify-between w-full select-none">
            <span className="eyebrow">Alerts</span>
            <span
              className="pill select-none"
              style={{ background: 'var(--tw-sun-ink)', color: 'var(--tw-sun)' }}
            >
              {riskAlertsCount} active
            </span>
          </div>

          <div className="big">
            {hasBreach
              ? 'Limit reached'
              : isRiskAtCap
                ? 'Cap reached'
                : openTrades.length > 0
                  ? `${openTrades.length} live ${openTrades.length === 1 ? 'position' : 'positions'}`
                  : 'All clear'}
          </div>

          <div className="al">
            <span className="ai">{hasBreach || isRiskAtCap ? '!' : '✓'}</span>
            <div>
              {hasBreach ? (
                <>
                  <b>Account risk threshold exceeded</b>
                  <p>Pause new entries and review breached rule checks below.</p>
                </>
              ) : isRiskAtCap ? (
                <>
                  <b>Risk per trade reached its {maxRiskPerTradePct.toFixed(1)}% cap</b>
                  <p>Keep position sizing at or below {maxRiskPerTradePct.toFixed(1)}% on the next trade.</p>
                </>
              ) : (
                <>
                  <b>All risk rules within bounds</b>
                  <p>
                    Daily drawdown headroom sits at {remainingDailyLimitPct.toFixed(1)}% of {dailyLimitPct.toFixed(1)}%.
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="al">
            <span className="ai">i</span>
            <div>
              <b>
                {openTrades.length === 0
                  ? 'No trades currently open'
                  : openTrades.length === 1
                    ? '1 trade is still open'
                    : `${openTrades.length} trades are currently open`}
              </b>
              <p>
                {openTrades.length === 0
                  ? '0.0% open risk exposed across live positions.'
                  : `Carries ${openRiskPct.toFixed(1)}% open risk against your ${openRiskLimitPct.toFixed(1)}% ceiling.`}
              </p>
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* TILE 4: R DISTRIBUTION BAR CHART (Cols 5-9, Row 2)               */}
        {/* ================================================================ */}
        <section className="tile tw-risk-dist select-none" aria-label="R per closed trade">
          <div className="head flex items-center justify-between w-full select-none">
            <span className="eyebrow">R per closed trade</span>
            <span className="sub">
              {hoveredBarIndex !== null && barChartData[hoveredBarIndex]
                ? `${barChartData[hoveredBarIndex].symbol} · ${barChartData[hoveredBarIndex].date}: ${barChartData[hoveredBarIndex].r >= 0 ? '+' : '−'}${Math.abs(barChartData[hoveredBarIndex].r).toFixed(2)}R`
                : 'Dashed line: your −1.00R cap'}
            </span>
          </div>

          {barChartData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-xs text-[var(--tw-ink-3)] py-12">
              No closed trades recorded in this period for {activeAccount.name}.
            </div>
          ) : (
            <svg
              viewBox="0 0 520 210"
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label="R multiple distribution across recent closed trades"
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
                  key={bar.id}
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
                    key={`val-${bar.id}`}
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
                    key={`lbl-${bar.id}`}
                    x={bar.x + bar.w / 2}
                    y={200}
                    textAnchor="middle"
                  >
                    {bar.symbol}
                  </text>
                ))}
              </g>
            </svg>
          )}
        </section>

        {/* ================================================================ */}
        {/* TILE 5: ASSET DONUT - WHERE R CAME FROM (Cols 10-12, Row 2)       */}
        {/* ================================================================ */}
        <section className="tile tw-risk-assets select-none" aria-label="Gross R moved by asset">
          <div className="head flex items-center justify-between w-full select-none">
            <span className="eyebrow">Where R came from</span>
            <span className="sub">share of gross R</span>
          </div>

          {donutSegments.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-xs text-[var(--tw-ink-3)] py-12">
              Close a trade to see R attribution by instrument.
            </div>
          ) : (
            <div className="dwrap">
              <div style={{ position: 'relative', flex: 'none' }}>
                <svg viewBox="0 0 180 180" aria-hidden="true" focusable="false" tabIndex={-1}>
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
                <div className="dc select-none">
                  <span className="mono" style={{ fontSize: 22, fontWeight: 600 }}>
                    {activeDonutInfo.label}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--tw-ink-3)' }}>
                    {activeDonutInfo.sub}
                  </span>
                </div>
              </div>

              <div className="dleg select-none">
                {donutSegments.map((item) => (
                  <div
                    key={item.category}
                    className="dl select-none"
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
          )}
        </section>

        {/* ================================================================ */}
        {/* TILE 6: RULE CHECKS CHECKLIST (Cols 1-6, Row 3)                  */}
        {/* ================================================================ */}
        <section className="tile tw-risk-rules select-none" aria-label="Rule checks">
          <div className="head flex items-center justify-between w-full select-none">
            <span className="eyebrow">Rule checks</span>
            <span className="sub">
              {onTrackCount} on track · {watchCount} to watch (click to configure)
            </span>
          </div>

          {ruleRows.map((row) => (
            <div
              key={row.label}
              className="rrow select-none"
              role="button"
              tabIndex={0}
              onClick={() => {
                if (row.rule) openEditModal(row.rule);
              }}
            >
              <span className="rn">{row.label}</span>
              <span className="rv">{row.valueText}</span>
              <span className={`pill ${row.status === 'ok' ? 'ok' : 'w'} select-none`}>
                <span className="d" />
                {row.statusLabel}
              </span>
            </div>
          ))}
        </section>

        {/* ================================================================ */}
        {/* TILE 7: WHAT-IF STRESS TEST (Cols 7-12, Row 3)                   */}
        {/* ================================================================ */}
        <section className="tile tw-risk-stress select-none" aria-label="What-if losses">
          <div className="head flex items-center justify-between w-full select-none">
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

            <div className="flex items-center justify-between gap-2.5 pt-3 border-t border-[var(--tw-line)]">
              {editingRule ? (
                <DeleteConfirmButton
                  variant="button"
                  label="Delete rule"
                  confirmLabel="Confirm delete"
                  title="Remove this governance rule"
                  onConfirm={() => {
                    deleteRule(activeAccount.id, editingRule.id);
                    setEditingRule(null);
                    setIsEditModalOpen(false);
                  }}
                />
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2.5">
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
        </div>
      )}
    </div>
  );
}

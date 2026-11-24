'use client';

import React, { useState, useMemo } from 'react';
import { useTrading } from '../../context/TradingContext';
import { Trade, TradeAllocation } from '../../lib/types/financial';
import { QuickTradeModal } from '../../components/modals/QuickTradeModal';
import {
  Search,
  Plus,
  Scissors,
  CheckCircle2,
  X,
  ExternalLink,
  ChevronDown,
  Layers,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
} from 'lucide-react';

export default function TradesPage() {
  const {
    accounts,
    selectedAccountId,
    setSelectedAccountId,
    selectedAccount,
    trades,
    filteredTrades,
    periodFilter,
    setPeriodFilter,
    deleteTrade,
    executePartialClose,
  } = useTrading();

  const [quickTradeOpen, setQuickTradeOpen] = useState(false);
  const [selectedTradeId, setSelectedTradeId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | 'WINS' | 'LOSSES'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Partial close modal state
  const [partialCloseModalOpen, setPartialCloseModalOpen] = useState(false);
  const [partialCloseSize, setPartialCloseSize] = useState('0.5');
  const [partialClosePrice, setPartialClosePrice] = useState('');

  // 1. Period & Search filtered trades
  const tradesInPeriod = useMemo(() => {
    let list = filteredTrades;

    if (periodFilter === 'Week') {
      const cutoff = new Date('2024-03-16T00:00:00Z').getTime();
      const endCutoff = new Date('2024-03-23T00:00:00Z').getTime();
      const inWindow = list.filter((t) => {
        const time = new Date(t.entryTime).getTime();
        return time >= cutoff && time <= endCutoff;
      });
      list = inWindow.length > 0 ? inWindow : list.slice(0, 5);
    } else if (periodFilter === 'Month') {
      const cutoff = new Date('2024-03-01T00:00:00Z').getTime();
      list = list.filter((t) => new Date(t.entryTime).getTime() >= cutoff);
    }

    return list;
  }, [filteredTrades, periodFilter]);

  // Apply search and status chip filters
  const displayTrades = useMemo(() => {
    return tradesInPeriod.filter((t) => {
      // Status filter
      if (statusFilter === 'OPEN' && t.status !== 'OPEN') return false;
      if (statusFilter === 'WINS' && (t.status !== 'CLOSED' || t.netPnl <= 0)) return false;
      if (statusFilter === 'LOSSES' && (t.status !== 'CLOSED' || t.netPnl >= 0)) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchSymbol = t.instrumentSymbol.toLowerCase().includes(q);
        const matchSetup = t.setupType?.toLowerCase().includes(q);
        const matchStrategy = t.strategyName?.toLowerCase().includes(q);
        const matchTags = t.tags.some((tag) => tag.toLowerCase().includes(q));
        if (!matchSymbol && !matchSetup && !matchStrategy && !matchTags) return false;
      }
      return true;
    });
  }, [tradesInPeriod, statusFilter, searchQuery]);

  // Closed and open trade subsets
  const closedTradesInView = useMemo(() => {
    return tradesInPeriod.filter((t) => t.status === 'CLOSED');
  }, [tradesInPeriod]);

  const openTradesInView = useMemo(() => {
    return tradesInPeriod.filter((t) => t.status === 'OPEN');
  }, [tradesInPeriod]);

  // Summary Metrics for Hero Tile
  const totalRealizedR = useMemo(() => {
    return closedTradesInView.reduce((sum, t) => sum + (t.realizedR || 0), 0);
  }, [closedTradesInView]);

  const totalNetPnl = useMemo(() => {
    return closedTradesInView.reduce((sum, t) => sum + t.netPnl, 0);
  }, [closedTradesInView]);

  const wonTrades = useMemo(() => {
    return closedTradesInView.filter((t) => t.netPnl > 0);
  }, [closedTradesInView]);

  const lostTrades = useMemo(() => {
    return closedTradesInView.filter((t) => t.netPnl < 0);
  }, [closedTradesInView]);

  const winRatePct = useMemo(() => {
    if (closedTradesInView.length === 0) return 0;
    return (wonTrades.length / closedTradesInView.length) * 100;
  }, [wonTrades, closedTradesInView]);

  const avgR = useMemo(() => {
    if (closedTradesInView.length === 0) return 0;
    return totalRealizedR / closedTradesInView.length;
  }, [totalRealizedR, closedTradesInView]);

  // Best and worst trades in view
  const bestTrade = useMemo(() => {
    if (closedTradesInView.length === 0) return null;
    return [...closedTradesInView].sort((a, b) => (b.realizedR || 0) - (a.realizedR || 0))[0];
  }, [closedTradesInView]);

  const worstTrade = useMemo(() => {
    if (closedTradesInView.length === 0) return null;
    return [...closedTradesInView].sort((a, b) => (a.realizedR || 0) - (b.realizedR || 0))[0];
  }, [closedTradesInView]);

  // Setups in view distribution
  const setupsDistribution = useMemo(() => {
    const counts: { [setup: string]: number } = {};
    for (const t of tradesInPeriod) {
      const name = t.setupType || t.strategyName || 'Discretionary';
      counts[name] = (counts[name] || 0) + 1;
    }

    const total = tradesInPeriod.length || 1;
    const sorted = Object.entries(counts)
      .map(([name, count]) => ({
        name,
        count,
        sharePct: (count / total) * 100,
      }))
      .sort((a, b) => b.count - a.count);

    return sorted;
  }, [tradesInPeriod]);

  // Sparkline SVG path for Hero
  const sparklineCoords = useMemo(() => {
    if (closedTradesInView.length === 0) {
      return { path: 'M0 29 L300 29', area: 'M0 29 L300 29 L300 58 L0 58 Z', points: [] };
    }

    // Cumulative R steps
    let cumulative = 0;
    const cumulativeSteps: number[] = [];
    for (const t of closedTradesInView) {
      cumulative += t.realizedR || 0;
      cumulativeSteps.push(cumulative);
    }

    const minR = Math.min(0, ...cumulativeSteps);
    const maxR = Math.max(1, ...cumulativeSteps);
    const range = maxR - minR || 1;

    const width = 300;
    const height = 44;
    const padding = 6;
    const usableHeight = height - padding * 2;

    const points = cumulativeSteps.map((val, idx) => {
      const x = (idx / (cumulativeSteps.length - 1 || 1)) * width;
      const normalized = (val - minR) / range;
      const y = height - padding - normalized * usableHeight;
      return { x, y, val };
    });

    const pathD = points.reduce((acc, pt, idx) => {
      return `${acc} ${idx === 0 ? 'M' : 'L'}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    }, '');

    const areaD = `${pathD} L${width} 58 L0 58 Z`;

    return { path: pathD, area: areaD, points };
  }, [closedTradesInView]);

  // Active selected trade for the inspection card
  const selectedTrade = useMemo(() => {
    if (selectedTradeId) {
      const found = tradesInPeriod.find((t) => t.id === selectedTradeId);
      if (found) return found;
    }
    // Default to the first open trade or first trade in list
    return openTradesInView[0] || displayTrades[0] || tradesInPeriod[0] || null;
  }, [selectedTradeId, tradesInPeriod, openTradesInView, displayTrades]);

  // Format currency helpers
  const formatCur = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(val));
  };

  const formatDateHeader = (dateStr: string) => {
    const d = new Date(dateStr);
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${dayNames[d.getUTCDay()]} ${d.getUTCDate()} ${monthNames[d.getUTCMonth()]}`;
  };

  const formatShortDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getUTCDate()} ${monthNames[d.getUTCMonth()]}`;
  };

  // Group trades by entry date
  const groupedTradesByDate = useMemo(() => {
    const groups: {
      [key: string]: {
        dateStr: string;
        formattedDate: string;
        closedCount: number;
        openCount: number;
        dayPnl: number;
        trades: Trade[];
      };
    } = {};

    for (const trade of displayTrades) {
      const dayKey = trade.entryTime.slice(0, 10);
      if (!groups[dayKey]) {
        groups[dayKey] = {
          dateStr: dayKey,
          formattedDate: formatDateHeader(trade.entryTime),
          closedCount: 0,
          openCount: 0,
          dayPnl: 0,
          trades: [],
        };
      }
      groups[dayKey].trades.push(trade);
      if (trade.status === 'CLOSED') {
        groups[dayKey].closedCount += 1;
        groups[dayKey].dayPnl += trade.netPnl;
      } else {
        groups[dayKey].openCount += 1;
      }
    }

    // Sort days chronologically or newest first
    return Object.values(groups).sort(
      (a, b) => new Date(a.dateStr).getTime() - new Date(b.dateStr).getTime()
    );
  }, [displayTrades]);

  // Ladder details for selected trade
  const ladderStats = useMemo(() => {
    if (!selectedTrade) return null;
    const entry = selectedTrade.entryPrice;
    const stop = selectedTrade.stopLoss;
    const target = selectedTrade.takeProfit || entry + (entry - stop) * 2;
    const stopDist = Math.abs(entry - stop);
    const targetDist = Math.abs(target - entry);
    const rrRatio = stopDist > 0 ? (targetDist / stopDist).toFixed(1) : '1.0';

    return {
      entry,
      stop,
      target,
      stopDist,
      targetDist,
      rrRatio,
      isBuy: selectedTrade.direction === 'BUY',
    };
  }, [selectedTrade]);

  // Primary allocation for selected trade
  const primaryAlloc = selectedTrade?.allocations?.[0] || null;
  const primaryAccountName =
    selectedTrade?.allocations?.[0]?.accountName ||
    accounts.find((a) => a.id === selectedTrade?.allocations?.[0]?.accountId)?.name ||
    'Primary Desk';

  // Handler for partial close
  const handleConfirmPartialClose = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTrade || !primaryAlloc) return;

    const size = parseFloat(partialCloseSize) || 0.5;
    const price = parseFloat(partialClosePrice) || selectedTrade.entryPrice;

    executePartialClose(
      selectedTrade.id,
      primaryAlloc.id,
      size,
      price,
      5, // commission
      0,
      'Partial close executed from Tidewater ledger'
    );

    setPartialCloseModalOpen(false);
  };

  return (
    <div className="w-full flex flex-col">
      {/* ------------------------------------------------------------------ */}
      {/* Top Title Row: Headline, Segmented Period, Desk, New Execution    */}
      {/* ------------------------------------------------------------------ */}
      <div className="titlerow">
        <div>
          <h1>Trade execution ledger</h1>
          <p>Each row is one logical order. Select a row to inspect its levels and exits.</p>
        </div>

        <div className="controls">
          {/* Period Segmented Control */}
          <div className="tw-seg" role="group" aria-label="Period">
            {(['Week', 'Month', 'All time'] as const).map((period) => (
              <button
                key={period}
                type="button"
                aria-pressed={periodFilter === period}
                onClick={() => setPeriodFilter(period)}
              >
                {period}
              </button>
            ))}
          </div>

          {/* Account Selector */}
          <button
            className="tw-btn"
            type="button"
            onClick={() => {
              const nextId =
                selectedAccountId === 'ALL'
                  ? accounts[0]?.id || 'ALL'
                  : selectedAccountId === accounts[accounts.length - 1]?.id
                  ? 'ALL'
                  : accounts[accounts.findIndex((a) => a.id === selectedAccountId) + 1]?.id || 'ALL';
              setSelectedAccountId(nextId);
            }}
          >
            <span>
              {selectedAccountId === 'ALL'
                ? `All accounts, ${accounts.length}`
                : selectedAccount?.name || 'All accounts'}
            </span>
            <ChevronDown size={14} className="opacity-70" />
          </button>

          {/* Primary Action Button */}
          <button
            className="tw-btn"
            style={{
              background: 'var(--ink)',
              color: 'var(--tile)',
              fontWeight: 600,
              borderColor: 'var(--ink)',
            }}
            type="button"
            onClick={() => setQuickTradeOpen(true)}
          >
            <Plus size={15} />
            <span>+ New execution</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 12-Column Tidewater Grid Canvas                                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="tl-grid">
        {/* ================================================================ */}
        {/* 1. HERO TILE: Realized R in View (Cols 1-4, Row 1)                */}
        {/* ================================================================ */}
        <section className="tl-hero" aria-label="Realized R in view">
          <div className="lbl">Realized R, closed trades in view</div>
          <div className="big tabular-nums">
            {totalRealizedR >= 0 ? '+' : '−'}
            {Math.abs(totalRealizedR).toFixed(2)}R
          </div>

          <div className="delta">
            <span className="pill tabular-nums">
              {totalNetPnl >= 0 ? '+' : '−'}
              ${formatCur(totalNetPnl)}
            </span>
            <span>net P&amp;L after costs</span>
          </div>

          {/* Cumulative R Sparkline SVG */}
          <svg
            className="spark"
            viewBox="0 0 300 58"
            preserveAspectRatio="none"
            role="img"
            aria-label={`Cumulative R curve: ${closedTradesInView.length} executions`}
          >
            <path className="area" d={sparklineCoords.area} />
            <path className="line" d={sparklineCoords.path} />
            {sparklineCoords.points.map((pt, i) => (
              <circle
                key={i}
                className={`dot ${i === sparklineCoords.points.length - 1 ? 'last' : ''}`}
                cx={pt.x}
                cy={pt.y}
                r={i === sparklineCoords.points.length - 1 ? 4 : 3}
              />
            ))}
          </svg>

          {/* Stats Footer: Closed, Win Rate, Avg R */}
          <dl className="stats">
            <div>
              <dt>Closed</dt>
              <dd className="tabular-nums">{closedTradesInView.length}</dd>
            </div>
            <div>
              <dt>Win rate</dt>
              <dd className="tabular-nums">{winRatePct.toFixed(1)}%</dd>
            </div>
            <div>
              <dt>Avg R</dt>
              <dd className="tabular-nums">
                {avgR >= 0 ? '+' : '−'}
                {Math.abs(avgR).toFixed(2)}R
              </dd>
            </div>
          </dl>
        </section>

        {/* ================================================================ */}
        {/* 2. BEST AND WORST TILE: Sun Accent Tile (Cols 5-8, Row 1)        */}
        {/* ================================================================ */}
        <section className="tl-best" aria-label="Best and worst trade">
          <div className="lbl">Best and worst in view</div>
          <div className="sub">Ranked by realized R</div>

          <div className="tl-pair">
            {/* Best Trade Card */}
            <div className="tl-pr">
              <div>
                <div className="k">Best</div>
                <div className="v">
                  {bestTrade
                    ? `${bestTrade.instrumentSymbol} ${bestTrade.direction.toLowerCase()} · ${formatShortDate(bestTrade.entryTime)}`
                    : 'None in view'}
                </div>
              </div>
              <div className="r tabular-nums">
                {bestTrade ? `+${(bestTrade.realizedR || 0).toFixed(2)}R` : '—'}
              </div>
            </div>

            {/* Worst Trade Card */}
            <div className="tl-pr">
              <div>
                <div className="k">Worst</div>
                <div className="v">
                  {worstTrade
                    ? `${worstTrade.instrumentSymbol} ${worstTrade.direction.toLowerCase()} · ${formatShortDate(worstTrade.entryTime)}`
                    : 'None in view'}
                </div>
              </div>
              <div className="r tabular-nums">
                {worstTrade
                  ? `${worstTrade.realizedR && worstTrade.realizedR < 0 ? '−' : '+'}${Math.abs(worstTrade.realizedR || 0).toFixed(2)}R`
                  : '—'}
              </div>
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/* 3. SETUPS IN VIEW TILE: Aqua Accent Tile (Cols 9-12, Row 1)       */}
        {/* ================================================================ */}
        <section className="tl-setups" aria-label="Setups in view">
          <div className="lbl">Setups in view</div>
          <div className="sub">
            {tradesInPeriod.length} execution{tradesInPeriod.length !== 1 ? 's' : ''} across{' '}
            {setupsDistribution.length} setup{setupsDistribution.length !== 1 ? 's' : ''}
          </div>

          {/* Proportion Stack Bar */}
          <div className="tl-stack" aria-hidden="true">
            {setupsDistribution.map((item, idx) => {
              const opacities = [1, 0.55, 0.28, 0.15];
              const opacity = opacities[idx % opacities.length];
              return (
                <i
                  key={item.name}
                  style={{
                    width: `${item.sharePct}%`,
                    background:
                      opacity === 1
                        ? 'var(--aqua-ink)'
                        : `color-mix(in srgb, var(--aqua-ink) ${Math.round(opacity * 100)}%, transparent)`,
                  }}
                />
              );
            })}
          </div>

          {/* Setup Legend */}
          <div className="tl-legend">
            {setupsDistribution.slice(0, 3).map((item, idx) => {
              const opacities = [1, 0.55, 0.28];
              const opacity = opacities[idx % opacities.length];
              return (
                <div key={item.name} className="tl-lg">
                  <i
                    style={{
                      background:
                        opacity === 1
                          ? 'var(--aqua-ink)'
                          : `color-mix(in srgb, var(--aqua-ink) ${Math.round(opacity * 100)}%, transparent)`,
                    }}
                  />
                  <span className="truncate">{item.name}</span>
                  <span className="tabular-nums">{item.count}</span>
                </div>
              );
            })}
          </div>

          <div className="foot">
            Categorized by setup playbook &amp; technical triggers
          </div>
        </section>

        {/* ================================================================ */}
        {/* 4. EXECUTION LEDGER: Grouped Table (Cols 1-9, Row 2)             */}
        {/* ================================================================ */}
        <section className="tl-ledger" aria-label="Trade execution list">
          {/* Filters Bar */}
          <div className="tl-filters">
            <div className="tl-search">
              <Search size={15} className="mr-2 text-[var(--ink-3)] shrink-0" />
              <input
                type="text"
                placeholder="Search asset, setup, strategy, or tag"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <button
              className="tl-chip"
              type="button"
              aria-pressed={statusFilter === 'ALL'}
              onClick={() => setStatusFilter('ALL')}
            >
              <span>All</span>
              <b>{tradesInPeriod.length}</b>
            </button>

            <button
              className="tl-chip"
              type="button"
              aria-pressed={statusFilter === 'OPEN'}
              onClick={() => setStatusFilter('OPEN')}
            >
              <span>Open</span>
              <b>{openTradesInView.length}</b>
            </button>

            <button
              className="tl-chip"
              type="button"
              aria-pressed={statusFilter === 'WINS'}
              onClick={() => setStatusFilter('WINS')}
            >
              <span>Wins</span>
              <b>{wonTrades.length}</b>
            </button>

            <button
              className="tl-chip"
              type="button"
              aria-pressed={statusFilter === 'LOSSES'}
              onClick={() => setStatusFilter('LOSSES')}
            >
              <span>Losses</span>
              <b>{lostTrades.length}</b>
            </button>
          </div>

          {/* Table Header */}
          <div className="tl-lhead" role="row">
            <span>Date</span>
            <span>Asset</span>
            <span>Setup</span>
            <span>R vs stop</span>
            <span style={{ textAlign: 'right' }}>R</span>
            <span>Status</span>
            <span style={{ textAlign: 'right' }}>Net P&amp;L</span>
          </div>

          {/* Table Body (Grouped by Day) */}
          <div className="tl-lbody" role="grid">
            {groupedTradesByDate.length === 0 ? (
              <div className="p-12 text-center text-[var(--ink-3)] font-mono text-xs">
                No executions found matching your filters.
              </div>
            ) : (
              groupedTradesByDate.map((group) => (
                <React.Fragment key={group.dateStr}>
                  {/* Day Header Banner */}
                  <div className="tl-dayh">
                    <span>
                      {group.formattedDate} ·{' '}
                      {group.closedCount > 0
                        ? `${group.closedCount} closed`
                        : `${group.openCount} open`}
                    </span>
                    <span
                      className={`mono tabular-nums ${
                        group.dayPnl > 0
                          ? 'gain'
                          : group.dayPnl < 0
                          ? 'loss'
                          : 'warn'
                      }`}
                    >
                      {group.openCount > 0 && group.closedCount === 0
                        ? 'Active'
                        : `${group.dayPnl >= 0 ? '+' : '−'}$${formatCur(group.dayPnl)}`}
                    </span>
                  </div>

                  {/* Day Execution Rows */}
                  {group.trades.map((trade) => {
                    const isSelected = selectedTrade?.id === trade.id;
                    const isClosed = trade.status === 'CLOSED';
                    const isWin = isClosed && trade.netPnl > 0;
                    const isLoss = isClosed && trade.netPnl < 0;

                    // Compute diverging R bar position
                    // 50% is 0R. Scale: +/- 3R corresponds to 50% width
                    const rVal = trade.realizedR || 0;
                    const rMagnitudePct = Math.min(Math.abs(rVal) / 3, 1) * 50;

                    return (
                      <div
                        key={trade.id}
                        className="tl-lrow"
                        role="row"
                        aria-selected={isSelected}
                        onClick={() => setSelectedTradeId(trade.id)}
                      >
                        {/* 1. Date & Session */}
                        <span className="tl-date">
                          <b>{formatShortDate(trade.entryTime)}</b>
                          <br />
                          <span className="text-[var(--ink-3)]">{trade.session}</span>
                        </span>

                        {/* 2. Asset & Direction Pill */}
                        <span className="tl-asset">
                          <b>{trade.instrumentSymbol}</b>
                          <span
                            className={`tl-dir ${
                              trade.direction === 'BUY' ? 'buy' : 'sell'
                            }`}
                          >
                            {trade.direction === 'BUY' ? '↗ BUY' : '↘ SELL'}
                          </span>
                        </span>

                        {/* 3. Setup Title & Strategy */}
                        <span className="tl-setup">
                          <b>{trade.setupType || trade.strategyName || 'Trade Setup'}</b>
                          <small>{trade.technicalBias || trade.tradeThesis || 'Discretionary structure'}</small>
                        </span>

                        {/* 4. R vs Stop Diverging Bar */}
                        <span className="tl-rbar">
                          {isClosed ? (
                            <>
                              <i className="ax" />
                              <i
                                className={`bar ${isWin ? 'pos' : 'neg'}`}
                                style={{
                                  left: isWin ? '50%' : `${50 - rMagnitudePct}%`,
                                  width: `${rMagnitudePct}%`,
                                }}
                              />
                            </>
                          ) : (
                            <i className="open" />
                          )}
                        </span>

                        {/* 5. Realized R */}
                        <span
                          className={`tl-num ${
                            isWin ? 'gain' : isLoss ? 'loss' : 'text-[var(--ink-3)]'
                          }`}
                        >
                          {isClosed
                            ? `${rVal >= 0 ? '+' : '−'}${Math.abs(rVal).toFixed(2)}R`
                            : '—'}
                        </span>

                        {/* 6. Status Badge */}
                        <span>
                          <span
                            className={`tl-status ${
                              trade.status === 'OPEN' ? 'open' : ''
                            }`}
                          >
                            {trade.status}
                          </span>
                        </span>

                        {/* 7. Net P&L */}
                        <span
                          className={`tl-num ${
                            isWin
                              ? 'gain'
                              : isLoss
                              ? 'loss'
                              : 'warn'
                          }`}
                        >
                          {isClosed
                            ? `${trade.netPnl >= 0 ? '+' : '−'}$${formatCur(trade.netPnl)}`
                            : 'Active'}
                        </span>
                      </div>
                    );
                  })}
                </React.Fragment>
              ))
            )}
          </div>

          {/* Ledger Footer */}
          <div className="tl-lfoot font-mono">
            <span>
              {displayTrades.length} execution{displayTrades.length !== 1 ? 's' : ''}, grouped by day. R is measured against the planned stop.
            </span>
            <span>Times in ruleset timezone (UTC)</span>
          </div>
        </section>

        {/* ================================================================ */}
        {/* 5. SELECTED EXECUTION DETAIL: Price Ladder & Exits (Cols 10-12)   */}
        {/* ================================================================ */}
        <section
          className="tl-detail"
          aria-label={
            selectedTrade
              ? `Selected execution, ${selectedTrade.instrumentSymbol} ${selectedTrade.direction.toLowerCase()}`
              : 'Selected execution detail'
          }
        >
          {selectedTrade && ladderStats ? (
            <>
              {/* Card Header */}
              <div className="tl-dh">
                <div>
                  <div className="lbl">Selected execution</div>
                  <h2>
                    {selectedTrade.instrumentSymbol}{' '}
                    {selectedTrade.direction.toLowerCase()}
                  </h2>
                  <div className="sub">
                    {formatShortDate(selectedTrade.entryTime)} · {selectedTrade.timeframe} ·{' '}
                    {selectedTrade.session}
                  </div>
                </div>
                <span
                  className={`tl-status ${
                    selectedTrade.status === 'OPEN' ? 'open' : ''
                  }`}
                >
                  {selectedTrade.status}
                </span>
              </div>

              {/* Dynamic Price Ladder SVG */}
              <svg
                className="tl-ladder"
                viewBox="0 -8 330 158"
                role="img"
                aria-label={`Price ladder: stop ${ladderStats.stop}, entry ${ladderStats.entry}, target ${ladderStats.target}`}
              >
                {/* Red loss zone & Green gain zone */}
                <rect className="zl" x="0" y="10" width="330" height="32.5" />
                <rect className="zg" x="0" y="42.5" width="330" height="97.5" />

                {/* Level Lines */}
                <line className="lsl" x1="0" x2="330" y1="10" y2="10" />
                <line className="lent" x1="0" x2="330" y1="42.5" y2="42.5" />
                <line className="ltp" x1="0" x2="330" y1="140" y2="140" />

                {/* Left Labels */}
                <text className="tl-ladder lt" x="8" y="6">
                  Stop {ladderStats.stop.toLocaleString('en-US')}
                </text>
                <text className="tl-ladder lt" x="8" y="37">
                  Entry {ladderStats.entry.toLocaleString('en-US')}
                </text>
                <text className="tl-ladder lt" x="8" y="134">
                  Target {ladderStats.target.toLocaleString('en-US')}
                </text>

                {/* Right Labels (Distances in pts) */}
                <text className="tl-ladder lt" x="322" y="37" textAnchor="end">
                  {ladderStats.stopDist.toFixed(1)} pts
                </text>
                <text className="tl-ladder lt" x="322" y="134" textAnchor="end">
                  {ladderStats.targetDist.toFixed(1)} pts
                </text>
              </svg>

              {/* Key-Value Metrics Grid */}
              <dl className="tl-kv">
                <div>
                  <dt>Stop distance</dt>
                  <dd className="tabular-nums">{ladderStats.stopDist.toFixed(2)} pts</dd>
                </div>
                <div>
                  <dt>Target distance</dt>
                  <dd className="tabular-nums">{ladderStats.targetDist.toFixed(2)} pts</dd>
                </div>
                <div>
                  <dt>Planned R:R</dt>
                  <dd className="tabular-nums">1 : {ladderStats.rrRatio}</dd>
                </div>
                <div>
                  <dt>Realized R</dt>
                  <dd
                    className={`tabular-nums ${
                      selectedTrade.status === 'CLOSED'
                        ? (selectedTrade.realizedR || 0) >= 0
                          ? 'gain'
                          : 'loss'
                        : ''
                    }`}
                  >
                    {selectedTrade.status === 'CLOSED'
                      ? `${(selectedTrade.realizedR || 0) >= 0 ? '+' : '−'}${Math.abs(selectedTrade.realizedR || 0).toFixed(2)}R`
                      : 'Not yet'}
                  </dd>
                </div>
              </dl>

              {/* Desk Allocation Info */}
              <div className="tl-alloc flex items-center gap-1.5">
                <Layers size={13} className="text-[var(--ink-3)]" />
                <span>
                  Allocated to <strong>{primaryAccountName}</strong>
                </span>
              </div>

              {/* Scale-outs Notice */}
              <div className="tl-scale">
                {selectedTrade.status === 'CLOSED'
                  ? `Closed at ${selectedTrade.exitTime ? formatShortDate(selectedTrade.exitTime) : 'market'}. Net result: ${selectedTrade.netPnl >= 0 ? '+' : '−'}$${formatCur(selectedTrade.netPnl)}.`
                  : 'Scale-outs: none logged. Log a partial exit to scale out and secure R.'}
              </div>

              {/* Action Buttons */}
              <div className="tl-dact">
                {selectedTrade.status === 'OPEN' ? (
                  <>
                    <button
                      className="tw-btn"
                      type="button"
                      onClick={() => {
                        setPartialClosePrice(selectedTrade.entryPrice.toString());
                        setPartialCloseSize(
                          ((primaryAlloc?.allocatedPositionSize || 1) / 2).toFixed(2)
                        );
                        setPartialCloseModalOpen(true);
                      }}
                    >
                      <Scissors size={14} />
                      <span>Log partial exit</span>
                    </button>

                    <button
                      className="tw-btn"
                      style={{
                        background: 'var(--ink)',
                        color: 'var(--tile)',
                        fontWeight: 600,
                        borderColor: 'var(--ink)',
                      }}
                      type="button"
                      onClick={() => {
                        if (primaryAlloc) {
                          executePartialClose(
                            selectedTrade.id,
                            primaryAlloc.id,
                            primaryAlloc.allocatedPositionSize,
                            selectedTrade.entryPrice + 5,
                            5,
                            0,
                            'Full manual exit logged from ledger'
                          );
                        }
                      }}
                    >
                      <span>Log full exit</span>
                    </button>
                  </>
                ) : (
                  <button
                    className="tw-btn"
                    style={{ gridColumn: 'span 2' }}
                    type="button"
                    onClick={() => setQuickTradeOpen(true)}
                  >
                    <Plus size={14} />
                    <span>Record new trade</span>
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="m-auto text-center text-xs font-mono text-[var(--ink-3)]">
              Select an execution to inspect levels.
            </div>
          )}
        </section>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Partial Close Exit Modal                                           */}
      {/* ------------------------------------------------------------------ */}
      {partialCloseModalOpen && selectedTrade && primaryAlloc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md p-6 rounded-3xl bg-[var(--tile)] border border-[var(--line-strong)] shadow-2xl text-[var(--ink)]">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--line)]">
              <div>
                <h3 className="text-lg font-bold">Log Partial Exit</h3>
                <p className="text-xs text-[var(--ink-3)] font-mono">
                  Scale out of {selectedTrade.instrumentSymbol} ({selectedTrade.direction})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPartialCloseModalOpen(false)}
                className="p-1 rounded-full hover:bg-[var(--pill)]"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleConfirmPartialClose} className="space-y-4 mt-4 font-mono text-xs">
              <div>
                <label className="block text-[var(--ink-2)] mb-1">
                  Exit Position Size (Max: {primaryAlloc.allocatedPositionSize} lots):
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={primaryAlloc.allocatedPositionSize}
                  value={partialCloseSize}
                  onChange={(e) => setPartialCloseSize(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--pill)] border border-[var(--line)] text-[var(--ink)] outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-[var(--ink-2)] mb-1">Exit Price:</label>
                <input
                  type="number"
                  step="0.01"
                  value={partialClosePrice}
                  onChange={(e) => setPartialClosePrice(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--pill)] border border-[var(--line)] text-[var(--ink)] outline-none"
                  required
                />
              </div>

              <div className="pt-3 border-t border-[var(--line)] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPartialCloseModalOpen(false)}
                  className="tw-btn"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="tw-btn"
                  style={{
                    background: 'var(--ink)',
                    color: 'var(--tile)',
                    fontWeight: 600,
                  }}
                >
                  Confirm Partial Exit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Trade Creation Modal */}
      <QuickTradeModal
        isOpen={quickTradeOpen}
        onClose={() => setQuickTradeOpen(false)}
      />
    </div>
  );
}

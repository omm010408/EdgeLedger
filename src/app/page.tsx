'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useTrading } from '../context/TradingContext';
import {
  TrendingUp,
  Activity,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Briefcase,
  ShieldCheck,
  ChevronRight,
  Maximize2,
  BarChart2,
  ArrowUpRight,
  ArrowDownRight,
  Filter
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell
} from 'recharts';

const ACCOUNT_COLORS = [
  '#FFD56B', // Tidewater Amber / Gold
  '#5BE6AE', // Tidewater Emerald / Gain
  '#3987E5', // Tidewater Blue / Sky
  '#9085E9', // Tidewater Purple / Indigo
  '#FF8F80', // Tidewater Coral / Red
  '#FFB86B', // Tidewater Orange / Warn
];

export default function OverviewPage() {
  const {
    accounts,
    selectedAccountId,
    setSelectedAccountId,
    selectedAccount,
    trades,
    filteredTrades,
    portfolioMetrics,
    strategies,
    instruments,
    riskAlerts
  } = useTrading();

  // Local Filter Controls
  const [dateRange, setDateRange] = useState<'ALL' | '30D' | '7D'>('ALL');
  const [instrumentFilter, setInstrumentFilter] = useState<string>('ALL');
  const [directionFilter, setDirectionFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');

  // View Mode: Signature Bento Tidewater vs Deep Analytical Matrix
  const [viewMode, setViewMode] = useState<'BENTO' | 'ANALYTICAL'>('BENTO');

  // Graph Visualization Mode: Wave vs Multi-Account Overlay vs Normalized %
  const [graphMode, setGraphMode] = useState<'WAVE' | 'MULTI_OVERLAY' | 'NORMALIZED_PCT'>('WAVE');
  const [hiddenAccounts, setHiddenAccounts] = useState<{ [accId: string]: boolean }>({});
  const [dailyPnlMode, setDailyPnlMode] = useState<'COMBINED' | 'BY_ACCOUNT'>('COMBINED');

  // Filtered dataset based on dashboard controls
  const dashboardTrades = useMemo(() => {
    let list = filteredTrades;

    if (dateRange === '7D') {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      list = list.filter((t) => new Date(t.createdAt) >= cutoff);
    } else if (dateRange === '30D') {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      list = list.filter((t) => new Date(t.createdAt) >= cutoff);
    }

    if (instrumentFilter !== 'ALL') {
      list = list.filter((t) => t.instrumentSymbol === instrumentFilter);
    }

    if (directionFilter !== 'ALL') {
      list = list.filter((t) => t.direction === directionFilter);
    }

    return list;
  }, [filteredTrades, dateRange, instrumentFilter, directionFilter]);

  // Closed and Open Trades
  const closedTrades = useMemo(() => {
    return dashboardTrades
      .filter((t) => t.status === 'CLOSED')
      .sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime());
  }, [dashboardTrades]);

  const openTrades = useMemo(() => {
    return dashboardTrades.filter((t) => t.status === 'OPEN');
  }, [dashboardTrades]);

  // Dynamic Portfolio Capital Stats
  const capitalStats = useMemo(() => {
    const startingBal = selectedAccount
      ? selectedAccount.startingBalance
      : accounts.reduce((sum, a) => sum + a.startingBalance, 0);

    const netProfit = closedTrades.reduce((sum, t) => sum + t.netPnl, 0);
    const grossProfit = closedTrades.filter((t) => t.netPnl > 0).reduce((sum, t) => sum + t.netPnl, 0);
    const grossLoss = Math.abs(closedTrades.filter((t) => t.netPnl < 0).reduce((sum, t) => sum + t.netPnl, 0));
    const currentBal = startingBal + netProfit;
    const returnPct = startingBal > 0 ? (netProfit / startingBal) * 100 : 0;

    return {
      startingBal,
      currentBal,
      netProfit,
      grossProfit,
      grossLoss,
      returnPct,
    };
  }, [accounts, selectedAccount, closedTrades]);

  // Equity Curve Points for Recharts & SVG Wave Path
  const equityCurveData = useMemo(() => {
    const runningPerAccount: { [accId: string]: number } = {};
    accounts.forEach((acc) => {
      runningPerAccount[acc.id] = acc.startingBalance;
    });

    let totalRunningEquity = accounts.reduce((sum, a) => sum + a.startingBalance, 0);

    const initialPoint: any = {
      date: 'Start',
      equity: selectedAccount ? selectedAccount.startingBalance : totalRunningEquity,
      returnPct: 0,
    };

    accounts.forEach((acc) => {
      initialPoint[acc.id] = acc.startingBalance;
      initialPoint[`${acc.id}_pct`] = 0;
    });

    const points = [initialPoint];

    closedTrades.forEach((t) => {
      t.allocations.forEach((alloc) => {
        if (runningPerAccount[alloc.accountId] !== undefined) {
          runningPerAccount[alloc.accountId] += alloc.netPnl;
        }
      });

      totalRunningEquity += t.netPnl;

      const dateLabel = new Date(t.entryTime).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });

      const currentEq = selectedAccount
        ? (runningPerAccount[selectedAccount.id] || selectedAccount.startingBalance)
        : totalRunningEquity;

      const point: any = {
        date: dateLabel,
        tradeName: `${t.instrumentSymbol} ${t.direction}`,
        equity: Math.round(currentEq),
        netPnl: t.netPnl,
      };

      accounts.forEach((acc) => {
        const currentAccEq = runningPerAccount[acc.id] || acc.startingBalance;
        point[acc.id] = Math.round(currentAccEq);
        const growthPct = ((currentAccEq - acc.startingBalance) / acc.startingBalance) * 100;
        point[`${acc.id}_pct`] = Math.round(growthPct * 100) / 100;
      });

      points.push(point);
    });

    return points;
  }, [closedTrades, accounts, selectedAccount]);

  // Smooth SVG Wave Path Generator for Hero Tile
  const svgWavePath = useMemo(() => {
    if (equityCurveData.length < 2) {
      return {
        linePath: 'M0 120 C100 110, 300 90, 540 60',
        areaPath: 'M0 120 C100 110, 300 90, 540 60 V180 H0 Z',
        closingYPct: 34.8,
      };
    }

    const width = 540;
    const height = 180;
    const paddingY = 24;

    const values = equityCurveData.map((p) => p.equity);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;

    const coords = equityCurveData.map((pt, i) => {
      const x = (i / (equityCurveData.length - 1)) * width;
      const normalizedY = (pt.equity - minVal) / range;
      // Invert Y so highest equity is near the top
      const y = height - paddingY - normalizedY * (height - paddingY * 2);
      return { x, y };
    });

    // Build Catmull-Rom or cubic spline representation
    let linePath = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[i === 0 ? 0 : i - 1];
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const p3 = coords[i + 2 < coords.length ? i + 2 : coords.length - 1];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      linePath += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }

    const lastCoord = coords[coords.length - 1];
    const areaPath = `${linePath} V ${height} H 0 Z`;
    const closingYPct = (lastCoord.y / height) * 100;

    return { linePath, areaPath, closingYPct };
  }, [equityCurveData]);

  // 7-Day Net P&L Bubble Chart Data (Dynamic calendar week matching active trades)
  const bubbleDays = useMemo(() => {
    // Reference date: latest trade date or active today
    const refDate = closedTrades.length > 0
      ? new Date(closedTrades[closedTrades.length - 1].entryTime)
      : new Date();

    const days = [];
    const maxAbsPnl = Math.max(
      ...closedTrades.map((t) => Math.abs(t.netPnl)),
      1000
    );

    // Anchor to the 7-day span covering the trades (e.g. 16 Mar to 22 Mar or last 7 days)
    for (let offset = -4; offset <= 2; offset++) {
      const d = new Date(refDate);
      d.setDate(refDate.getDate() + offset);
      const dayNum = d.getDate();
      const monthStr = d.toLocaleDateString('en-US', { month: 'short' });
      const isoDate = d.toISOString().split('T')[0];

      // Find matching closed trades
      const dayClosed = closedTrades.filter((t) => {
        const tDate = (t.exitTime || t.entryTime).split('T')[0];
        return tDate === isoDate;
      });

      // Find matching open trades
      const dayOpen = openTrades.filter((t) => {
        const tDate = t.entryTime.split('T')[0];
        return tDate === isoDate;
      });

      const dayNetPnl = dayClosed.reduce((sum, t) => sum + t.netPnl, 0);

      let bubbleType: 'empty' | 'win' | 'loss' | 'open' = 'empty';
      let bubbleSize = 14;

      if (dayOpen.length > 0) {
        bubbleType = 'open';
        bubbleSize = 24;
      } else if (dayClosed.length > 0) {
        bubbleType = dayNetPnl >= 0 ? 'win' : 'loss';
        // Scale bubble size between 28px and 64px based on relative P&L
        const ratio = Math.min(Math.abs(dayNetPnl) / maxAbsPnl, 1);
        bubbleSize = Math.round(28 + ratio * 36);
      }

      days.push({
        dayNum,
        monthStr,
        isoDate,
        dayNetPnl,
        closedCount: dayClosed.length,
        openCount: dayOpen.length,
        bubbleType,
        bubbleSize,
        instruments: Array.from(new Set([...dayClosed, ...dayOpen].map((t) => t.instrumentSymbol))).join(', '),
      });
    }

    return days;
  }, [closedTrades, openTrades]);

  // Instrument Breakdown & Share of Net P&L
  const instrumentBreakdown = useMemo(() => {
    const map: { [sym: string]: { trades: number; pnl: number } } = {};
    dashboardTrades.forEach((t) => {
      if (!map[t.instrumentSymbol]) map[t.instrumentSymbol] = { trades: 0, pnl: 0 };
      map[t.instrumentSymbol].trades += 1;
      map[t.instrumentSymbol].pnl += t.netPnl;
    });

    const items = Object.entries(map).map(([symbol, data]) => ({
      symbol,
      trades: data.trades,
      pnl: data.pnl,
    }));

    const totalPositivePnl = items.reduce((sum, i) => sum + Math.max(0, i.pnl), 0) || 1;

    return items.map((item, idx) => {
      const pct = Math.max(0, (item.pnl / totalPositivePnl) * 100);
      const color = idx === 0 ? '#3987E5' : idx === 1 ? '#D95926' : '#9085E9';
      return {
        ...item,
        pct: Math.round(pct * 10) / 10,
        color,
      };
    });
  }, [dashboardTrades]);

  // Recent Closed Trades for Diverging R-Ladder (Up to 4 recent trades)
  const rLadderTrades = useMemo(() => {
    return closedTrades.slice(-4).reverse().map((t) => {
      const r = t.realizedR || 0;
      // Max R baseline display scale: 3R
      const barPct = Math.min(Math.abs(r) / 3 * 50, 50);
      return {
        id: t.id,
        symbol: t.instrumentSymbol,
        direction: t.direction,
        date: new Date(t.entryTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        pnl: t.netPnl,
        r,
        isPositive: r >= 0,
        barPct,
      };
    });
  }, [closedTrades]);

  // Best and Worst Closed Trades
  const tradeHighlights = useMemo(() => {
    if (closedTrades.length === 0) return { best: null, worst: null };
    const sorted = [...closedTrades].sort((a, b) => b.netPnl - a.netPnl);
    return {
      best: sorted[0],
      worst: sorted[sorted.length - 1],
    };
  }, [closedTrades]);

  // Format currency
  const formatCur = (val: number, options?: { showCents?: boolean }) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: options?.showCents === false ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const toggleAccountVisibility = (accId: string) => {
    setHiddenAccounts((prev) => ({
      ...prev,
      [accId]: !prev[accId],
    }));
  };

  // Primary Open Position for Surveillance Tile
  const primaryOpenPosition = openTrades[0] || null;

  return (
    <div className="space-y-6 -mt-2">
      {/* 1. Header Toolbar & Filters Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-edge-border/60">
        <div>
          <div className="flex items-center space-x-2">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: 'var(--tw-hero-line)' }}
            />
            <h1 className="text-xl font-mono font-bold tracking-tight text-white uppercase flex items-center gap-2">
              <span>PORTFOLIO INTELLIGENCE TERMINAL</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-[#0A4D4C] text-[#9BF3DF] border border-[#34544F]">
                BENTO TIDEWATER
              </span>
            </h1>
          </div>
          <p className="text-xs text-[#A9C1BD] mt-0.5 font-sans">
            Every Account. Every Trade. Every Rule. Multi-desk quantitative surveillance & performance intelligence.
          </p>
        </div>

        {/* Action Controls & Navigation Pills */}
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          {/* Period Selector (Tidewater Style) */}
          <div className="flex rounded-full bg-[#13211F] p-1 border border-[#34544F]">
            {[
              { id: '7D', label: 'Week' },
              { id: '30D', label: 'Month' },
              { id: 'ALL', label: 'All time' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setDateRange(p.id as any)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  dateRange === p.id
                    ? 'bg-white text-[#0B1415] shadow-sm'
                    : 'text-[#CFE2DE] hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Instrument Filter */}
          <select
            value={instrumentFilter}
            onChange={(e) => setInstrumentFilter(e.target.value)}
            className="px-3 py-1.5 rounded-full bg-[#0B1415] border border-[#34544F] text-[#CFE2DE] text-xs focus:border-[#9BF3DF] outline-none cursor-pointer"
          >
            <option value="ALL">All Instruments</option>
            {instruments.map((i) => (
              <option key={i.symbol} value={i.symbol}>
                {i.symbol}
              </option>
            ))}
          </select>

          {/* Direction Filter */}
          <select
            value={directionFilter}
            onChange={(e) => setDirectionFilter(e.target.value as any)}
            className="px-3 py-1.5 rounded-full bg-[#0B1415] border border-[#34544F] text-[#CFE2DE] text-xs focus:border-[#9BF3DF] outline-none cursor-pointer"
          >
            <option value="ALL">Longs & Shorts</option>
            <option value="BUY">Longs Only</option>
            <option value="SELL">Shorts Only</option>
          </select>

          {/* View Mode Toggle (Bento vs Analytical) */}
          <div className="flex rounded-full bg-[#13211F] p-1 border border-[#34544F]">
            <button
              onClick={() => setViewMode('BENTO')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                viewMode === 'BENTO'
                  ? 'bg-[#9BF3DF] text-[#03211C]'
                  : 'text-[#CFE2DE] hover:text-white'
              }`}
            >
              <Layers size={13} />
              <span>Bento</span>
            </button>
            <button
              onClick={() => setViewMode('ANALYTICAL')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                viewMode === 'ANALYTICAL'
                  ? 'bg-[#9BF3DF] text-[#03211C]'
                  : 'text-[#CFE2DE] hover:text-white'
              }`}
            >
              <BarChart2 size={13} />
              <span>Analytical</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Desk Selector Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-2xl border border-[#34544F] bg-[#0B1415] text-xs font-mono">
        <div className="flex items-center space-x-2">
          <span className="text-[10px] text-[#A9C1BD] uppercase font-bold tracking-wider">
            Active Desk Focus:
          </span>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedAccountId('ALL')}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                selectedAccountId === 'ALL'
                  ? 'bg-white text-[#0B1415] font-bold shadow-sm'
                  : 'bg-[#13211F] text-[#CFE2DE] hover:text-white border border-[#34544F]'
              }`}
            >
              All accounts · {accounts.length}
            </button>

            {accounts.map((acc, idx) => {
              const isSelected = selectedAccountId === acc.id;
              const color = ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length];

              return (
                <button
                  key={acc.id}
                  onClick={() => setSelectedAccountId(acc.id)}
                  className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all border ${
                    isSelected
                      ? 'bg-[#1A2D2B] text-white border-white shadow-glow'
                      : 'bg-[#13211F] text-[#CFE2DE] hover:text-white border-[#34544F]'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span>{acc.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="text-[11px] text-[#A9C1BD]">
          Active Focus:{' '}
          <span className="font-bold text-white">
            {selectedAccountId === 'ALL'
              ? `Consolidated Portfolio (${accounts.length} Accounts)`
              : selectedAccount?.name}
          </span>
        </div>
      </div>

      {/* 3. BENTO TIDEWATER GRID (12-Column Responsive Layout) */}
      {viewMode === 'BENTO' ? (
        <div className="relative">
          {/* Subtle Ambient Decorative Ripple Circles (top-right) */}
          <svg
            className="absolute -top-16 -right-16 w-96 h-96 pointer-events-none opacity-20 z-0"
            viewBox="0 0 600 600"
            aria-hidden="true"
            fill="none"
            stroke="#34544F"
            strokeWidth="1.5"
          >
            <circle cx="300" cy="300" r="120" />
            <circle cx="300" cy="300" r="200" />
            <circle cx="300" cy="300" r="280" />
          </svg>

          <div className="grid grid-cols-1 md:grid-cols-6 lg:grid-cols-12 gap-4 relative z-10">
            {/* ------------------------------------------------------------- */}
            {/* TILE 1: HERO NET P&L & EQUITY WAVE (Cols 1-5, Rows 1-2) */}
            {/* ------------------------------------------------------------- */}
            <section
              aria-label="Net P&L"
              className="md:col-span-6 lg:col-span-5 rounded-[40px] p-6 sm:p-7 flex flex-col justify-between overflow-hidden shadow-2xl relative"
              style={{
                backgroundColor: 'var(--tw-hero)',
                color: 'var(--tw-hero-ink)',
                border: '1px solid rgba(155, 243, 223, 0.25)',
              }}
            >
              <div className="relative z-10">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-wide" style={{ color: 'var(--tw-hero-2)' }}>
                    Net P&amp;L from closed trades · {dateRange === '7D' ? '7D Window' : dateRange === '30D' ? 'Last 30 Days' : 'All Time'}
                  </span>
                  {selectedAccountId === 'ALL' && (
                    <div className="flex rounded-full bg-black/30 p-0.5 border border-white/20 text-[10px] font-mono">
                      <button
                        onClick={() => setGraphMode('WAVE')}
                        className={`px-2 py-0.5 rounded-full transition-all ${
                          graphMode === 'WAVE' ? 'bg-[#9BF3DF] text-[#03211C] font-bold' : 'text-white/70 hover:text-white'
                        }`}
                      >
                        Wave
                      </button>
                      <button
                        onClick={() => setGraphMode('MULTI_OVERLAY')}
                        className={`px-2 py-0.5 rounded-full transition-all ${
                          graphMode === 'MULTI_OVERLAY' ? 'bg-[#9BF3DF] text-[#03211C] font-bold' : 'text-white/70 hover:text-white'
                        }`}
                      >
                        Multi ($)
                      </button>
                      <button
                        onClick={() => setGraphMode('NORMALIZED_PCT')}
                        className={`px-2 py-0.5 rounded-full transition-all ${
                          graphMode === 'NORMALIZED_PCT' ? 'bg-[#9BF3DF] text-[#03211C] font-bold' : 'text-white/70 hover:text-white'
                        }`}
                      >
                        Norm (%)
                      </button>
                    </div>
                  )}
                </div>

                {/* Big P&L Numeral */}
                <div className="mt-2 text-5xl sm:text-6xl font-bold font-mono tracking-tight text-white flex items-baseline">
                  <span>{capitalStats.netProfit >= 0 ? '+' : ''}{formatCur(capitalStats.netProfit).split('.')[0]}</span>
                  <span className="text-2xl sm:text-3xl font-medium ml-1" style={{ color: 'var(--tw-hero-2)' }}>
                    .{formatCur(capitalStats.netProfit).split('.')[1]}
                  </span>
                </div>

                {/* Return Percentage Badge */}
                <div className="mt-3 flex items-center gap-2">
                  <span
                    className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold font-mono"
                    style={{ background: 'var(--tw-hero-chip)', color: 'var(--tw-hero-ink)' }}
                  >
                    {capitalStats.returnPct >= 0 ? '+' : ''}{capitalStats.returnPct.toFixed(2)}%
                  </span>
                  <span className="text-xs" style={{ color: 'var(--tw-hero-2)' }}>
                    on a {formatCur(capitalStats.startingBal)} start
                  </span>
                </div>

                {/* 3-Column Capital Breakdown */}
                <dl className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/20 font-mono text-xs">
                  <div>
                    <dt className="text-[11px]" style={{ color: 'var(--tw-hero-2)' }}>Balance</dt>
                    <dd className="mt-1 font-bold text-base text-white">{formatCur(capitalStats.currentBal)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px]" style={{ color: 'var(--tw-hero-2)' }}>Gross profit</dt>
                    <dd className="mt-1 font-bold text-base text-[#5BE6AE]">+{formatCur(capitalStats.grossProfit)}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px]" style={{ color: 'var(--tw-hero-2)' }}>Gross loss</dt>
                    <dd className="mt-1 font-bold text-base text-[#FF8F80]">
                      {capitalStats.grossLoss > 0 ? `-${formatCur(capitalStats.grossLoss)}` : '$0.00'}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Interactive SVG Contour Wave Chart Area */}
              <div className="relative mt-4 h-36 w-full -mx-2">
                {graphMode === 'WAVE' ? (
                  <div className="relative w-full h-full">
                    <svg
                      viewBox="0 0 540 180"
                      preserveAspectRatio="none"
                      className="w-full h-full overflow-visible"
                    >
                      <defs>
                        <linearGradient id="twHeroGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#9BF3DF" stopOpacity="0.25" />
                          <stop offset="100%" stopColor="#9BF3DF" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      <path d={svgWavePath.areaPath} fill="url(#twHeroGrad)" />
                      {/* Secondary contour line */}
                      <path
                        d={svgWavePath.linePath}
                        fill="none"
                        stroke="#9BF3DF"
                        strokeWidth="1.5"
                        strokeOpacity="0.3"
                        transform="translate(0, 12)"
                      />
                      {/* Primary bold wave */}
                      <path
                        d={svgWavePath.linePath}
                        fill="none"
                        stroke="#9BF3DF"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>

                    {/* Milestone date & equity tags */}
                    <span className="absolute left-1 bottom-1 text-[10px] font-mono text-[#CFEEE6] bg-black/40 px-2 py-0.5 rounded-full border border-white/10">
                      Start: {formatCur(capitalStats.startingBal, { showCents: false })}
                    </span>
                    <span className="absolute right-1 top-2 text-[10px] font-mono text-white font-bold bg-[#0A4D4C] px-2 py-0.5 rounded-full border border-[#9BF3DF]">
                      Close: {formatCur(capitalStats.currentBal, { showCents: false })}
                    </span>
                  </div>
                ) : (
                  // Multi-Account Overlay / Normalized Curves inside Hero Tile
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={equityCurveData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                      <XAxis dataKey="date" stroke="#9BF3DF" tick={{ fontSize: 9, fill: '#CFEEE6' }} />
                      <YAxis
                        stroke="#9BF3DF"
                        domain={['auto', 'auto']}
                        tick={{ fontSize: 9, fill: '#CFEEE6' }}
                        tickFormatter={(val) => graphMode === 'NORMALIZED_PCT' ? `${val}%` : `$${Math.round(val / 1000)}k`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0B1415',
                          borderColor: '#34544F',
                          fontSize: '11px',
                          fontFamily: 'monospace',
                          borderRadius: '8px',
                        }}
                      />
                      {accounts.map((acc, idx) => {
                        const color = ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length];
                        const dataKey = graphMode === 'NORMALIZED_PCT' ? `${acc.id}_pct` : acc.id;
                        return (
                          <Line
                            key={acc.id}
                            type="monotone"
                            dataKey={dataKey}
                            name={acc.name}
                            stroke={color}
                            strokeWidth={2}
                            dot={{ r: 2, fill: color }}
                          />
                        );
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </section>

            {/* ------------------------------------------------------------- */}
            {/* TILE 2: PROFIT FACTOR (Cols 6-7, Row 1) — The Sun Arch */}
            {/* ------------------------------------------------------------- */}
            <section
              aria-label="Profit factor"
              className="md:col-span-3 lg:col-span-2 rounded-t-full rounded-b-[32px] p-5 flex flex-col justify-end items-center text-center relative overflow-hidden shadow-lg border-0"
              style={{
                backgroundColor: 'var(--tw-sun)',
                color: 'var(--tw-sun-ink)',
                minHeight: '210px',
              }}
            >
              {/* Sun Disc Top Graphic */}
              <span
                className="absolute top-5 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full pointer-events-none"
                style={{ backgroundColor: 'var(--tw-sun-disc)' }}
                aria-hidden="true"
              />
              <div className="relative z-10 w-full space-y-1">
                <div className="text-xs font-bold tracking-wide uppercase" style={{ color: 'var(--tw-sun-ink)' }}>
                  Profit factor
                </div>
                <div className="text-4xl sm:text-5xl font-mono font-bold tracking-tight" style={{ color: 'var(--tw-sun-ink)' }}>
                  {portfolioMetrics.profitFactor.toFixed(2)}
                </div>
                <div className="text-[11px] leading-tight font-sans font-medium opacity-90 pt-1" style={{ color: 'var(--tw-sun-ink)' }}>
                  Gross {formatCur(capitalStats.grossProfit, { showCents: false })} over {formatCur(capitalStats.grossLoss, { showCents: false })} losses
                </div>
              </div>
            </section>

            {/* ------------------------------------------------------------- */}
            {/* TILE 3: WIN RATE DONUT RING (Cols 8-9, Row 1) */}
            {/* ------------------------------------------------------------- */}
            <section
              aria-label="Win rate"
              className="bento-tile md:col-span-3 lg:col-span-2 items-center justify-between text-center"
            >
              <div className="w-full text-left text-xs font-semibold text-[#CFE2DE]">
                Win rate
              </div>

              {/* Dynamic SVG Donut Ring */}
              <div className="relative my-auto flex items-center justify-center">
                <svg viewBox="0 0 120 120" width="118" height="118" role="img" aria-label={`Win rate ${portfolioMetrics.winRate.toFixed(1)}%`}>
                  {/* Background Track */}
                  <circle
                    cx="60"
                    cy="60"
                    r="46"
                    fill="none"
                    stroke="var(--tw-ring-track)"
                    strokeWidth="11"
                  />
                  {/* Winning Arcs */}
                  <circle
                    cx="60"
                    cy="60"
                    r="46"
                    fill="none"
                    stroke="var(--tw-gain)"
                    strokeWidth="11"
                    strokeDasharray={`${(portfolioMetrics.winRate / 100) * 289} 289`}
                    strokeLinecap="round"
                    transform="rotate(-90 60 60)"
                  />
                  {/* Center percentage label */}
                  <text
                    x="60"
                    y="67"
                    textAnchor="middle"
                    fontFamily="monospace"
                    fontSize="20"
                    fontWeight="700"
                    fill="#FFFFFF"
                  >
                    {portfolioMetrics.winRate.toFixed(1)}%
                  </text>
                </svg>
              </div>

              <div className="text-[11px] text-[#A9C1BD] font-mono">
                {portfolioMetrics.winningTrades} won · {portfolioMetrics.losingTrades} lost · {closedTrades.length} trades
              </div>
            </section>

            {/* ------------------------------------------------------------- */}
            {/* TILE 4: EXPECTANCY (Cols 10-12, Row 1) — Aqua Mint Card */}
            {/* ------------------------------------------------------------- */}
            <section
              aria-label="Expectancy"
              className="md:col-span-6 lg:col-span-3 rounded-[32px] p-6 flex flex-col justify-between shadow-lg"
              style={{
                backgroundColor: 'var(--tw-aqua)',
                color: 'var(--tw-aqua-ink)',
                minHeight: '210px',
              }}
            >
              <div className="text-xs font-bold tracking-wide uppercase" style={{ color: 'var(--tw-aqua-ink)' }}>
                Expectancy per closed trade
              </div>

              <div className="text-4xl font-mono font-bold tracking-tight" style={{ color: 'var(--tw-aqua-ink)' }}>
                {portfolioMetrics.expectancy >= 0 ? '+' : ''}{formatCur(portfolioMetrics.expectancy)}
              </div>

              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center px-3 py-1 rounded-full text-xs font-mono font-bold shadow-sm"
                  style={{ backgroundColor: 'var(--tw-aqua-chip)', color: 'var(--tw-aqua-ink)' }}
                >
                  Average R {portfolioMetrics.averageR >= 0 ? '+' : ''}{portfolioMetrics.averageR.toFixed(2)}R
                </span>
              </div>
            </section>

            {/* ------------------------------------------------------------- */}
            {/* TILE 5: NET P&L BY DAY / BUBBLE WAVE (Cols 6-10, Row 2) */}
            {/* ------------------------------------------------------------- */}
            <section
              aria-label="Net P&L by day"
              className="bento-tile md:col-span-6 lg:col-span-5 relative overflow-hidden"
            >
              {/* Subtle background wave graphic */}
              <svg
                className="absolute left-0 right-0 bottom-0 w-full h-20 opacity-30 pointer-events-none"
                viewBox="0 0 560 84"
                preserveAspectRatio="none"
              >
                <path d="M0 40C90 18 170 56 280 36S460 16 560 38V84H0Z" fill="var(--tw-wave)" />
              </svg>

              <div className="relative z-10 flex items-baseline justify-between">
                <div>
                  <div className="text-xs font-bold text-white uppercase">Net P&amp;L by Day</div>
                  <div className="text-[11px] text-[#A9C1BD] mt-0.5 font-sans">
                    Bubble area scales with net result. Dashed ring marks open trades.
                  </div>
                </div>
                <span className="text-[10px] font-mono text-[#5BE6AE] uppercase font-semibold">
                  7-Day Calendar
                </span>
              </div>

              {/* 7-Day Bubble Columns */}
              <div className="relative z-10 grid grid-cols-7 gap-2 mt-4 flex-1 items-end pt-2">
                {bubbleDays.map((b) => (
                  <div
                    key={b.isoDate}
                    className="bento-tip-wrapper flex flex-col items-center justify-end gap-1.5 cursor-pointer group"
                    tabIndex={0}
                  >
                    {/* Hover Tooltip */}
                    <div className="bento-tip">
                      <b className="font-mono text-xs">{b.dayNum} {b.monthStr}</b>
                      {b.bubbleType === 'open' ? (
                        <div className="text-[#D99B26]">Active open trade ({b.instruments})</div>
                      ) : b.closedCount > 0 ? (
                        <div className={b.dayNetPnl >= 0 ? 'text-[#13794B]' : 'text-[#B3361F]'}>
                          {b.dayNetPnl >= 0 ? '+' : ''}{formatCur(b.dayNetPnl)} ({b.closedCount} trades)
                        </div>
                      ) : (
                        <div className="text-gray-500">No executions recorded</div>
                      )}
                    </div>

                    {/* Bubble Graphic */}
                    <div className="h-16 w-full flex items-end justify-center pb-1">
                      {b.bubbleType === 'win' ? (
                        <span
                          className="rounded-full bg-[#5BE6AE] transition-transform group-hover:scale-110 shadow-glow"
                          style={{ width: `${b.bubbleSize}px`, height: `${b.bubbleSize}px` }}
                        />
                      ) : b.bubbleType === 'loss' ? (
                        <span
                          className="rounded-full bg-[#FF8F80] transition-transform group-hover:scale-110"
                          style={{ width: `${b.bubbleSize}px`, height: `${b.bubbleSize}px` }}
                        />
                      ) : b.bubbleType === 'open' ? (
                        <span className="w-7 h-7 rounded-full border-2 border-dashed border-[#CFE2DE] animate-pulse" />
                      ) : (
                        <span className="w-3.5 h-3.5 rounded-full border border-[#6E8B86]" />
                      )}
                    </div>

                    {/* Day & Label */}
                    <div className="text-center">
                      <div className="text-xs font-mono font-medium text-[#CFE2DE]">{b.dayNum}</div>
                      <div className="text-[10px] font-mono font-bold truncate max-w-[44px]">
                        {b.bubbleType === 'open' ? (
                          <span className="text-[#FFB86B]">Open</span>
                        ) : b.closedCount > 0 ? (
                          <span className={b.dayNetPnl >= 0 ? 'text-[#5BE6AE]' : 'text-[#FF8F80]'}>
                            {b.dayNetPnl >= 0 ? '+' : ''}${Math.round(b.dayNetPnl)}
                          </span>
                        ) : (
                          <span className="text-[#A9C1BD] font-normal text-[9px]">—</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ------------------------------------------------------------- */}
            {/* TILE 6: TRADE QUALITY & PAYOFF (Cols 11-12, Row 2) */}
            {/* ------------------------------------------------------------- */}
            <section
              aria-label="Trade quality"
              className="bento-tile md:col-span-6 lg:col-span-2 justify-between"
            >
              <div className="text-xs font-bold text-white uppercase">Trade quality</div>

              {/* Average Win Bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-baseline text-xs font-mono">
                  <span className="text-[#A9C1BD]">Average win</span>
                  <span className="font-bold text-[#5BE6AE]">+{formatCur(portfolioMetrics.averageWin)}</span>
                </div>
                <div className="h-2.5 rounded-full bg-[#1A2D2B] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#5BE6AE]"
                    style={{
                      width: `${Math.min(100, (portfolioMetrics.averageWin / (Math.max(portfolioMetrics.averageWin, portfolioMetrics.averageLoss) || 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>

              {/* Average Loss Bar */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-baseline text-xs font-mono">
                  <span className="text-[#A9C1BD]">Average loss</span>
                  <span className="font-bold text-[#FF8F80]">-{formatCur(portfolioMetrics.averageLoss)}</span>
                </div>
                <div className="h-2.5 rounded-full bg-[#1A2D2B] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#FF8F80]"
                    style={{
                      width: `${Math.min(100, (portfolioMetrics.averageLoss / (Math.max(portfolioMetrics.averageWin, portfolioMetrics.averageLoss) || 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>

              {/* Payoff Pill */}
              <div className="pt-1">
                <span
                  className="inline-flex items-center px-3 py-1 rounded-full text-xs font-mono font-bold"
                  style={{ backgroundColor: 'var(--tw-sun)', color: 'var(--tw-sun-ink)' }}
                >
                  Payoff {portfolioMetrics.averageLoss > 0 ? (portfolioMetrics.averageWin / portfolioMetrics.averageLoss).toFixed(2) : '∞'}×
                </span>
                <div className="text-[10px] text-[#A9C1BD] mt-1">Average win over average loss</div>
              </div>
            </section>

            {/* ------------------------------------------------------------- */}
            {/* TILE 7: SHARE OF NET P&L BY INSTRUMENT (Cols 1-4, Row 3) */}
            {/* ------------------------------------------------------------- */}
            <section
              aria-label="Instrument share"
              className="bento-tile md:col-span-6 lg:col-span-4 justify-between"
            >
              <div>
                <div className="text-xs font-bold text-white uppercase">Share of Net P&amp;L by Instrument</div>
                <div className="text-[11px] text-[#A9C1BD] mt-0.5">Asset profit contribution</div>
              </div>

              {/* Stacked Segment Bar */}
              <div className="flex h-3.5 mt-3 rounded-full overflow-hidden bg-[#1A2D2B]">
                {instrumentBreakdown.map((item) => (
                  <span
                    key={item.symbol}
                    style={{ width: `${item.pct}%`, backgroundColor: item.color }}
                    className="border-r border-[#0B1415] last:border-0"
                    title={`${item.symbol}: ${item.pct}%`}
                  />
                ))}
              </div>

              {/* Legend List */}
              <ul className="space-y-2 mt-4 pt-2 border-t border-[#34544F] font-mono text-xs">
                {instrumentBreakdown.map((item) => (
                  <li key={item.symbol} className="grid grid-cols-12 items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full col-span-1" style={{ backgroundColor: item.color }} />
                    <span className="col-span-5 font-bold text-white truncate">
                      {item.symbol} <span className="text-[10px] text-[#A9C1BD] font-normal">({item.trades})</span>
                    </span>
                    <span className={`col-span-4 font-semibold text-right ${item.pnl >= 0 ? 'text-[#5BE6AE]' : 'text-[#FF8F80]'}`}>
                      {item.pnl >= 0 ? '+' : ''}{formatCur(item.pnl)}
                    </span>
                    <span className="col-span-2 text-right text-[11px] text-[#A9C1BD] font-medium">
                      {item.pct}%
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            {/* ------------------------------------------------------------- */}
            {/* TILE 8: R PER CLOSED TRADE LADDER (Cols 5-8, Rows 3-4) */}
            {/* ------------------------------------------------------------- */}
            <section
              aria-label="R per closed trade"
              className="bento-tile md:col-span-6 lg:col-span-4 justify-between"
            >
              <div>
                <div className="text-xs font-bold text-white uppercase">R per closed trade</div>
                <div className="text-[11px] text-[#A9C1BD] mt-0.5">
                  Wins right of dotted line (0R), losses left.
                </div>
              </div>

              {/* Diverging Ladder Rows */}
              <div className="space-y-4 my-auto pt-2">
                {rLadderTrades.map((t) => (
                  <div key={t.id} className="bento-tip-wrapper grid grid-cols-12 items-center gap-3" tabIndex={0}>
                    {/* Tooltip */}
                    <div className="bento-tip">
                      <b>{t.symbol} {t.direction} · {t.date}</b>
                      <div>Net P&amp;L: {t.pnl >= 0 ? '+' : ''}{formatCur(t.pnl)}</div>
                      <div>Multiple: {t.r >= 0 ? '+' : ''}{t.r.toFixed(2)}R</div>
                    </div>

                    {/* Trade label & Multiple */}
                    <div className="col-span-4 font-mono">
                      <div className={`font-bold text-sm ${t.isPositive ? 'text-[#5BE6AE]' : 'text-[#FF8F80]'}`}>
                        {t.r >= 0 ? '+' : ''}{t.r.toFixed(2)}R
                      </div>
                      <div className="text-[10px] text-[#A9C1BD] truncate">{t.symbol} · {t.date}</div>
                    </div>

                    {/* Diverging Center Track */}
                    <div className="col-span-8 relative h-4 rounded-full bg-[#1A2D2B]">
                      {/* Dotted center line at 0R */}
                      <span className="absolute left-1/2 -top-1.5 -bottom-1.5 border-l-2 border-dotted border-white/60 z-10" />
                      {/* Positive Bar (Right) */}
                      {t.isPositive ? (
                        <span
                          className="absolute left-1/2 top-0 bottom-0 rounded-r-full bg-[#5BE6AE]"
                          style={{ width: `${t.barPct}%` }}
                        />
                      ) : (
                        /* Negative Bar (Left) */
                        <span
                          className="absolute right-1/2 top-0 bottom-0 rounded-l-full bg-[#FF8F80]"
                          style={{ width: `${t.barPct}%` }}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ------------------------------------------------------------- */}
            {/* TILE 9: RECENT EXECUTIONS TABLE (Cols 9-12, Rows 3-4) */}
            {/* ------------------------------------------------------------- */}
            <section
              aria-label="Recent executions"
              className="bento-tile md:col-span-6 lg:col-span-4 justify-between"
            >
              <div className="flex items-baseline justify-between pb-2 border-b border-[#34544F]">
                <div>
                  <div className="text-xs font-bold text-white uppercase">Recent executions</div>
                  <div className="text-[10px] text-[#A9C1BD] font-mono">Ledger surveillance</div>
                </div>
                <Link
                  href="/trades"
                  className="text-xs font-semibold text-[#9BF3DF] hover:underline flex items-center space-x-1"
                >
                  <span>View all</span>
                  <ChevronRight size={13} />
                </Link>
              </div>

              {/* Table */}
              <div className="overflow-x-auto my-auto">
                <table className="w-full text-left font-mono text-xs">
                  <thead>
                    <tr className="text-[10px] text-[#A9C1BD] uppercase border-b border-[#34544F]">
                      <th className="pb-1.5">Asset</th>
                      <th className="pb-1.5">Side</th>
                      <th className="pb-1.5">Date</th>
                      <th className="pb-1.5 text-right">Net P&amp;L</th>
                      <th className="pb-1.5 text-right">R</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1A2D2B]">
                    {dashboardTrades.slice(0, 5).map((t) => (
                      <tr key={t.id} className="hover:bg-[#13211F] transition-colors">
                        <td className="py-2 font-bold text-white">{t.instrumentSymbol}</td>
                        <td className="py-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              t.direction === 'BUY'
                                ? 'bg-[#16365F] text-[#9CC8FF]'
                                : 'bg-[#1A2D2B] text-[#E6F2EF]'
                            }`}
                          >
                            {t.direction === 'BUY' ? 'Buy' : 'Sell'}
                          </span>
                        </td>
                        <td className="py-2 text-[11px] text-[#A9C1BD]">
                          {new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </td>
                        <td className={`py-2 text-right font-bold tabular-nums ${t.netPnl >= 0 ? 'text-[#5BE6AE]' : 'text-[#FF8F80]'}`}>
                          {t.status === 'CLOSED' ? `${t.netPnl >= 0 ? '+' : ''}${formatCur(t.netPnl)}` : 'Open'}
                        </td>
                        <td className="py-2 text-right text-[11px] text-[#CFE2DE] tabular-nums">
                          {t.status === 'CLOSED' ? `${t.realizedR >= 0 ? '+' : ''}${t.realizedR}R` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Footer Highlight Facts */}
              <dl className="grid grid-cols-2 gap-3 pt-3 border-t border-[#34544F] font-mono text-xs">
                <div>
                  <dt className="text-[10px] text-[#A9C1BD] uppercase">Best closed trade</dt>
                  <dd className="mt-0.5 font-bold text-[#5BE6AE]">
                    {tradeHighlights.best ? `+${formatCur(tradeHighlights.best.netPnl)}` : '—'}
                  </dd>
                  <small className="text-[10px] text-[#A9C1BD] block">
                    {tradeHighlights.best ? `${tradeHighlights.best.instrumentSymbol} · +${tradeHighlights.best.realizedR}R` : ''}
                  </small>
                </div>
                <div>
                  <dt className="text-[10px] text-[#A9C1BD] uppercase">Worst closed trade</dt>
                  <dd className="mt-0.5 font-bold text-[#FF8F80]">
                    {tradeHighlights.worst && tradeHighlights.worst.netPnl < 0 ? `-${formatCur(Math.abs(tradeHighlights.worst.netPnl))}` : 'None'}
                  </dd>
                  <small className="text-[10px] text-[#A9C1BD] block">
                    {tradeHighlights.worst && tradeHighlights.worst.netPnl < 0 ? `${tradeHighlights.worst.instrumentSymbol} · ${tradeHighlights.worst.realizedR}R` : ''}
                  </small>
                </div>
              </dl>
            </section>

            {/* ------------------------------------------------------------- */}
            {/* TILE 10: OPEN POSITION AND RISK (Cols 1-4, Row 4) */}
            {/* ------------------------------------------------------------- */}
            <section
              aria-label="Open position and risk"
              className="bento-tile md:col-span-6 lg:col-span-12 justify-between"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#34544F]">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#FFB86B]" />
                  <div className="text-xs font-bold text-white uppercase">Active Open Risk &amp; Exposure Surveillance</div>
                </div>
                {riskAlerts.length > 0 && (
                  <span
                    className="inline-flex items-center px-3 py-1 rounded-full text-xs font-mono font-bold"
                    style={{
                      background: 'var(--tw-warn-bg)',
                      color: 'var(--tw-warn)',
                      boxShadow: 'inset 0 0 0 1px var(--tw-warn-line)',
                    }}
                  >
                    Risk alert active: {riskAlerts[0]?.title}
                  </span>
                )}
              </div>

              {primaryOpenPosition ? (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 py-2 font-mono items-center">
                  <div className="space-y-1">
                    <div className="text-xl font-bold text-white">
                      {primaryOpenPosition.instrumentSymbol} · {primaryOpenPosition.direction}
                    </div>
                    <div className="text-xs text-[#A9C1BD] font-sans">
                      Opened at {primaryOpenPosition.entryPrice} · Unrealized P&amp;L excluded from closed totals
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-[#13211F] border border-[#34544F]">
                    <div className="text-[10px] text-[#A9C1BD] uppercase">Open Risk (SL)</div>
                    <div className="text-base font-bold text-white">
                      {formatCur(portfolioMetrics.openRiskUsd || 600)}
                    </div>
                    <div className="text-[10px] text-[#A9C1BD]">
                      {capitalStats.currentBal > 0 ? ((portfolioMetrics.openRiskUsd || 600) / capitalStats.currentBal * 100).toFixed(2) : 0}% of balance
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-[#13211F] border border-[#34544F]">
                    <div className="text-[10px] text-[#A9C1BD] uppercase">Largest Loss (Buffer)</div>
                    <div className="text-base font-bold text-[#FF8F80]">
                      {tradeHighlights.worst && tradeHighlights.worst.netPnl < 0 ? `-${formatCur(Math.abs(tradeHighlights.worst.netPnl))}` : '$0.00'}
                    </div>
                    <div className="text-[10px] text-[#A9C1BD]">
                      {capitalStats.startingBal > 0 ? ((capitalStats.grossLoss) / capitalStats.startingBal * 100).toFixed(2) : 0}% of starting capital
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-[#13211F] border border-[#34544F]">
                    <div className="text-[10px] text-[#A9C1BD] uppercase">Typical Planned Risk</div>
                    <div className="text-base font-bold text-white">$1,000 – $1,100</div>
                    <div className="text-[10px] text-[#A9C1BD]">1.00% standard risk unit</div>
                  </div>
                </div>
              ) : (
                <div className="py-4 text-center font-mono text-xs text-[#A9C1BD]">
                  No active open positions. Total capital is currently flat and preserved in cash.
                </div>
              )}
            </section>
          </div>
        </div>
      ) : (
        /* 4. DEEP ANALYTICAL MATRIX (Full Recharts Multi-Account Overlay & Bar View) */
        <div className="space-y-6">
          {/* Main Charts: Cumulative Equity Curve & Daily P&L */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Equity Curve (2 cols) with Single Account & Multi-Account Overlay Modes */}
            <div className="lg:col-span-2 p-4 rounded-3xl border border-edge-border bg-edge-surface flex flex-col space-y-4 shadow-terminal">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  <TrendingUp size={16} className="text-edge-accent" />
                  <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white">
                    {selectedAccountId === 'ALL'
                      ? graphMode === 'MULTI_OVERLAY'
                        ? 'MULTI-ACCOUNT EQUITY OVERLAY COMPARISON ($)'
                        : graphMode === 'NORMALIZED_PCT'
                        ? 'NORMALIZED ACCOUNT RETURN CURVES (% GROWTH)'
                        : 'CUMULATIVE PORTFOLIO EQUITY TRAJECTORY'
                      : `${selectedAccount?.name.toUpperCase()} EQUITY TRAJECTORY`}
                  </h3>
                </div>

                {selectedAccountId === 'ALL' && (
                  <div className="flex rounded-full border border-edge-border bg-edge-surface-secondary p-0.5 font-mono text-[10px]">
                    <button
                      onClick={() => setGraphMode('WAVE')}
                      className={`px-3 py-1 rounded-full transition-colors ${
                        graphMode === 'WAVE'
                          ? 'bg-edge-accent text-edge-bg font-bold'
                          : 'text-edge-text-secondary hover:text-white'
                      }`}
                    >
                      Consolidated ($)
                    </button>
                    <button
                      onClick={() => setGraphMode('MULTI_OVERLAY')}
                      className={`px-3 py-1 rounded-full transition-colors ${
                        graphMode === 'MULTI_OVERLAY'
                          ? 'bg-edge-accent text-edge-bg font-bold'
                          : 'text-edge-text-secondary hover:text-white'
                      }`}
                    >
                      Multi-Account ($)
                    </button>
                    <button
                      onClick={() => setGraphMode('NORMALIZED_PCT')}
                      className={`px-3 py-1 rounded-full transition-colors ${
                        graphMode === 'NORMALIZED_PCT'
                          ? 'bg-edge-accent text-edge-bg font-bold'
                          : 'text-edge-text-secondary hover:text-white'
                      }`}
                    >
                      Normalized (%)
                    </button>
                  </div>
                )}
              </div>

              {/* Interactive Multi-Account Legend */}
              {selectedAccountId === 'ALL' && graphMode !== 'WAVE' && (
                <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-edge-border/40 font-mono text-[10px]">
                  <span className="text-edge-text-muted uppercase">Toggle Curves:</span>
                  {accounts.map((acc, idx) => {
                    const color = ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length];
                    const isHidden = hiddenAccounts[acc.id];

                    return (
                      <button
                        key={acc.id}
                        onClick={() => toggleAccountVisibility(acc.id)}
                        className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full border transition-all ${
                          !isHidden
                            ? 'bg-edge-surface-secondary text-white border-edge-border'
                            : 'bg-edge-surface-secondary/20 text-edge-text-muted border-transparent line-through'
                        }`}
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: !isHidden ? color : '#5A687D' }}
                        />
                        <span>{acc.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Chart Rendering Area */}
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  {selectedAccountId !== 'ALL' || graphMode === 'WAVE' ? (
                    <AreaChart data={equityCurveData}>
                      <defs>
                        <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#9BF3DF" stopOpacity="0.35" />
                          <stop offset="95%" stopColor="#9BF3DF" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#18202C" vertical={false} />
                      <XAxis dataKey="date" stroke="#5A687D" tick={{ fontSize: 10, fill: '#8B9BB4' }} />
                      <YAxis
                        stroke="#5A687D"
                        domain={['auto', 'auto']}
                        tick={{ fontSize: 10, fill: '#8B9BB4' }}
                        tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0A0D12',
                          borderColor: '#202A3A',
                          fontSize: '11px',
                          fontFamily: 'monospace',
                          borderRadius: '8px',
                        }}
                        formatter={(val: any) => [formatCur(Number(val)), selectedAccount ? selectedAccount.name : 'Portfolio Equity']}
                      />
                      <Area
                        type="monotone"
                        dataKey="equity"
                        name={selectedAccount ? selectedAccount.name : 'Total Equity'}
                        stroke="#9BF3DF"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#equityGrad)"
                      />
                    </AreaChart>
                  ) : graphMode === 'MULTI_OVERLAY' ? (
                    <LineChart data={equityCurveData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#18202C" vertical={false} />
                      <XAxis dataKey="date" stroke="#5A687D" tick={{ fontSize: 10, fill: '#8B9BB4' }} />
                      <YAxis
                        stroke="#5A687D"
                        domain={['auto', 'auto']}
                        tick={{ fontSize: 10, fill: '#8B9BB4' }}
                        tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0A0D12',
                          borderColor: '#202A3A',
                          fontSize: '11px',
                          fontFamily: 'monospace',
                          borderRadius: '8px',
                        }}
                        formatter={(val: any, name: any) => [
                          formatCur(Number(val)),
                          accounts.find((a) => a.id === name)?.name || name,
                        ]}
                      />
                      {accounts.map((acc, idx) => {
                        if (hiddenAccounts[acc.id]) return null;
                        const color = ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length];
                        return (
                          <Line
                            key={acc.id}
                            type="monotone"
                            dataKey={acc.id}
                            name={acc.id}
                            stroke={color}
                            strokeWidth={2}
                            dot={{ r: 2.5, fill: color }}
                            activeDot={{ r: 5 }}
                          />
                        );
                      })}
                    </LineChart>
                  ) : (
                    <LineChart data={equityCurveData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#18202C" vertical={false} />
                      <XAxis dataKey="date" stroke="#5A687D" tick={{ fontSize: 10, fill: '#8B9BB4' }} />
                      <YAxis
                        stroke="#5A687D"
                        domain={['auto', 'auto']}
                        tick={{ fontSize: 10, fill: '#8B9BB4' }}
                        tickFormatter={(val) => `${val > 0 ? '+' : ''}${val}%`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0A0D12',
                          borderColor: '#202A3A',
                          fontSize: '11px',
                          fontFamily: 'monospace',
                          borderRadius: '8px',
                        }}
                        formatter={(val: any, name: any) => {
                          const cleanId = String(name).replace('_pct', '');
                          const accName = accounts.find((a) => a.id === cleanId)?.name || name;
                          return [`${Number(val) > 0 ? '+' : ''}${Number(val).toFixed(2)}%`, accName];
                        }}
                      />
                      {accounts.map((acc, idx) => {
                        if (hiddenAccounts[acc.id]) return null;
                        const color = ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length];
                        return (
                          <Line
                            key={acc.id}
                            type="monotone"
                            dataKey={`${acc.id}_pct`}
                            name={`${acc.id}_pct`}
                            stroke={color}
                            strokeWidth={2}
                            dot={{ r: 2.5, fill: color }}
                            activeDot={{ r: 5 }}
                          />
                        );
                      })}
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>

            {/* Daily P&L Distribution */}
            <div className="p-4 rounded-3xl border border-edge-border bg-edge-surface flex flex-col space-y-4 shadow-terminal">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Activity size={16} className="text-edge-accent" />
                  <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white">
                    DAILY REALIZED P&L
                  </h3>
                </div>

                {selectedAccountId === 'ALL' && (
                  <div className="flex rounded-full border border-edge-border bg-edge-surface-secondary p-0.5 font-mono text-[9px]">
                    <button
                      onClick={() => setDailyPnlMode('COMBINED')}
                      className={`px-2 py-0.5 rounded-full transition-colors ${
                        dailyPnlMode === 'COMBINED'
                          ? 'bg-edge-accent text-edge-bg font-bold'
                          : 'text-edge-text-secondary hover:text-white'
                      }`}
                    >
                      Combined
                    </button>
                    <button
                      onClick={() => setDailyPnlMode('BY_ACCOUNT')}
                      className={`px-2 py-0.5 rounded-full transition-colors ${
                        dailyPnlMode === 'BY_ACCOUNT'
                          ? 'bg-edge-accent text-edge-bg font-bold'
                          : 'text-edge-text-secondary hover:text-white'
                      }`}
                    >
                      By Account
                    </button>
                  </div>
                )}
              </div>

              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={bubbleDays.map((b) => ({
                      date: `${b.dayNum} ${b.monthStr}`,
                      pnl: b.dayNetPnl,
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#18202C" vertical={false} />
                    <XAxis dataKey="date" stroke="#5A687D" tick={{ fontSize: 10, fill: '#8B9BB4' }} />
                    <YAxis stroke="#5A687D" tick={{ fontSize: 10, fill: '#8B9BB4' }} tickFormatter={(val) => `$${val}`} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0A0D12',
                        borderColor: '#202A3A',
                        fontSize: '11px',
                        fontFamily: 'monospace',
                        borderRadius: '8px',
                      }}
                      formatter={(val: any) => [formatCur(Number(val)), 'Daily Net P&L']}
                    />
                    <Bar dataKey="pnl">
                      {bubbleDays.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.dayNetPnl >= 0 ? '#5BE6AE' : '#FF8F80'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useState, useMemo } from 'react';
import { useTrading } from '../context/TradingContext';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShieldAlert,
  PieChart,
  Activity,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Briefcase,
  Sliders,
  Eye,
  BarChart2,
  LineChart as LineChartIcon
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
  Cell,
  Legend
} from 'recharts';

const ACCOUNT_COLORS = [
  '#D99B26', // Amber / Gold
  '#10B981', // Emerald
  '#38BDF8', // Cyan / Sky Blue
  '#A855F7', // Purple
  '#F43F5E', // Rose
  '#FB923C', // Orange
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
  const [strategyFilter, setStrategyFilter] = useState<string>('ALL');
  const [directionFilter, setDirectionFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [sessionFilter, setSessionFilter] = useState<string>('ALL');

  // Graph Visualization Mode: Consolidated ($), Multi-Account Overlay ($), or Normalized Return (%)
  const [graphMode, setGraphMode] = useState<'CONSOLIDATED' | 'MULTI_OVERLAY' | 'NORMALIZED_PCT'>('CONSOLIDATED');
  const [hiddenAccounts, setHiddenAccounts] = useState<{ [accId: string]: boolean }>({});
  
  // Daily P&L Chart Mode: Total Combined vs By-Account Breakdown
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

    if (strategyFilter !== 'ALL') {
      list = list.filter((t) => t.strategyId === strategyFilter);
    }

    if (directionFilter !== 'ALL') {
      list = list.filter((t) => t.direction === directionFilter);
    }

    if (sessionFilter !== 'ALL') {
      list = list.filter((t) => t.session === sessionFilter);
    }

    return list;
  }, [filteredTrades, dateRange, instrumentFilter, strategyFilter, directionFilter, sessionFilter]);

  // Equity Curve Data: Tracks consolidated portfolio AND every single account independently
  const equityCurveData = useMemo(() => {
    const closed = dashboardTrades
      .filter((t) => t.status === 'CLOSED')
      .sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime());

    // Account initial running values
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

    closed.forEach((t) => {
      // Update each account
      t.allocations.forEach((alloc) => {
        if (runningPerAccount[alloc.accountId] !== undefined) {
          runningPerAccount[alloc.accountId] += alloc.netPnl;
        }
      });

      // Update total
      totalRunningEquity += t.netPnl;

      const dateLabel = new Date(t.entryTime).toLocaleDateString([], { month: 'short', day: 'numeric' });
      
      const point: any = {
        date: dateLabel,
        tradeName: `${t.instrumentSymbol} ${t.direction}`,
        equity: selectedAccount ? Math.round(runningPerAccount[selectedAccount.id] || selectedAccount.startingBalance) : Math.round(totalRunningEquity),
        netPnl: t.netPnl,
      };

      // Add individual account points
      accounts.forEach((acc) => {
        const currentAccEq = runningPerAccount[acc.id] || acc.startingBalance;
        point[acc.id] = Math.round(currentAccEq);
        const growthPct = ((currentAccEq - acc.startingBalance) / acc.startingBalance) * 100;
        point[`${acc.id}_pct`] = Math.round(growthPct * 100) / 100;
      });

      points.push(point);
    });

    return points;
  }, [dashboardTrades, accounts, selectedAccount]);

  // Daily P&L Chart Data: supports combined bar or multi-account breakdown
  const dailyPnlData = useMemo(() => {
    const closed = dashboardTrades.filter((t) => t.status === 'CLOSED');
    const dayMap: { [date: string]: { total: number; [accId: string]: number } } = {};

    closed.forEach((t) => {
      const d = (t.exitTime || t.createdAt).split('T')[0];
      if (!dayMap[d]) {
        dayMap[d] = { total: 0 };
        accounts.forEach((acc) => {
          dayMap[d][acc.id] = 0;
        });
      }

      t.allocations.forEach((alloc) => {
        if (dayMap[d][alloc.accountId] !== undefined) {
          dayMap[d][alloc.accountId] += alloc.netPnl;
        }
      });

      const effectivePnl = selectedAccountId === 'ALL'
        ? t.netPnl
        : (t.allocations.find((a) => a.accountId === selectedAccountId)?.netPnl || 0);

      dayMap[d].total += effectivePnl;
    });

    return Object.entries(dayMap).map(([date, data]) => {
      const res: any = {
        date: new Date(date).toLocaleDateString([], { month: 'short', day: 'numeric' }),
        pnl: Math.round(data.total),
      };
      accounts.forEach((acc) => {
        res[acc.id] = Math.round(data[acc.id] || 0);
      });
      return res;
    });
  }, [dashboardTrades, accounts, selectedAccountId]);

  // Instrument Breakdown Data
  const instrumentData = useMemo(() => {
    const map: { [sym: string]: { trades: number; pnl: number } } = {};
    dashboardTrades.forEach((t) => {
      if (!map[t.instrumentSymbol]) map[t.instrumentSymbol] = { trades: 0, pnl: 0 };
      map[t.instrumentSymbol].trades += 1;
      map[t.instrumentSymbol].pnl += t.netPnl;
    });

    return Object.entries(map).map(([symbol, data]) => ({
      symbol,
      trades: data.trades,
      pnl: Math.round(data.pnl),
    }));
  }, [dashboardTrades]);

  const toggleAccountVisibility = (accId: string) => {
    setHiddenAccounts((prev) => ({
      ...prev,
      [accId]: !prev[accId],
    }));
  };

  // Format currency
  const formatCur = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(val);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-edge-border">
        <div>
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-edge-accent" />
            <h1 className="text-xl font-mono font-bold tracking-tight text-white uppercase">
              PORTFOLIO INTELLIGENCE TERMINAL
            </h1>
          </div>
          <p className="text-xs text-edge-text-secondary mt-0.5 font-sans">
            Single-desk and multi-account comparative surveillance with live risk recalculation.
          </p>
        </div>

        {/* Dashboard Filters Bar */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          {/* Timeframe */}
          <div className="flex rounded border border-edge-border bg-edge-surface-secondary/70 p-0.5">
            {(['ALL', '30D', '7D'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`px-2.5 py-1 rounded text-[11px] transition-colors ${
                  dateRange === r
                    ? 'bg-edge-accent text-edge-bg font-bold'
                    : 'text-edge-text-secondary hover:text-white'
                }`}
              >
                {r === 'ALL' ? 'All Time' : r}
              </button>
            ))}
          </div>

          {/* Instrument Filter */}
          <select
            value={instrumentFilter}
            onChange={(e) => setInstrumentFilter(e.target.value)}
            className="px-2.5 py-1 rounded border border-edge-border bg-edge-surface-secondary text-edge-text-secondary text-[11px] focus:border-edge-accent outline-none"
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
            className="px-2.5 py-1 rounded border border-edge-border bg-edge-surface-secondary text-edge-text-secondary text-[11px] focus:border-edge-accent outline-none"
          >
            <option value="ALL">Buy & Sell</option>
            <option value="BUY">Longs Only</option>
            <option value="SELL">Shorts Only</option>
          </select>

          {/* Session Filter */}
          <select
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value)}
            className="px-2.5 py-1 rounded border border-edge-border bg-edge-surface-secondary text-edge-text-secondary text-[11px] focus:border-edge-accent outline-none"
          >
            <option value="ALL">All Sessions</option>
            <option value="London">London</option>
            <option value="New York">New York</option>
            <option value="Asian">Asian</option>
          </select>
        </div>
      </div>

      {/* Account Focus Bar: Direct Single Account vs Consolidated Switching */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-lg border border-edge-border bg-edge-surface text-xs font-mono">
        <div className="flex items-center space-x-2">
          <span className="text-[10px] text-edge-text-muted uppercase font-bold tracking-wider">
            Active Desk Focus:
          </span>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedAccountId('ALL')}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${
                selectedAccountId === 'ALL'
                  ? 'bg-edge-accent text-edge-bg shadow-subtle'
                  : 'bg-edge-surface-secondary text-edge-text-secondary hover:text-white border border-edge-border'
              }`}
            >
              All Desks (Consolidated)
            </button>

            {accounts.map((acc, idx) => {
              const isSelected = selectedAccountId === acc.id;
              const color = ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length];

              return (
                <button
                  key={acc.id}
                  onClick={() => setSelectedAccountId(acc.id)}
                  className={`flex items-center space-x-1.5 px-2.5 py-1 rounded text-[11px] font-semibold transition-all border ${
                    isSelected
                      ? 'bg-edge-surface-secondary text-white border-white shadow-glow'
                      : 'bg-edge-surface-secondary/50 text-edge-text-secondary hover:text-white border-edge-border'
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

        <div className="text-[11px] text-edge-text-muted">
          Showing:{' '}
          <span className="font-bold text-white">
            {selectedAccountId === 'ALL'
              ? `Consolidated Portfolio (${accounts.length} Accounts)`
              : selectedAccount?.name}
          </span>
        </div>
      </div>

      {/* Primary KPI Grid (14 Institutional Metrics) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {/* 1. Net P&L */}
        <div className="p-3 rounded-lg border border-edge-border bg-edge-surface/80 backdrop-blur-sm space-y-1">
          <span className="text-[10px] font-mono uppercase text-edge-text-muted">Total Net P&L</span>
          <div
            className={`text-base font-mono font-bold tabular-nums ${
              portfolioMetrics.netProfit >= 0 ? 'text-edge-profit' : 'text-edge-loss'
            }`}
          >
            {portfolioMetrics.netProfit >= 0 ? '+' : ''}
            {formatCur(portfolioMetrics.netProfit)}
          </div>
          <span className="text-[9px] font-mono text-edge-text-muted">
            Gross: {formatCur(portfolioMetrics.grossProfit)}
          </span>
        </div>

        {/* 2. Today's P&L */}
        <div className="p-3 rounded-lg border border-edge-border bg-edge-surface/80 backdrop-blur-sm space-y-1">
          <span className="text-[10px] font-mono uppercase text-edge-text-muted">Today P&L</span>
          <div
            className={`text-base font-mono font-bold tabular-nums ${
              portfolioMetrics.todayPnl >= 0 ? 'text-edge-profit' : 'text-edge-loss'
            }`}
          >
            {portfolioMetrics.todayPnl >= 0 ? '+' : ''}
            {formatCur(portfolioMetrics.todayPnl)}
          </div>
          <span className="text-[9px] font-mono text-edge-text-muted">Daily Close Active</span>
        </div>

        {/* 3. Win Rate */}
        <div className="p-3 rounded-lg border border-edge-border bg-edge-surface/80 backdrop-blur-sm space-y-1">
          <span className="text-[10px] font-mono uppercase text-edge-text-muted">Win Rate</span>
          <div className="text-base font-mono font-bold text-white tabular-nums">
            {portfolioMetrics.winRate.toFixed(1)}%
          </div>
          <span className="text-[9px] font-mono text-edge-text-muted">
            {portfolioMetrics.winningTrades}W / {portfolioMetrics.losingTrades}L
          </span>
        </div>

        {/* 4. Profit Factor */}
        <div className="p-3 rounded-lg border border-edge-border bg-edge-surface/80 backdrop-blur-sm space-y-1">
          <span className="text-[10px] font-mono uppercase text-edge-text-muted">Profit Factor</span>
          <div className="text-base font-mono font-bold text-edge-accent tabular-nums">
            {portfolioMetrics.profitFactor.toFixed(2)}
          </div>
          <span className="text-[9px] font-mono text-edge-text-muted">
            Loss: {formatCur(portfolioMetrics.grossLoss)}
          </span>
        </div>

        {/* 5. Average R */}
        <div className="p-3 rounded-lg border border-edge-border bg-edge-surface/80 backdrop-blur-sm space-y-1">
          <span className="text-[10px] font-mono uppercase text-edge-text-muted">Average R</span>
          <div className="text-base font-mono font-bold text-white tabular-nums">
            {portfolioMetrics.averageR > 0 ? '+' : ''}
            {portfolioMetrics.averageR.toFixed(2)}R
          </div>
          <span className="text-[9px] font-mono text-edge-text-muted">Realized Multiple</span>
        </div>

        {/* 6. Current Equity */}
        <div className="p-3 rounded-lg border border-edge-border bg-edge-surface/80 backdrop-blur-sm space-y-1">
          <span className="text-[10px] font-mono uppercase text-edge-text-muted">Total Equity</span>
          <div className="text-base font-mono font-bold text-white tabular-nums">
            {formatCur(portfolioMetrics.totalEquity)}
          </div>
          <span className="text-[9px] font-mono text-edge-text-muted">
            Bal: {formatCur(portfolioMetrics.totalBalance)}
          </span>
        </div>

        {/* 7. Max Drawdown */}
        <div className="p-3 rounded-lg border border-edge-border bg-edge-surface/80 backdrop-blur-sm space-y-1">
          <span className="text-[10px] font-mono uppercase text-edge-text-muted">Max Drawdown</span>
          <div className="text-base font-mono font-bold text-edge-loss tabular-nums">
            {portfolioMetrics.maxDrawdownPct.toFixed(1)}%
          </div>
          <span className="text-[9px] font-mono text-edge-text-muted">Trailing Peak Ref</span>
        </div>
      </div>

      {/* Secondary Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-xs font-mono bg-edge-surface-secondary/40 p-3 rounded-lg border border-edge-border/60">
        <div>
          <span className="text-[10px] text-edge-text-muted uppercase">Weekly P&L:</span>
          <div className={`font-semibold tabular-nums ${portfolioMetrics.weeklyPnl >= 0 ? 'text-edge-profit' : 'text-edge-loss'}`}>
            {portfolioMetrics.weeklyPnl >= 0 ? '+' : ''}{formatCur(portfolioMetrics.weeklyPnl)}
          </div>
        </div>
        <div>
          <span className="text-[10px] text-edge-text-muted uppercase">Monthly P&L:</span>
          <div className={`font-semibold tabular-nums ${portfolioMetrics.monthlyPnl >= 0 ? 'text-edge-profit' : 'text-edge-loss'}`}>
            {portfolioMetrics.monthlyPnl >= 0 ? '+' : ''}{formatCur(portfolioMetrics.monthlyPnl)}
          </div>
        </div>
        <div>
          <span className="text-[10px] text-edge-text-muted uppercase">Average Win:</span>
          <div className="font-semibold text-edge-profit tabular-nums">
            +{formatCur(portfolioMetrics.averageWin)}
          </div>
        </div>
        <div>
          <span className="text-[10px] text-edge-text-muted uppercase">Average Loss:</span>
          <div className="font-semibold text-edge-loss tabular-nums">
            -{formatCur(portfolioMetrics.averageLoss)}
          </div>
        </div>
        <div>
          <span className="text-[10px] text-edge-text-muted uppercase">Expectancy:</span>
          <div className="font-semibold text-white tabular-nums">
            {portfolioMetrics.expectancy >= 0 ? '+' : ''}{formatCur(portfolioMetrics.expectancy)}/tr
          </div>
        </div>
        <div>
          <span className="text-[10px] text-edge-text-muted uppercase">Open Risk:</span>
          <div className={`font-semibold tabular-nums ${portfolioMetrics.openRiskUsd > 0 ? 'text-edge-warning' : 'text-edge-text-muted'}`}>
            {formatCur(portfolioMetrics.openRiskUsd)}
          </div>
        </div>
      </div>

      {/* Main Charts: Cumulative Equity Curve & Daily P&L */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Equity Curve (2 cols) with Single Account & Multi-Account Overlay Modes */}
        <div className="lg:col-span-2 p-4 rounded-lg border border-edge-border bg-edge-surface flex flex-col space-y-4 shadow-terminal">
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

            {/* Graph Visualization Controls (Only when in All Accounts or to toggle % vs $) */}
            {selectedAccountId === 'ALL' && (
              <div className="flex rounded border border-edge-border bg-edge-surface-secondary p-0.5 font-mono text-[10px]">
                <button
                  onClick={() => setGraphMode('CONSOLIDATED')}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    graphMode === 'CONSOLIDATED'
                      ? 'bg-edge-accent text-edge-bg font-bold'
                      : 'text-edge-text-secondary hover:text-white'
                  }`}
                  title="Show single consolidated portfolio equity curve"
                >
                  Consolidated
                </button>
                <button
                  onClick={() => setGraphMode('MULTI_OVERLAY')}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    graphMode === 'MULTI_OVERLAY'
                      ? 'bg-edge-accent text-edge-bg font-bold'
                      : 'text-edge-text-secondary hover:text-white'
                  }`}
                  title="Plot all accounts on the same graph simultaneously in Dollars"
                >
                  Multi-Account ($)
                </button>
                <button
                  onClick={() => setGraphMode('NORMALIZED_PCT')}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    graphMode === 'NORMALIZED_PCT'
                      ? 'bg-edge-accent text-edge-bg font-bold'
                      : 'text-edge-text-secondary hover:text-white'
                  }`}
                  title="Plot all accounts starting at 0% for fair growth comparison"
                >
                  Normalized (%)
                </button>
              </div>
            )}
          </div>

          {/* Interactive Multi-Account Legend (when in overlay modes) */}
          {selectedAccountId === 'ALL' && graphMode !== 'CONSOLIDATED' && (
            <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-edge-border/40 font-mono text-[10px]">
              <span className="text-edge-text-muted uppercase">Toggle Curves:</span>
              {accounts.map((acc, idx) => {
                const color = ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length];
                const isHidden = hiddenAccounts[acc.id];

                return (
                  <button
                    key={acc.id}
                    onClick={() => toggleAccountVisibility(acc.id)}
                    className={`flex items-center space-x-1.5 px-2 py-0.5 rounded border transition-all ${
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
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {selectedAccountId !== 'ALL' || graphMode === 'CONSOLIDATED' ? (
                // 1. Single Account or Consolidated Area Curve
                <AreaChart data={equityCurveData}>
                  <defs>
                    <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#D99B26" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#D99B26" stopOpacity={0.0} />
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
                      borderRadius: '4px',
                    }}
                    formatter={(val: any) => [formatCur(Number(val)), selectedAccount ? selectedAccount.name : 'Portfolio Equity']}
                  />
                  <Area
                    type="monotone"
                    dataKey="equity"
                    name={selectedAccount ? selectedAccount.name : 'Total Equity'}
                    stroke="#D99B26"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#equityGrad)"
                  />
                </AreaChart>
              ) : graphMode === 'MULTI_OVERLAY' ? (
                // 2. Multi-Account Overlay Lines ($)
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
                      borderRadius: '4px',
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
                // 3. Normalized % Return Curves
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
                      borderRadius: '4px',
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
        <div className="p-4 rounded-lg border border-edge-border bg-edge-surface flex flex-col space-y-4 shadow-terminal">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Activity size={16} className="text-edge-accent" />
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white">
                DAILY REALIZED P&L
              </h3>
            </div>

            {selectedAccountId === 'ALL' && (
              <div className="flex rounded border border-edge-border bg-edge-surface-secondary p-0.5 font-mono text-[9px]">
                <button
                  onClick={() => setDailyPnlMode('COMBINED')}
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    dailyPnlMode === 'COMBINED'
                      ? 'bg-edge-accent text-edge-bg font-bold'
                      : 'text-edge-text-secondary hover:text-white'
                  }`}
                >
                  Combined
                </button>
                <button
                  onClick={() => setDailyPnlMode('BY_ACCOUNT')}
                  className={`px-1.5 py-0.5 rounded transition-colors ${
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

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {dailyPnlMode === 'COMBINED' || selectedAccountId !== 'ALL' ? (
                <BarChart data={dailyPnlData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#18202C" vertical={false} />
                  <XAxis dataKey="date" stroke="#5A687D" tick={{ fontSize: 10, fill: '#8B9BB4' }} />
                  <YAxis
                    stroke="#5A687D"
                    tick={{ fontSize: 10, fill: '#8B9BB4' }}
                    tickFormatter={(val) => `$${val}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0A0D12',
                      borderColor: '#202A3A',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      borderRadius: '4px',
                    }}
                    formatter={(val: any) => [formatCur(Number(val)), 'Daily Net P&L']}
                  />
                  <Bar dataKey="pnl">
                    {dailyPnlData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.pnl >= 0 ? '#10B981' : '#EF4444'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                <BarChart data={dailyPnlData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#18202C" vertical={false} />
                  <XAxis dataKey="date" stroke="#5A687D" tick={{ fontSize: 10, fill: '#8B9BB4' }} />
                  <YAxis
                    stroke="#5A687D"
                    tick={{ fontSize: 10, fill: '#8B9BB4' }}
                    tickFormatter={(val) => `$${val}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0A0D12',
                      borderColor: '#202A3A',
                      fontSize: '11px',
                      fontFamily: 'monospace',
                      borderRadius: '4px',
                    }}
                    formatter={(val: any, name: any) => [
                      formatCur(Number(val)),
                      accounts.find((a) => a.id === name)?.name || name,
                    ]}
                  />
                  {accounts.map((acc, idx) => (
                    <Bar
                      key={acc.id}
                      dataKey={acc.id}
                      name={acc.id}
                      fill={ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length]}
                    />
                  ))}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Grid: Instrument Performance & Recent Executions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Instrument Performance Breakdown */}
        <div className="p-4 rounded-lg border border-edge-border bg-edge-surface space-y-3 shadow-terminal">
          <div className="flex items-center space-x-2">
            <PieChart size={16} className="text-edge-accent" />
            <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white">
              INSTRUMENT PERFORMANCE
            </h3>
          </div>

          <div className="space-y-2 pt-1 font-mono text-xs">
            {instrumentData.map((item) => (
              <div
                key={item.symbol}
                className="flex items-center justify-between p-2 rounded bg-edge-surface-secondary/40 border border-edge-border/50"
              >
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-white">{item.symbol}</span>
                  <span className="text-[10px] text-edge-text-muted">({item.trades} trades)</span>
                </div>
                <span
                  className={`font-semibold tabular-nums ${
                    item.pnl >= 0 ? 'text-edge-profit' : 'text-edge-loss'
                  }`}
                >
                  {item.pnl >= 0 ? '+' : ''}
                  {formatCur(item.pnl)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Executions Ledger (2 cols) */}
        <div className="lg:col-span-2 p-4 rounded-lg border border-edge-border bg-edge-surface space-y-3 shadow-terminal">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Briefcase size={16} className="text-edge-accent" />
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white">
                RECENT TRADE EXECUTIONS
              </h3>
            </div>
            <span className="text-[10px] font-mono text-edge-text-muted">
              Showing last {Math.min(5, dashboardTrades.length)} trades
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-edge-border text-[10px] text-edge-text-muted uppercase">
                  <th className="py-2 px-3">Date</th>
                  <th className="py-2 px-3">Asset</th>
                  <th className="py-2 px-3">Side</th>
                  <th className="py-2 px-3">Entry / Exit</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3">Realized R</th>
                  <th className="py-2 px-3 text-right">Net P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge-border/40">
                {dashboardTrades.slice(0, 5).map((t) => (
                  <tr key={t.id} className="hover:bg-edge-surface-secondary/50 transition-colors">
                    <td className="py-2 px-3 text-edge-text-secondary text-[11px]">
                      {new Date(t.createdAt).toLocaleDateString([], { month: 'numeric', day: 'numeric' })}
                    </td>
                    <td className="py-2 px-3 font-bold text-white">
                      {t.instrumentSymbol}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          t.direction === 'BUY'
                            ? 'bg-edge-profit/15 text-edge-profit'
                            : 'bg-edge-loss/15 text-edge-loss'
                        }`}
                      >
                        {t.direction}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-edge-text-secondary tabular-nums">
                      {t.entryPrice.toLocaleString()} {t.exitTime ? `→ ${t.allocations[0]?.exitPrice || '-'}` : ''}
                    </td>
                    <td className="py-2 px-3">
                      <span className="text-[10px] text-edge-text-muted uppercase">
                        {t.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 tabular-nums font-semibold">
                      {t.status === 'CLOSED' ? `${t.realizedR > 0 ? '+' : ''}${t.realizedR}R` : '—'}
                    </td>
                    <td
                      className={`py-2 px-3 text-right tabular-nums font-bold ${
                        t.netPnl >= 0 ? 'text-edge-profit' : 'text-edge-loss'
                      }`}
                    >
                      {t.status === 'CLOSED'
                        ? `${t.netPnl >= 0 ? '+' : ''}${formatCur(t.netPnl)}`
                        : 'OPEN'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

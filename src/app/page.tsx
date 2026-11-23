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
  Briefcase
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  PieChart as RechartsPie,
  Pie
} from 'recharts';

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

  // Equity Curve Data
  const equityCurveData = useMemo(() => {
    const closed = dashboardTrades
      .filter((t) => t.status === 'CLOSED')
      .sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime());

    let runningEquity = selectedAccount ? selectedAccount.startingBalance : 175000;
    const points = [{ date: 'Start', equity: runningEquity, netPnl: 0 }];

    closed.forEach((t, idx) => {
      const pnl = selectedAccountId === 'ALL'
        ? t.netPnl
        : (t.allocations.find((a) => a.accountId === selectedAccountId)?.netPnl || 0);

      runningEquity += pnl;
      points.push({
        date: new Date(t.entryTime).toLocaleDateString([], { month: 'short', day: 'numeric' }),
        equity: Math.round(runningEquity),
        netPnl: pnl,
      });
    });

    return points;
  }, [dashboardTrades, selectedAccount, selectedAccountId]);

  // Daily P&L Chart Data
  const dailyPnlData = useMemo(() => {
    const closed = dashboardTrades.filter((t) => t.status === 'CLOSED');
    const dayMap: { [date: string]: number } = {};

    closed.forEach((t) => {
      const d = (t.exitTime || t.createdAt).split('T')[0];
      const pnl = selectedAccountId === 'ALL'
        ? t.netPnl
        : (t.allocations.find((a) => a.accountId === selectedAccountId)?.netPnl || 0);

      dayMap[d] = (dayMap[d] || 0) + pnl;
    });

    return Object.entries(dayMap).map(([date, pnl]) => ({
      date: new Date(date).toLocaleDateString([], { month: 'short', day: 'numeric' }),
      pnl: Math.round(pnl),
    }));
  }, [dashboardTrades, selectedAccountId]);

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
            Consolidated multi-account performance, execution variance, and live compliance surveillance.
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
        {/* Equity Curve (2 cols) */}
        <div className="lg:col-span-2 p-4 rounded-lg border border-edge-border bg-edge-surface flex flex-col space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <TrendingUp size={16} className="text-edge-accent" />
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white">
                CUMULATIVE PORTFOLIO EQUITY TRAJECTORY
              </h3>
            </div>
            <span className="text-[11px] font-mono text-edge-text-muted">
              Live Balance & PnL Compounding
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
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
                  formatter={(val: any) => [formatCur(Number(val)), 'Portfolio Equity']}
                />
                <Area
                  type="monotone"
                  dataKey="equity"
                  stroke="#D99B26"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#equityGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Daily P&L Distribution */}
        <div className="p-4 rounded-lg border border-edge-border bg-edge-surface flex flex-col space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Activity size={16} className="text-edge-accent" />
              <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-white">
                DAILY REALIZED P&L
              </h3>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
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
                  formatter={(val: any) => [formatCur(Number(val)), 'Daily P&L']}
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
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Grid: Instrument Performance & Recent Executions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Instrument Performance Breakdown */}
        <div className="p-4 rounded-lg border border-edge-border bg-edge-surface space-y-3">
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
        <div className="lg:col-span-2 p-4 rounded-lg border border-edge-border bg-edge-surface space-y-3">
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

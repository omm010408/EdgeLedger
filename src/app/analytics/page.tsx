'use client';

import React, { useMemo, useState } from 'react';
import { useTrading } from '../../context/TradingContext';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  PieChart as PieIcon,
  Compass,
  Calendar,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Lightbulb,
  CheckCircle,
  AlertTriangle,
  Wallet,
  ShieldCheck,
  Scale
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell
} from 'recharts';

const ACCOUNT_COLORS = [
  '#D99B26', // Gold / Amber
  '#10B981', // Emerald
  '#38BDF8', // Sky Blue
  '#A855F7', // Violet
  '#F43F5E', // Rose
  '#FB923C', // Orange
];

export default function AnalyticsPage() {
  const {
    accounts,
    selectedAccountId,
    setSelectedAccountId,
    selectedAccount,
    trades,
    filteredTrades,
    portfolioMetrics,
    instruments,
    strategies
  } = useTrading();

  const [compareMetric, setCompareMetric] = useState<'NET_PNL' | 'WIN_RATE' | 'RETURN_PCT'>('NET_PNL');

  const closedTrades = useMemo(() => {
    return filteredTrades.filter((t) => t.status === 'CLOSED');
  }, [filteredTrades]);

  // Multi-Account Comparative Statistics
  const accountComparisonStats = useMemo(() => {
    return accounts.map((acc, idx) => {
      const accTrades = trades.filter((t) =>
        t.allocations.some((a) => a.accountId === acc.id) && t.status === 'CLOSED'
      );

      let netPnl = 0;
      let grossProfit = 0;
      let grossLoss = 0;
      let wins = 0;

      accTrades.forEach((t) => {
        const alloc = t.allocations.find((a) => a.accountId === acc.id);
        if (alloc) {
          netPnl += alloc.netPnl;
          if (alloc.netPnl > 0) {
            wins++;
            grossProfit += alloc.netPnl;
          } else {
            grossLoss += Math.abs(alloc.netPnl);
          }
        }
      });

      const winRate = accTrades.length > 0 ? (wins / accTrades.length) * 100 : 0;
      const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? 99.9 : 0);
      const returnPct = ((acc.currentEquity - acc.startingBalance) / acc.startingBalance) * 100;
      const drawdown = Math.max(0, acc.highWaterMark - acc.currentEquity);
      const drawdownPct = acc.highWaterMark > 0 ? (drawdown / acc.highWaterMark) * 100 : 0;

      return {
        id: acc.id,
        name: acc.name,
        brokerOrFirm: acc.brokerOrFirm,
        accountType: acc.accountType,
        color: ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length],
        startingBalance: acc.startingBalance,
        currentEquity: acc.currentEquity,
        netPnl: Math.round(netPnl),
        returnPct: Math.round(returnPct * 100) / 100,
        tradesCount: accTrades.length,
        wins,
        losses: accTrades.length - wins,
        winRate: Math.round(winRate * 10) / 10,
        profitFactor: Math.round(profitFactor * 100) / 100,
        drawdown: Math.round(drawdown),
        drawdownPct: Math.round(drawdownPct * 10) / 10,
      };
    });
  }, [accounts, trades]);

  // Breakdown by Session
  const sessionBreakdown = useMemo(() => {
    const map: { [session: string]: { count: number; netPnl: number; wins: number } } = {};
    closedTrades.forEach((t) => {
      const s = t.session || 'London';
      if (!map[s]) map[s] = { count: 0, netPnl: 0, wins: 0 };
      map[s].count++;
      const pnl = selectedAccountId === 'ALL'
        ? t.netPnl
        : (t.allocations.find((a) => a.accountId === selectedAccountId)?.netPnl || 0);

      map[s].netPnl += pnl;
      if (pnl > 0) map[s].wins++;
    });

    return Object.entries(map).map(([session, data]) => ({
      session,
      count: data.count,
      netPnl: Math.round(data.netPnl),
      winRate: data.count > 0 ? Math.round((data.wins / data.count) * 100) : 0,
    }));
  }, [closedTrades, selectedAccountId]);

  // Breakdown by Direction (BUY vs SELL)
  const directionBreakdown = useMemo(() => {
    const buyTrades = closedTrades.filter((t) => t.direction === 'BUY');
    const sellTrades = closedTrades.filter((t) => t.direction === 'SELL');

    const getPnl = (t: any) =>
      selectedAccountId === 'ALL'
        ? t.netPnl
        : (t.allocations.find((a: any) => a.accountId === selectedAccountId)?.netPnl || 0);

    const buyWins = buyTrades.filter((t) => getPnl(t) > 0).length;
    const sellWins = sellTrades.filter((t) => getPnl(t) > 0).length;

    const buyPnl = buyTrades.reduce((sum, t) => sum + getPnl(t), 0);
    const sellPnl = sellTrades.reduce((sum, t) => sum + getPnl(t), 0);

    return {
      buy: {
        count: buyTrades.length,
        pnl: Math.round(buyPnl),
        winRate: buyTrades.length > 0 ? Math.round((buyWins / buyTrades.length) * 100) : 0,
      },
      sell: {
        count: sellTrades.length,
        pnl: Math.round(sellPnl),
        winRate: sellTrades.length > 0 ? Math.round((sellWins / sellTrades.length) * 100) : 0,
      },
    };
  }, [closedTrades, selectedAccountId]);

  // Breakdown by Day of Week
  const dayOfWeekBreakdown = useMemo(() => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const map: { [day: string]: { count: number; pnl: number } } = {
      Monday: { count: 0, pnl: 0 },
      Tuesday: { count: 0, pnl: 0 },
      Wednesday: { count: 0, pnl: 0 },
      Thursday: { count: 0, pnl: 0 },
      Friday: { count: 0, pnl: 0 },
    };

    closedTrades.forEach((t) => {
      const dayName = days[new Date(t.createdAt).getDay()];
      const pnl = selectedAccountId === 'ALL'
        ? t.netPnl
        : (t.allocations.find((a) => a.accountId === selectedAccountId)?.netPnl || 0);

      if (map[dayName]) {
        map[dayName].count++;
        map[dayName].pnl += pnl;
      }
    });

    return Object.entries(map).map(([day, data]) => ({
      day,
      count: data.count,
      pnl: Math.round(data.pnl),
    }));
  }, [closedTrades, selectedAccountId]);

  const recoveryFactor = portfolioMetrics.maxDrawdownPct > 0
    ? (portfolioMetrics.netProfit / ((portfolioMetrics.totalEquity * portfolioMetrics.maxDrawdownPct) / 100)).toFixed(2)
    : 'N/A';

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(val);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-edge-border">
        <div>
          <div className="flex items-center space-x-2">
            <BarChart3 size={20} className="text-edge-accent" />
            <h1 className="text-xl font-mono font-bold tracking-tight text-white uppercase">
              QUANTITATIVE PERFORMANCE INTELLIGENCE
            </h1>
          </div>
          <p className="text-xs text-edge-text-secondary mt-0.5 font-sans">
            Single-desk diagnostics and multi-account comparative performance intelligence.
          </p>
        </div>

        <div className="text-xs font-mono text-edge-text-muted">
          Sample: <span className="text-white font-bold">{closedTrades.length} Closed Trades</span>
        </div>
      </div>

      {/* Account Focus Switcher Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-lg border border-edge-border bg-edge-surface text-xs font-mono">
        <div className="flex items-center space-x-2">
          <span className="text-[10px] text-edge-text-muted uppercase font-bold tracking-wider">
            Analytics Scope:
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
              All Desks (Multi-Account Comparison)
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
          Viewing:{' '}
          <span className="font-bold text-white">
            {selectedAccountId === 'ALL' ? 'Multi-Account Comparative View' : selectedAccount?.name}
          </span>
        </div>
      </div>

      {/* MULTI-ACCOUNT COMPARATIVE MATRIX (When ALL Accounts selected) */}
      {selectedAccountId === 'ALL' && (
        <div className="p-5 rounded-lg border border-edge-border bg-edge-surface space-y-4 shadow-terminal font-mono">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-edge-border">
            <div className="flex items-center space-x-2">
              <Scale size={18} className="text-edge-accent" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-white">
                MULTI-ACCOUNT PERFORMANCE COMPARISON MATRIX
              </h2>
            </div>

            {/* Metric toggles for comparative chart */}
            <div className="flex rounded border border-edge-border bg-edge-surface-secondary p-0.5 text-[10px]">
              <button
                onClick={() => setCompareMetric('NET_PNL')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  compareMetric === 'NET_PNL'
                    ? 'bg-edge-accent text-edge-bg font-bold'
                    : 'text-edge-text-secondary hover:text-white'
                }`}
              >
                Net P&L ($)
              </button>
              <button
                onClick={() => setCompareMetric('RETURN_PCT')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  compareMetric === 'RETURN_PCT'
                    ? 'bg-edge-accent text-edge-bg font-bold'
                    : 'text-edge-text-secondary hover:text-white'
                }`}
              >
                Return (%)
              </button>
              <button
                onClick={() => setCompareMetric('WIN_RATE')}
                className={`px-2 py-0.5 rounded transition-colors ${
                  compareMetric === 'WIN_RATE'
                    ? 'bg-edge-accent text-edge-bg font-bold'
                    : 'text-edge-text-secondary hover:text-white'
                }`}
              >
                Win Rate (%)
              </button>
            </div>
          </div>

          {/* Account Comparison Bar Chart */}
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={accountComparisonStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#18202C" vertical={false} />
                <XAxis dataKey="name" stroke="#5A687D" tick={{ fontSize: 10, fill: '#8B9BB4' }} />
                <YAxis
                  stroke="#5A687D"
                  tick={{ fontSize: 10, fill: '#8B9BB4' }}
                  tickFormatter={(val) =>
                    compareMetric === 'NET_PNL'
                      ? `$${val}`
                      : `${val}%`
                  }
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0A0D12',
                    borderColor: '#202A3A',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                  }}
                  formatter={(val: any) => [
                    compareMetric === 'NET_PNL'
                      ? formatCurrency(Number(val))
                      : `${val}%`,
                    compareMetric === 'NET_PNL'
                      ? 'Net Realized P&L'
                      : compareMetric === 'RETURN_PCT'
                      ? 'Capital Growth (%)'
                      : 'Win Rate (%)',
                  ]}
                />
                <Bar
                  dataKey={
                    compareMetric === 'NET_PNL'
                      ? 'netPnl'
                      : compareMetric === 'RETURN_PCT'
                      ? 'returnPct'
                      : 'winRate'
                  }
                >
                  {accountComparisonStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Comparative Table */}
          <div className="overflow-x-auto pt-2 border-t border-edge-border/50">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-edge-border text-[10px] text-edge-text-muted uppercase">
                  <th className="py-2 px-2">Account Desk</th>
                  <th className="py-2 px-2">Starting Base</th>
                  <th className="py-2 px-2">Current Equity</th>
                  <th className="py-2 px-2">Net Realized P&L</th>
                  <th className="py-2 px-2">Growth %</th>
                  <th className="py-2 px-2">Win Rate</th>
                  <th className="py-2 px-2">Profit Factor</th>
                  <th className="py-2 px-2">Drawdown %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge-border/40 text-[11px]">
                {accountComparisonStats.map((acc) => (
                  <tr key={acc.id} className="hover:bg-edge-surface-secondary/40">
                    <td className="py-2 px-2">
                      <div className="flex items-center space-x-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: acc.color }}
                        />
                        <span className="font-bold text-white">{acc.name}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2 tabular-nums text-edge-text-secondary">
                      {formatCurrency(acc.startingBalance)}
                    </td>
                    <td className="py-2 px-2 tabular-nums font-semibold text-white">
                      {formatCurrency(acc.currentEquity)}
                    </td>
                    <td
                      className={`py-2 px-2 tabular-nums font-bold ${
                        acc.netPnl >= 0 ? 'text-edge-profit' : 'text-edge-loss'
                      }`}
                    >
                      {acc.netPnl >= 0 ? '+' : ''}{formatCurrency(acc.netPnl)}
                    </td>
                    <td
                      className={`py-2 px-2 tabular-nums font-bold ${
                        acc.returnPct >= 0 ? 'text-edge-profit' : 'text-edge-loss'
                      }`}
                    >
                      {acc.returnPct >= 0 ? '+' : ''}{acc.returnPct.toFixed(2)}%
                    </td>
                    <td className="py-2 px-2 tabular-nums">{acc.winRate.toFixed(1)}%</td>
                    <td className="py-2 px-2 tabular-nums text-edge-accent">{acc.profitFactor.toFixed(2)}</td>
                    <td className="py-2 px-2 tabular-nums text-edge-loss">{acc.drawdownPct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quantitative Ratio Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 font-mono text-xs">
        <div className="p-3 rounded-lg border border-edge-border bg-edge-surface space-y-1 shadow-terminal">
          <span className="text-[10px] text-edge-text-muted uppercase">Profit Factor</span>
          <div className="text-base font-bold text-edge-accent tabular-nums">
            {portfolioMetrics.profitFactor.toFixed(2)}
          </div>
          <span className="text-[9px] text-edge-text-muted">Gross W/L Ratio</span>
        </div>

        <div className="p-3 rounded-lg border border-edge-border bg-edge-surface space-y-1 shadow-terminal">
          <span className="text-[10px] text-edge-text-muted uppercase">Expectancy / Trade</span>
          <div className="text-base font-bold text-white tabular-nums">
            {portfolioMetrics.expectancy >= 0 ? '+' : ''}{formatCurrency(portfolioMetrics.expectancy)}
          </div>
          <span className="text-[9px] text-edge-text-muted">Mathematical Edge</span>
        </div>

        <div className="p-3 rounded-lg border border-edge-border bg-edge-surface space-y-1 shadow-terminal">
          <span className="text-[10px] text-edge-text-muted uppercase">Average Win</span>
          <div className="text-base font-bold text-edge-profit tabular-nums">
            +{formatCurrency(portfolioMetrics.averageWin)}
          </div>
          <span className="text-[9px] text-edge-text-muted">{portfolioMetrics.winningTrades} Winning Trades</span>
        </div>

        <div className="p-3 rounded-lg border border-edge-border bg-edge-surface space-y-1 shadow-terminal">
          <span className="text-[10px] text-edge-text-muted uppercase">Average Loss</span>
          <div className="text-base font-bold text-edge-loss tabular-nums">
            -{formatCurrency(portfolioMetrics.averageLoss)}
          </div>
          <span className="text-[9px] text-edge-text-muted">{portfolioMetrics.losingTrades} Losing Trades</span>
        </div>

        <div className="p-3 rounded-lg border border-edge-border bg-edge-surface space-y-1 shadow-terminal">
          <span className="text-[10px] text-edge-text-muted uppercase">Win / Loss Ratio</span>
          <div className="text-base font-bold text-white tabular-nums">
            {portfolioMetrics.averageLoss > 0
              ? (portfolioMetrics.averageWin / portfolioMetrics.averageLoss).toFixed(2)
              : 'N/A'}
            :1
          </div>
          <span className="text-[9px] text-edge-text-muted">Avg Win to Avg Loss</span>
        </div>

        <div className="p-3 rounded-lg border border-edge-border bg-edge-surface space-y-1 shadow-terminal">
          <span className="text-[10px] text-edge-text-muted uppercase">Recovery Factor</span>
          <div className="text-base font-bold text-white tabular-nums">
            {recoveryFactor}
          </div>
          <span className="text-[9px] text-edge-text-muted">Net Profit / Max DD</span>
        </div>
      </div>

      {/* Direction Asymmetry (BUY vs SELL) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-lg border border-edge-border bg-edge-surface space-y-3 font-mono shadow-terminal">
          <div className="flex items-center justify-between pb-2 border-b border-edge-border">
            <div className="flex items-center space-x-2">
              <ArrowUpRight size={16} className="text-edge-profit" />
              <h3 className="text-xs font-bold text-white uppercase">LONG (BUY) PERFORMANCE</h3>
            </div>
            <span className="text-[10px] text-edge-text-muted">{directionBreakdown.buy.count} Trades</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-[10px] text-edge-text-muted uppercase block">Net P&L</span>
              <span
                className={`text-base font-bold tabular-nums ${
                  directionBreakdown.buy.pnl >= 0 ? 'text-edge-profit' : 'text-edge-loss'
                }`}
              >
                {directionBreakdown.buy.pnl >= 0 ? '+' : ''}
                {formatCurrency(directionBreakdown.buy.pnl)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-edge-text-muted uppercase block">Win Rate</span>
              <span className="text-base font-bold text-white tabular-nums">
                {directionBreakdown.buy.winRate}%
              </span>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-lg border border-edge-border bg-edge-surface space-y-3 font-mono shadow-terminal">
          <div className="flex items-center justify-between pb-2 border-b border-edge-border">
            <div className="flex items-center space-x-2">
              <ArrowDownRight size={16} className="text-edge-loss" />
              <h3 className="text-xs font-bold text-white uppercase">SHORT (SELL) PERFORMANCE</h3>
            </div>
            <span className="text-[10px] text-edge-text-muted">{directionBreakdown.sell.count} Trades</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-[10px] text-edge-text-muted uppercase block">Net P&L</span>
              <span
                className={`text-base font-bold tabular-nums ${
                  directionBreakdown.sell.pnl >= 0 ? 'text-edge-profit' : 'text-edge-loss'
                }`}
              >
                {directionBreakdown.sell.pnl >= 0 ? '+' : ''}
                {formatCurrency(directionBreakdown.sell.pnl)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-edge-text-muted uppercase block">Win Rate</span>
              <span className="text-base font-bold text-white tabular-nums">
                {directionBreakdown.sell.winRate}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Session Breakdown & Day of Week Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Session Breakdown */}
        <div className="p-4 rounded-lg border border-edge-border bg-edge-surface space-y-3 font-mono shadow-terminal">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              TRADING SESSION EDGE
            </h3>
            <span className="text-[10px] text-edge-text-muted">London / NY / Asia</span>
          </div>

          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sessionBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="#18202C" vertical={false} />
                <XAxis dataKey="session" stroke="#5A687D" tick={{ fontSize: 10, fill: '#8B9BB4' }} />
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
                  }}
                  formatter={(val: any) => [formatCurrency(Number(val)), 'Net P&L']}
                />
                <Bar dataKey="netPnl">
                  {sessionBreakdown.map((entry, idx) => (
                    <Cell
                      key={`cell-${idx}`}
                      fill={entry.netPnl >= 0 ? '#10B981' : '#EF4444'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Day of Week Breakdown */}
        <div className="p-4 rounded-lg border border-edge-border bg-edge-surface space-y-3 font-mono shadow-terminal">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              DAY OF WEEK PERFORMANCE
            </h3>
            <span className="text-[10px] text-edge-text-muted">Mon - Fri Variance</span>
          </div>

          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dayOfWeekBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="#18202C" vertical={false} />
                <XAxis dataKey="day" stroke="#5A687D" tick={{ fontSize: 10, fill: '#8B9BB4' }} />
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
                  }}
                  formatter={(val: any) => [formatCurrency(Number(val)), 'Net P&L']}
                />
                <Bar dataKey="pnl">
                  {dayOfWeekBreakdown.map((entry, idx) => (
                    <Cell
                      key={`day-${idx}`}
                      fill={entry.pnl >= 0 ? '#10B981' : '#EF4444'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

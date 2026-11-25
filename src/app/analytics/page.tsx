'use client';

import React, { useMemo, useState } from 'react';
import { useTrading } from '../../context/TradingContext';
import { TradingAccount, Trade } from '../../lib/types/financial';

type CompareMode = 'net' | 'ret' | 'win';

function getAccountDotColor(acc: TradingAccount, index: number): string {
  const idLower = acc.id.toLowerCase();
  const nameLower = acc.name.toLowerCase();
  if (idLower.includes('apex') || nameLower.includes('apex')) return 'var(--tw-a-apex)';
  if (idLower.includes('ftmo') || nameLower.includes('ftmo')) return 'var(--tw-a-ftmo)';
  if (idLower.includes('ic') || nameLower.includes('ic markets')) return 'var(--tw-a-ic)';
  const fallback = ['var(--tw-a-apex)', 'var(--tw-a-ftmo)', 'var(--tw-a-ic)', 'var(--tw-s3)', 'var(--tw-s2)'];
  return fallback[index % fallback.length];
}

function getShortDeskLabel(acc: TradingAccount): string {
  const nameLower = acc.name.toLowerCase();
  if (nameLower.includes('apex')) return 'Apex 100K';
  if (nameLower.includes('ftmo')) return 'FTMO 50K';
  if (nameLower.includes('ic markets')) return 'IC Markets';
  return acc.name;
}

export default function AnalyticsPage() {
  const {
    accounts,
    selectedAccountId,
    setSelectedAccountId,
    selectedAccount,
    trades,
    filteredTrades,
    portfolioMetrics,
    isPnlHidden,
  } = useTrading();

  const [compareMode, setCompareMode] = useState<CompareMode>('net');

  const formatSignedCurrency = (val: number) => {
    if (isPnlHidden) return `${val < 0 ? '−' : '+'}$••••••`;
    const abs = Math.abs(val).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    if (val === 0) return '$0.00';
    return `${val < 0 ? '−' : '+'}$${abs}`;
  };

  const formatCurrency = (val: number) => {
    if (isPnlHidden) return '$••••••';
    return `$${val.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const closedTrades = useMemo(
    () => filteredTrades.filter((t) => t.status === 'CLOSED'),
    [filteredTrades]
  );

  const getScopedTradePnl = (t: Trade) =>
    selectedAccountId === 'ALL'
      ? t.netPnl
      : t.allocations.find((a) => a.accountId === selectedAccountId)?.netPnl || 0;

  // Per-account comparative statistics across all live accounts
  const accountComparisonStats = useMemo(() => {
    return accounts.map((acc, idx) => {
      const accTrades = trades.filter(
        (t) => t.status === 'CLOSED' && t.allocations.some((a) => a.accountId === acc.id)
      );

      let netPnl = 0;
      let grossProfit = 0;
      let grossLoss = 0;
      let wins = 0;

      accTrades.forEach((t) => {
        const alloc = t.allocations.find((a) => a.accountId === acc.id);
        if (!alloc) return;
        netPnl += alloc.netPnl;
        if (alloc.netPnl > 0) {
          wins++;
          grossProfit += alloc.netPnl;
        } else if (alloc.netPnl < 0) {
          grossLoss += Math.abs(alloc.netPnl);
        }
      });

      const winRate = accTrades.length > 0 ? (wins / accTrades.length) * 100 : 0;
      const hasNoLosses = grossLoss === 0 && grossProfit > 0;
      const profitFactor =
        grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
      const returnPct =
        acc.startingBalance > 0
          ? ((acc.currentEquity - acc.startingBalance) / acc.startingBalance) * 100
          : 0;
      const drawdown = Math.max(0, acc.highWaterMark - acc.currentEquity);
      const drawdownPct =
        acc.highWaterMark > 0 ? (drawdown / acc.highWaterMark) * 100 : 0;

      return {
        id: acc.id,
        name: acc.name,
        shortLabel: getShortDeskLabel(acc),
        color: getAccountDotColor(acc, idx),
        startingBalance: acc.startingBalance,
        currentEquity: acc.currentEquity,
        netPnl: Math.round(netPnl * 100) / 100,
        returnPct: Math.round(returnPct * 100) / 100,
        winRate: Math.round(winRate * 10) / 10,
        profitFactor,
        hasNoLosses,
        drawdownPct: Math.round(drawdownPct * 10) / 10,
        equityDelta: acc.currentEquity - acc.startingBalance,
      };
    });
  }, [accounts, trades]);

  const visibleComparisonStats = useMemo(() => {
    if (selectedAccountId === 'ALL') return accountComparisonStats;
    return accountComparisonStats.filter((a) => a.id === selectedAccountId);
  }, [accountComparisonStats, selectedAccountId]);

  // Real-time reconciliation checks
  const reconciliationNotes = useMemo(() => {
    const notes: string[] = [];
    const allClosed = trades.filter((t) => t.status === 'CLOSED');
    const consolidatedNet = allClosed.reduce((sum, t) => sum + t.netPnl, 0);
    const deskAllocationSum = accountComparisonStats.reduce((sum, a) => sum + a.netPnl, 0);
    const netGap = consolidatedNet - deskAllocationSum;

    if (selectedAccountId === 'ALL' && Math.abs(netGap) >= 0.01) {
      notes.push(
        `Per-desk net sums to ${formatSignedCurrency(deskAllocationSum)}. Totals use ${formatSignedCurrency(consolidatedNet)}. Gap: ${formatCurrency(Math.abs(netGap))}.`
      );
    }

    const scopedStats =
      selectedAccountId === 'ALL'
        ? accountComparisonStats
        : accountComparisonStats.filter((a) => a.id === selectedAccountId);

    scopedStats.forEach((desk) => {
      const expected = desk.startingBalance + desk.netPnl;
      if (Math.abs(expected - desk.currentEquity) >= 0.01) {
        notes.push(
          `${desk.shortLabel}: ${formatCurrency(desk.startingBalance)} ${desk.netPnl >= 0 ? '+' : '−'} ${formatCurrency(Math.abs(desk.netPnl))} net ≠ ${formatCurrency(desk.currentEquity)} equity.`
        );
      }
    });

    return notes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades, accountComparisonStats, selectedAccountId, isPnlHidden]);

  // Direction breakdown (Long vs Short)
  const directionStats = useMemo(() => {
    const longs = closedTrades.filter((t) => t.direction === 'BUY');
    const shorts = closedTrades.filter((t) => t.direction === 'SELL');

    const longPnl = longs.reduce((sum, t) => sum + getScopedTradePnl(t), 0);
    const shortPnl = shorts.reduce((sum, t) => sum + getScopedTradePnl(t), 0);

    const longWins = longs.filter((t) => getScopedTradePnl(t) > 0).length;
    const shortWins = shorts.filter((t) => getScopedTradePnl(t) > 0).length;

    return {
      totalNet: longPnl + shortPnl,
      totalWins: longWins + shortWins,
      totalCount: closedTrades.length,
      longCount: longs.length,
      longPnl,
      longWinRate: longs.length > 0 ? Math.round((longWins / longs.length) * 100) : 0,
      shortCount: shorts.length,
      shortPnl,
      shortWinRate: shorts.length > 0 ? Math.round((shortWins / shorts.length) * 100) : 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closedTrades, selectedAccountId]);

  // KPI metrics scoped cleanly
  const kpiStats = useMemo(() => {
    let grossWin = 0;
    let grossLoss = 0;
    let wins = 0;
    let losses = 0;

    closedTrades.forEach((t) => {
      const pnl = getScopedTradePnl(t);
      if (pnl > 0) {
        grossWin += pnl;
        wins++;
      } else if (pnl < 0) {
        grossLoss += Math.abs(pnl);
        losses++;
      }
    });

    const net = grossWin - grossLoss;
    const count = closedTrades.length;
    const avgWin = wins > 0 ? grossWin / wins : 0;
    const avgLoss = losses > 0 ? grossLoss / losses : 0;
    const expectancy = count > 0 ? net / count : 0;
    const profitFactor =
      grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : grossWin > 0 ? '∞' : '0.00';
    const winLossRatio =
      avgLoss > 0 ? `${(avgWin / avgLoss).toFixed(2)}:1` : avgWin > 0 ? '∞:1' : '0.00:1';

    const maxDdDollars =
      (portfolioMetrics.totalEquity * portfolioMetrics.maxDrawdownPct) / 100;
    const recoveryFactor =
      maxDdDollars > 0
        ? (net / maxDdDollars).toFixed(2)
        : net > 0
        ? 'No DD'
        : '0.00';

    return {
      net,
      wins,
      losses,
      avgWin,
      avgLoss,
      expectancy,
      profitFactor,
      winLossRatio,
      recoveryFactor,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closedTrades, selectedAccountId, portfolioMetrics]);

  // Session breakdown
  const sessionColumns = useMemo(() => {
    const order = ['London', 'New York', 'Asia'];
    const map: Record<string, { pnl: number; hasHtfSwing: boolean }> = {};

    closedTrades.forEach((t) => {
      const sess = t.session || 'London';
      if (!map[sess]) map[sess] = { pnl: 0, hasHtfSwing: false };
      map[sess].pnl += getScopedTradePnl(t);
      if (t.strategyId === 'strat-htf-orderflow') {
        map[sess].hasHtfSwing = true;
      }
    });

    const entries = Object.entries(map).sort((a, b) => {
      const ia = order.indexOf(a[0]);
      const ib = order.indexOf(b[0]);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    const maxAbs = Math.max(1, ...entries.map(([, v]) => Math.abs(v.pnl)));

    return {
      maxAbs,
      hasHtfInNy: Boolean(map['New York']?.hasHtfSwing),
      items: entries.map(([name, v], idx) => ({
        name,
        pnl: v.pnl,
        color:
          name === 'London'
            ? 'var(--tw-s1)'
            : name === 'New York'
            ? 'var(--tw-s2)'
            : STRATEGY_COLOR_FALLBACK(idx),
        heightPct: Math.max(2, Math.round((Math.abs(v.pnl) / maxAbs) * 84)),
      })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closedTrades, selectedAccountId]);

  // Weekday breakdown (Mon-Fri using UTC day of closed entry/execution so dates stay deterministic)
  const weekdayColumns = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const totals: Record<string, number> = {
      Mon: 0,
      Tue: 0,
      Wed: 0,
      Thu: 0,
      Fri: 0,
    };

    closedTrades.forEach((t) => {
      const d = new Date(t.createdAt);
      const utcDay = d.getUTCDay(); // 0=Sun..6=Sat
      const idx = utcDay - 1;
      if (idx >= 0 && idx < 5) {
        totals[days[idx]] += getScopedTradePnl(t);
      }
    });

    const maxAbs = Math.max(1, ...Object.values(totals).map((v) => Math.abs(v)));

    return days.map((day) => {
      const pnl = totals[day];
      return {
        day,
        pnl,
        heightPct: pnl === 0 ? 1 : Math.max(4, Math.round((Math.abs(pnl) / maxAbs) * 84)),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closedTrades, selectedAccountId]);

  // Horizontal divergence chart scale
  const matrixScale = useMemo(() => {
    if (compareMode === 'net') {
      const vals = accountComparisonStats.map((a) => a.netPnl);
      const min = Math.min(-500, ...vals);
      const max = Math.max(1000, ...vals) * 1.08;
      return {
        min,
        max,
        label: 'Net realized P&L ($)',
        format: (v: number) => formatSignedCurrency(v),
        getValue: (a: (typeof accountComparisonStats)[number]) => a.netPnl,
      };
    }
    if (compareMode === 'ret') {
      const vals = accountComparisonStats.map((a) => a.returnPct);
      const min = Math.min(0, ...vals);
      return {
        min,
        max: Math.max(10, ...vals.map((x) => Math.ceil(x * 1.15))),
        label: 'Growth on starting base (%)',
        format: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`,
        getValue: (a: (typeof accountComparisonStats)[number]) => a.returnPct,
      };
    }
    return {
      min: 0,
      max: 100,
      label: 'Win rate (%)',
      format: (v: number) => `${v.toFixed(1)}%`,
      getValue: (a: (typeof accountComparisonStats)[number]) => a.winRate,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareMode, accountComparisonStats, isPnlHidden]);

  const pctOnScale = (x: number) => {
    const span = Math.max(1, matrixScale.max - matrixScale.min);
    return Math.min(100, Math.max(0, ((x - matrixScale.min) / span) * 100));
  };

  const zeroPct = pctOnScale(0);
  const overallWinRatePct =
    directionStats.totalCount > 0
      ? ((directionStats.totalWins / directionStats.totalCount) * 100).toFixed(1)
      : '0.0';

  return (
    <div className="tw-page-wrap">
      {/* Page Header */}
      <section className="tw-page-head">
        <div>
          <div className="tw-eyebrow">Analytics · single desk and multi-account</div>
          <h1 className="tw-page-title">Quantitative performance</h1>
          <p className="tw-page-lede">
            Diagnostics and comparison across desks. Every figure states its sample and source.
          </p>
        </div>
        <span className="tw-sample-pill">
          Sample: {closedTrades.length} closed {closedTrades.length === 1 ? 'trade' : 'trades'}
        </span>
      </section>

      <main className="tw-bento-12">
        {/* Analytics Scope Bar */}
        <div className="tw-bento-tile tw-ana-scope" aria-label="Scope">
          <div className="tw-pill-seg" role="group" aria-label="Analytics scope">
            <button
              type="button"
              aria-pressed={selectedAccountId === 'ALL'}
              onClick={() => setSelectedAccountId('ALL')}
            >
              All desks
            </button>
            {accounts.map((acc, idx) => (
              <button
                key={acc.id}
                type="button"
                aria-pressed={selectedAccountId === acc.id}
                onClick={() => setSelectedAccountId(acc.id)}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                  style={{ background: getAccountDotColor(acc, idx) }}
                />
                <span>{getShortDeskLabel(acc)}</span>
              </button>
            ))}
          </div>

          <span
            className="font-mono text-[13px]"
            style={{ color: 'var(--tw-ink-3)' }}
          >
            Viewing: {selectedAccountId === 'ALL' ? 'multi-account comparison' : selectedAccount?.name}
          </span>
        </div>

        {/* Hero + Reconciliation Card */}
        <article className="tw-bento-tile tw-ana-hero tw-ana-span8">
          <div>
            <div className="tw-alab">
              Net realized ·{' '}
              {selectedAccountId === 'ALL' || !selectedAccount
                ? 'all desks'
                : getShortDeskLabel(selectedAccount)}
            </div>
            <div className="tw-abig">{formatSignedCurrency(directionStats.totalNet)}</div>
            <p>
              Win rate {overallWinRatePct}% ({directionStats.totalWins} of {directionStats.totalCount}). Long{' '}
              {formatSignedCurrency(directionStats.longPnl)} across {directionStats.longCount}{' '}
              {directionStats.longCount === 1 ? 'trade' : 'trades'}; short{' '}
              {formatSignedCurrency(directionStats.shortPnl)} from {directionStats.shortCount}{' '}
              {directionStats.shortCount === 1 ? 'trade' : 'trades'}.
            </p>
          </div>

          <div className={`tw-ana-recon ${reconciliationNotes.length === 0 ? 'clean' : ''}`}>
            <h3>
              {reconciliationNotes.length > 0
                ? 'Totals do not reconcile'
                : 'Ledger & equity reconciled'}
            </h3>
            {reconciliationNotes.length > 0 ? (
              <ul>
                {reconciliationNotes.map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] m-0" style={{ color: 'var(--tw-ink-2)' }}>
                Per-desk closed allocations match account balances and consolidated totals.
              </p>
            )}
          </div>
        </article>

        {/* Chart Metric Toggle Card */}
        <article className="tw-bento-tile tw-ana-span4" aria-label="Chart controls">
          <div className="tw-eyebrow !mb-2">Metric</div>
          <div className="tw-pill-seg w-full mt-2" role="group" aria-label="Chart metric">
            <button
              type="button"
              className="flex-1 justify-center"
              aria-pressed={compareMode === 'net'}
              onClick={() => setCompareMode('net')}
            >
              Net P&amp;L
            </button>
            <button
              type="button"
              className="flex-1 justify-center"
              aria-pressed={compareMode === 'ret'}
              onClick={() => setCompareMode('ret')}
            >
              Return
            </button>
            <button
              type="button"
              className="flex-1 justify-center"
              aria-pressed={compareMode === 'win'}
              onClick={() => setCompareMode('win')}
            >
              Win rate
            </button>
          </div>
          <p className="text-xs mt-3 leading-relaxed" style={{ color: 'var(--tw-ink-3)' }}>
            Bars are drawn from the zero line. Net and return use their own scales.
          </p>
        </article>

        {/* Multi-Account Comparison Matrix */}
        <article className="tw-bento-tile tw-ana-span12">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-semibold m-0 mb-1" style={{ color: 'var(--tw-ink)' }}>
                Multi-account comparison
              </h2>
              <span className="tw-eyebrow !mb-0">{matrixScale.label}</span>
            </div>
          </div>

          {/* Horizontal Zero-Origin Rail Chart */}
          <div className="tw-ana-rows">
            {visibleComparisonStats.map((desk) => {
              const v = matrixScale.getValue(desk);
              const valPct = pctOnScale(v);
              const left = Math.min(zeroPct, valPct);
              const width = Math.max(1.2, Math.abs(valPct - zeroPct));

              return (
                <div key={desk.id} className="tw-ana-row">
                  <div className="tw-anm">
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                      style={{ background: desk.color }}
                    />
                    <span className="truncate">{desk.name}</span>
                  </div>
                  <div
                    className="tw-ana-rail"
                    role="img"
                    aria-label={`${desk.name}: ${matrixScale.format(v)}`}
                  >
                    <span className="tw-ana-zero" style={{ left: `${zeroPct}%` }} />
                    <span
                      className="tw-ana-bar"
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        background: desk.color,
                      }}
                    />
                  </div>
                  <div
                    className="tw-aval"
                    style={{ color: v < 0 ? 'var(--tw-loss)' : 'var(--tw-ink)' }}
                  >
                    {matrixScale.format(v)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desk Breakdown Table */}
          <div className="tw-ana-table-wrap">
            <table className="tw-ana-table">
              <thead>
                <tr>
                  <th>Account desk</th>
                  <th>Starting base</th>
                  <th>Current equity</th>
                  <th>Net realized</th>
                  <th>Growth</th>
                  <th>Win rate</th>
                  <th>Profit factor</th>
                  <th>Drawdown</th>
                </tr>
              </thead>
              <tbody>
                {visibleComparisonStats.map((desk) => (
                  <tr key={desk.id} className="hover:bg-black/[0.02] dark:hover:bg-white/[0.02]">
                    <td>
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block mr-2 align-middle"
                        style={{ background: desk.color }}
                      />
                      {desk.name}
                    </td>
                    <td style={{ color: 'var(--tw-ink-3)' }}>
                      {formatCurrency(desk.startingBalance)}
                    </td>
                    <td>{formatCurrency(desk.currentEquity)}</td>
                    <td
                      style={{
                        color:
                          desk.netPnl > 0
                            ? 'var(--tw-gain)'
                            : desk.netPnl < 0
                            ? 'var(--tw-loss)'
                            : 'var(--tw-ink)',
                      }}
                    >
                      {formatSignedCurrency(desk.netPnl)}
                    </td>
                    <td
                      style={{
                        color: desk.returnPct >= 0 ? 'var(--tw-gain)' : 'var(--tw-loss)',
                      }}
                    >
                      {desk.returnPct >= 0 ? '+' : ''}
                      {desk.returnPct.toFixed(2)}%
                    </td>
                    <td>{desk.winRate.toFixed(1)}%</td>
                    <td
                      style={{
                        color: desk.hasNoLosses ? 'var(--tw-ink-3)' : 'var(--tw-ink)',
                      }}
                    >
                      {desk.hasNoLosses
                        ? 'No losing trades'
                        : Number.isFinite(desk.profitFactor)
                        ? desk.profitFactor.toFixed(2)
                        : '0.00'}
                    </td>
                    <td
                      style={{
                        color: desk.drawdownPct > 0 ? 'var(--tw-loss)' : 'var(--tw-ink-3)',
                      }}
                    >
                      {desk.drawdownPct.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs mt-3 mb-0" style={{ color: 'var(--tw-ink-3)' }}>
            Profit factor shows &ldquo;No losing trades&rdquo; where a desk has no losses, instead of a capped 99.90.
          </p>
        </article>

        {/* 6 Quantitative KPI Strip */}
        <div className="tw-ana-kpis">
          <article className="tw-bento-tile tw-ana-kpi">
            <div className="tw-eyebrow !mb-0">Profit factor</div>
            <div className="tw-kv" style={{ color: 'var(--tw-warn)' }}>
              {kpiStats.profitFactor}
            </div>
            <div className="tw-ks">Gross win ÷ gross loss</div>
          </article>

          <article className="tw-bento-tile tw-ana-kpi">
            <div className="tw-eyebrow !mb-0">Expectancy / trade</div>
            <div
              className="tw-kv"
              style={{
                color: kpiStats.expectancy >= 0 ? 'var(--tw-gain)' : 'var(--tw-loss)',
              }}
            >
              {formatSignedCurrency(kpiStats.expectancy)}
            </div>
            <div className="tw-ks">
              {formatCurrency(Math.abs(kpiStats.net))} ÷ {closedTrades.length}{' '}
              {closedTrades.length === 1 ? 'trade' : 'trades'}
            </div>
          </article>

          <article className="tw-bento-tile tw-ana-kpi">
            <div className="tw-eyebrow !mb-0">Average win</div>
            <div className="tw-kv" style={{ color: 'var(--tw-gain)' }}>
              {formatSignedCurrency(kpiStats.avgWin)}
            </div>
            <div className="tw-ks">
              {kpiStats.wins} winning {kpiStats.wins === 1 ? 'trade' : 'trades'}
            </div>
          </article>

          <article className="tw-bento-tile tw-ana-kpi">
            <div className="tw-eyebrow !mb-0">Average loss</div>
            <div className="tw-kv" style={{ color: 'var(--tw-loss)' }}>
              {kpiStats.avgLoss > 0 ? formatSignedCurrency(-kpiStats.avgLoss) : '$0.00'}
            </div>
            <div className="tw-ks">
              {kpiStats.losses} losing {kpiStats.losses === 1 ? 'trade' : 'trades'}
            </div>
          </article>

          <article className="tw-bento-tile tw-ana-kpi">
            <div className="tw-eyebrow !mb-0">Win / loss ratio</div>
            <div className="tw-kv">{kpiStats.winLossRatio}</div>
            <div className="tw-ks">Average win ÷ average loss</div>
          </article>

          <article className="tw-bento-tile tw-ana-kpi">
            <div className="tw-eyebrow !mb-0">Recovery factor</div>
            <div className="tw-kv">{kpiStats.recoveryFactor}</div>
            <div className="tw-ks">Net profit ÷ max drawdown</div>
          </article>
        </div>

        {/* Direction Breakdown: Long vs Short */}
        <article className="tw-bento-tile tw-ana-span6">
          <div className="tw-eyebrow !mb-1">Direction</div>
          <h2 className="text-base font-semibold m-0" style={{ color: 'var(--tw-ink)' }}>
            Long vs short
          </h2>
          <div className="tw-ana-split">
            <div className="tw-ana-metric">
              <div>
                <small>
                  Long · {directionStats.longCount}{' '}
                  {directionStats.longCount === 1 ? 'trade' : 'trades'}
                </small>
                <strong
                  style={{
                    color:
                      directionStats.longPnl >= 0 ? 'var(--tw-gain)' : 'var(--tw-loss)',
                  }}
                >
                  {formatSignedCurrency(directionStats.longPnl)}
                </strong>
              </div>
              <div>
                <small>Win rate</small>
                <strong>{directionStats.longWinRate}%</strong>
              </div>
            </div>

            <div className="tw-ana-metric">
              <div>
                <small>
                  Short · {directionStats.shortCount}{' '}
                  {directionStats.shortCount === 1 ? 'trade' : 'trades'}
                </small>
                <strong
                  style={{
                    color:
                      directionStats.shortPnl >= 0 ? 'var(--tw-gain)' : 'var(--tw-loss)',
                  }}
                >
                  {formatSignedCurrency(directionStats.shortPnl)}
                </strong>
              </div>
              <div>
                <small>Win rate</small>
                <strong>{directionStats.shortWinRate}%</strong>
              </div>
            </div>
          </div>
        </article>

        {/* Session Performance Column Chart */}
        <article className="tw-bento-tile tw-ana-span6">
          <div className="tw-eyebrow !mb-1">Session</div>
          <h2 className="text-base font-semibold m-0" style={{ color: 'var(--tw-ink)' }}>
            Net by session
          </h2>

          <div className="tw-ana-cols">
            {sessionColumns.items.map((col) => (
              <div key={col.name} className="tw-ana-col">
                <span className="tw-cv">{formatSignedCurrency(col.pnl)}</span>
                <div
                  className="tw-cb"
                  style={{
                    height: `${col.heightPct}%`,
                    background: col.pnl < 0 ? 'var(--tw-loss)' : col.color,
                  }}
                />
                <span className="tw-cc">{col.name}</span>
              </div>
            ))}
            {sessionColumns.items.length === 0 && (
              <div className="w-full text-center text-xs pb-6" style={{ color: 'var(--tw-ink-3)' }}>
                No closed session trades for selected scope.
              </div>
            )}
          </div>

          <p className="text-xs mt-3 mb-0" style={{ color: 'var(--tw-ink-3)' }}>
            {sessionColumns.hasHtfInNy
              ? 'New York includes HTF Orderflow (+$3,270.00), a swing strategy with no session. Confirm the attribution rule.'
              : 'Session attribution is grouped from each closed execution session tag.'}
          </p>
        </article>

        {/* Calendar / Weekday Performance Column Chart */}
        <article className="tw-bento-tile tw-ana-span12">
          <div className="tw-eyebrow !mb-1">Calendar</div>
          <h2 className="text-base font-semibold m-0" style={{ color: 'var(--tw-ink)' }}>
            Net by weekday (computed from closed trades)
          </h2>

          <div className="tw-ana-cols">
            {weekdayColumns.map((col) => (
              <div key={col.day} className="tw-ana-col">
                <span className="tw-cv">
                  {col.pnl === 0 ? '$0' : formatSignedCurrency(col.pnl)}
                </span>
                <div
                  className="tw-cb"
                  style={{
                    height: `${col.heightPct}%`,
                    background:
                      col.pnl < 0
                        ? 'var(--tw-loss)'
                        : col.pnl === 0
                        ? 'var(--tw-line-strong)'
                        : 'var(--tw-s3)',
                  }}
                />
                <span className="tw-cc">{col.day}</span>
              </div>
            ))}
          </div>

          <p className="text-xs mt-3 mb-0" style={{ color: 'var(--tw-ink-3)' }}>
            Grouped by UTC execution day across closed trades in the active desk filter.
          </p>
        </article>
      </main>
    </div>
  );
}

function STRATEGY_COLOR_FALLBACK(idx: number): string {
  const palette = ['var(--tw-s1)', 'var(--tw-s2)', 'var(--tw-s3)', 'var(--tw-gain)'];
  return palette[idx % palette.length];
}

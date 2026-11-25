'use client';

import React from 'react';
import {
  ReportComputedData,
  formatSignedCurrency,
  formatSignedR,
  formatShortDateLabel,
} from './types';

interface DrawdownStressViewProps {
  data: ReportComputedData;
}

export const DrawdownStressView: React.FC<DrawdownStressViewProps> = ({ data }) => {
  const {
    closedTrades,
    netProfit,
    totalR,
    maxRiskPerTradePct,
    drawdownSeries,
    maxDrawdownDollars,
    maxDrawdownPctOfPeak,
    peakProfitDollars,
    troughTrade,
    recoveryTrades,
    longestDrawdownTrades,
    recoveryFactor,
    longestWinStreak,
    longestLossStreak,
    tradesUnderwaterCount,
  } = data;

  // Build SVG underwater path from drawdownSeries
  const ddChart = React.useMemo(() => {
    if (drawdownSeries.length === 0) return null;

    const maxDD = Math.max(1, maxDrawdownDollars);
    const xStart = 40;
    const xEnd = 520;
    const yPeak = 30;
    const yBottom = 120;
    const spanY = yBottom - yPeak;

    const pts = drawdownSeries.map((pt, i) => {
      const ratioX = drawdownSeries.length > 1 ? i / (drawdownSeries.length - 1) : 0.5;
      const x = xStart + ratioX * (xEnd - xStart);
      const y = yPeak + (pt.drawdownDollars / maxDD) * spanY;
      return { ...pt, x, y };
    });

    // Trough index
    let troughIdx = 0;
    pts.forEach((p, idx) => {
      if (p.drawdownDollars >= pts[troughIdx].drawdownDollars) troughIdx = idx;
    });
    const troughPt = pts[troughIdx];

    const lineD = pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');
    const areaD = `${lineD} L${pts[pts.length - 1].x.toFixed(1)} ${yPeak} L${pts[0].x.toFixed(1)} ${yPeak} Z`;

    const recoveredAtEnd = pts[pts.length - 1].drawdownDollars <= 0.01;

    return {
      pts,
      troughPt,
      lineD,
      areaD,
      recoveredAtEnd,
      yPeak,
      yBottom,
    };
  }, [drawdownSeries, maxDrawdownDollars]);

  // Top 2 winners removed stress test
  const topTwoSumR = [...closedTrades]
    .sort((a, b) => (b.realizedR || 0) - (a.realizedR || 0))
    .slice(0, 2)
    .reduce((acc, t) => acc + Math.max(0, t.realizedR || 0), 0);

  const worstLossR = troughTrade ? Math.min(-1, troughTrade.realizedR || -1) : -1;

  const scenarios = [
    {
      name: 'Base record',
      assumption: 'As recorded',
      afterR: totalR,
      changeR: 0,
    },
    {
      name: 'One more −1R loss',
      assumption: 'Next trade closes at −1R',
      afterR: totalR - 1,
      changeR: -1,
    },
    {
      name: 'Three losses in a row',
      assumption: 'Three consecutive −1R closes',
      afterR: totalR - 3,
      changeR: -3,
    },
    {
      name: 'Remove two largest winners',
      assumption: 'Top two winning trades removed',
      afterR: totalR - topTwoSumR,
      changeR: -topTwoSumR,
    },
    {
      name: 'Repeat worst loss twice',
      assumption: 'Two more stop-out closes',
      afterR: totalR + worstLossR * 2,
      changeR: worstLossR * 2,
    },
  ];

  const avgRisk = maxRiskPerTradePct || 1.0;

  return (
    <main className="tw-rep-grid">
      {/* HERO: Maximum Drawdown (Cols 1-4, Row 1) */}
      <section
        className="tile place hero"
        style={{ '--gc': '1 / 5', '--gr': '1' } as React.CSSProperties}
        aria-label="Headline result"
      >
        <svg className="orbit" viewBox="0 0 280 280" aria-hidden="true">
          <circle cx="140" cy="140" r="60" style={{ fill: 'none', stroke: 'var(--tw-hero-rule)', strokeWidth: 1.25 }} />
          <circle cx="140" cy="140" r="96" style={{ fill: 'none', stroke: 'var(--tw-hero-rule)', strokeWidth: 1.25 }} />
          <circle cx="140" cy="140" r="132" style={{ fill: 'none', stroke: 'var(--tw-hero-rule)', strokeWidth: 1.25 }} />
          <circle
            cx="140"
            cy="140"
            r="96"
            style={{
              fill: 'none',
              stroke: 'var(--tw-sun)',
              strokeWidth: 3,
              strokeLinecap: 'round',
              strokeDasharray: '150 603',
              transform: 'rotate(-90deg)',
              transformOrigin: '140px 140px',
            }}
          />
        </svg>

        <div className="head">
          <span className="eyebrow">Maximum drawdown</span>
          <span className={`pill ${maxDrawdownDollars > 0 ? 'l' : 'ok'}`}>
            −{maxDrawdownPctOfPeak.toFixed(1)}% of peak
          </span>
        </div>

        <div className="big2 sm">
          {maxDrawdownDollars > 0
            ? `−$${maxDrawdownDollars.toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`
            : '$0.00'}
        </div>
        <p className="hsub">
          {troughTrade
            ? `Peak ${formatSignedCurrency(peakProfitDollars)} then trough on ${troughTrade.instrumentSymbol} (${formatShortDateLabel(
                troughTrade.exitTime || troughTrade.entryTime
              )}).`
            : 'No peak-to-trough drawdown recorded in scope.'}
        </p>

        <div className="chips">
          <span className="chip">
            {recoveryTrades > 0
              ? `Recovered in ${recoveryTrades} trade${recoveryTrades === 1 ? '' : 's'}`
              : maxDrawdownDollars > 0
              ? 'Recovery active'
              : 'Zero drawdown'}
          </span>
          <span className="chip">{troughTrade?.instrumentSymbol || 'None'}</span>
          <span className="chip">Recovery {recoveryFactor.toFixed(1)}×</span>
        </div>

        <div className="foot">
          <span>{ddChart?.recoveredAtEnd ? 'Recovered equity high' : 'Latest close'}</span>
          <span className="mono">{data.dateRangeChip}</span>
        </div>
      </section>

      {/* DRAWDOWN FROM PEAK UNDERWATER SVG (Cols 5-9, Row 1) */}
      <section
        className="tile place"
        style={{ '--gc': '5 / 10', '--gr': '1' } as React.CSSProperties}
        aria-label="Drawdown from peak"
      >
        <div className="head">
          <div>
            <span className="eyebrow">Drawdown from peak</span>
            <p className="sub" style={{ margin: '4px 0 0' }}>
              Distance below the highest close, USD
            </p>
          </div>
          <span className={`pill ${maxDrawdownDollars > 0 ? 'l' : 'ok'}`}>
            Max {maxDrawdownDollars > 0 ? `−$${maxDrawdownDollars.toFixed(2)}` : '$0.00'}
          </span>
        </div>

        {ddChart ? (
          <svg
            viewBox="0 0 560 150"
            role="img"
            aria-label={`Drawdown from peak reaches -$${maxDrawdownDollars.toFixed(2)}`}
          >
            <defs>
              <linearGradient id="tw-rep-ddg" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" style={{ stopColor: 'var(--tw-loss)', stopOpacity: 0.06 }} />
                <stop offset="1" style={{ stopColor: 'var(--tw-loss)', stopOpacity: 0.5 }} />
              </linearGradient>
            </defs>
            <line
              x1="0"
              x2="560"
              y1={ddChart.yPeak}
              y2={ddChart.yPeak}
              style={{ stroke: 'var(--tw-line-strong)', strokeWidth: 1 }}
            />
            <line
              x1="0"
              x2="560"
              y1={ddChart.yBottom}
              y2={ddChart.yBottom}
              style={{ stroke: 'var(--tw-line)', strokeWidth: 1, strokeDasharray: '2 4' }}
            />
            <path d={ddChart.areaD} style={{ fill: 'url(#tw-rep-ddg)' }} />
            <path
              d={ddChart.lineD}
              style={{
                fill: 'none',
                stroke: 'var(--tw-loss)',
                strokeWidth: 2.5,
                strokeLinejoin: 'round',
                strokeLinecap: 'round',
              }}
            />
            {maxDrawdownDollars > 0 && (
              <circle
                cx={ddChart.troughPt.x}
                cy={ddChart.troughPt.y}
                r="5"
                style={{ fill: 'var(--tw-tile)', stroke: 'var(--tw-loss)', strokeWidth: 2.5 }}
              />
            )}
            <g className="mono" style={{ fontSize: 12, fontWeight: 600 }}>
              {maxDrawdownDollars > 0 && (
                <text
                  x={ddChart.troughPt.x}
                  y="141"
                  textAnchor="middle"
                  style={{ fill: 'var(--tw-loss)' }}
                >
                  −${maxDrawdownDollars.toFixed(2)}
                </text>
              )}
              <text x="40" y="22" textAnchor="start" style={{ fill: 'var(--tw-ink-3)' }}>
                Peak
              </text>
              {ddChart.recoveredAtEnd && maxDrawdownDollars > 0 && (
                <text x="480" y="22" textAnchor="middle" style={{ fill: 'var(--tw-gain)' }}>
                  Recovered
                </text>
              )}
            </g>
          </svg>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-[var(--tw-ink-3)] font-mono">
            No drawdown trajectory recorded yet
          </div>
        )}
      </section>

      {/* RECOVERY FACTOR (Cols 10-12, Row 1) */}
      <section
        className="tile place"
        style={{ '--gc': '10 / 13', '--gr': '1' } as React.CSSProperties}
        aria-label="Recovery factor"
      >
        <div className="head">
          <span className="eyebrow">Recovery factor</span>
          <span className="pill ok">
            {recoveryFactor >= 5 ? 'Strong' : recoveryFactor >= 2 ? 'Healthy' : 'Low'}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1 }}>
          <div className="big2 gain" style={{ fontSize: 52, lineHeight: '56px' }}>
            {maxDrawdownDollars === 0 && netProfit > 0
              ? '∞'
              : `${recoveryFactor.toFixed(1)}×`}
          </div>
          <p className="sub" style={{ margin: '6px 0 0' }}>
            Net P&amp;L {formatSignedCurrency(netProfit).replace('+', '')} ÷ max drawdown $
            {maxDrawdownDollars.toFixed(2)}
          </p>
        </div>
      </section>

      {/* ROW 2 KPIs */}
      <section
        className="tile place kpi"
        style={{
          '--gc': '1 / 4',
          '--gr': '2',
          background:
            'linear-gradient(160deg, color-mix(in srgb, var(--tw-loss) 15%, var(--tw-tile)) 0%, var(--tw-tile) 72%)',
        } as React.CSSProperties}
        aria-label="Max drawdown"
      >
        <div className="head">
          <span className="lbl">Max drawdown</span>
          <span className="pill l">{tradesUnderwaterCount} underwater</span>
        </div>
        <div>
          <div className="v" style={{ color: 'var(--tw-loss)' }}>
            {maxDrawdownDollars > 0 ? `−$${maxDrawdownDollars.toFixed(2)}` : '$0.00'}
          </div>
          <div className="sub">
            {troughTrade
              ? `${troughTrade.instrumentSymbol}, ${formatShortDateLabel(
                  troughTrade.exitTime || troughTrade.entryTime
                )}`
              : 'No drawdown trough'}
          </div>
        </div>
      </section>

      <section
        className="tile place kpi"
        style={{
          '--gc': '4 / 7',
          '--gr': '2',
          background:
            'linear-gradient(160deg, color-mix(in srgb, var(--tw-warn) 15%, var(--tw-tile)) 0%, var(--tw-tile) 72%)',
        } as React.CSSProperties}
        aria-label="Depth vs peak"
      >
        <div className="head">
          <span className="lbl">Depth vs peak</span>
          <span className="pill w">{maxDrawdownPctOfPeak < 10 ? 'Moderate' : 'Elevated'}</span>
        </div>
        <div>
          <div className="v" style={{ color: 'var(--tw-warn)' }}>
            {maxDrawdownPctOfPeak.toFixed(1)}%
          </div>
          <div className="sub">of peak profit {formatSignedCurrency(peakProfitDollars)}</div>
        </div>
      </section>

      <section
        className="tile place kpi"
        style={{
          '--gc': '7 / 10',
          '--gr': '2',
          background:
            'linear-gradient(160deg, color-mix(in srgb, var(--tw-gain) 15%, var(--tw-tile)) 0%, var(--tw-tile) 72%)',
        } as React.CSSProperties}
        aria-label="Longest drawdown"
      >
        <div className="head">
          <span className="lbl">Longest drawdown</span>
          <span className="pill ok">{longestDrawdownTrades <= 2 ? 'Short' : 'Extended'}</span>
        </div>
        <div>
          <div className="v" style={{ color: 'var(--tw-gain)' }}>
            {longestDrawdownTrades} trade{longestDrawdownTrades === 1 ? '' : 's'}
          </div>
          <div className="sub">
            {longestDrawdownTrades > 0 ? 'Recovered on subsequent closes' : 'Zero underwater closes'}
          </div>
        </div>
      </section>

      <section
        className="tile place kpi"
        style={{
          '--gc': '10 / 13',
          '--gr': '2',
          background:
            'linear-gradient(160deg, color-mix(in srgb, var(--tw-sun) 15%, var(--tw-tile)) 0%, var(--tw-tile) 72%)',
        } as React.CSSProperties}
        aria-label="Longest win streak"
      >
        <div className="head">
          <span className="lbl">Longest win streak</span>
          <span className="pill g">Streak</span>
        </div>
        <div>
          <div className="v" style={{ color: 'var(--tw-ink)' }}>
            {longestWinStreak} trade{longestWinStreak === 1 ? '' : 's'}
          </div>
          <div className="sub">Consecutive winning closes</div>
        </div>
      </section>

      {/* ROW 3 LEFT: STRESS SCENARIOS TABLE */}
      <section
        className="tile place exec"
        style={{ '--gc': '1 / 9', '--gr': '3' } as React.CSSProperties}
        aria-label="Stress scenarios"
      >
        <div className="head">
          <span className="eyebrow">Stress scenarios</span>
          <span className="sub">Hypothetical, in R</span>
        </div>

        <div className="tw-rep-table-wrap">
          <table className="ex tight">
            <thead>
              <tr>
                <th>Scenario</th>
                <th>Assumption</th>
                <th>Net R after</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((sc) => (
                <tr key={sc.name}>
                  <td className="l">{sc.name}</td>
                  <td className="strat">{sc.assumption}</td>
                  <td className="mono">{formatSignedR(sc.afterR)}</td>
                  <td className={`mono ${sc.changeR < 0 ? 'loss' : ''}`}>
                    {formatSignedR(sc.changeR)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ROW 3 RIGHT: RISK PER TRADE */}
      <section
        className="tile place strat-tile"
        style={{ '--gc': '9 / 13', '--gr': '3' } as React.CSSProperties}
        aria-label="Risk per trade"
      >
        <div className="head">
          <span className="eyebrow">Risk per trade</span>
          <span className="pill w">{avgRisk.toFixed(1)}% stated</span>
        </div>

        <div className="srow" style={{ flexDirection: 'column' }}>
          <div className="stile">
            <span>One −1R loss</span>
            <b className="loss">{avgRisk.toFixed(1)}% of account</b>
          </div>
          <div className="stile">
            <span>Three −1R losses in a row</span>
            <b className="warn">{(avgRisk * 3).toFixed(1)}% of account</b>
          </div>
        </div>

        <div className="sumline">
          <span>Account equity calibration</span>
          <span className="mono">in R</span>
        </div>
      </section>

      {/* ROW 4 LEFT: STREAKS AND RECOVERY */}
      <section
        className="tile place rules"
        style={{ '--gc': '1 / 9', '--gr': '4' } as React.CSSProperties}
        aria-label="Streaks and recovery"
      >
        <div className="head">
          <span className="eyebrow">Streaks and recovery</span>
          <span className="sub">This record</span>
        </div>

        <div className="srow">
          <div className="stile">
            <span>Longest winning streak</span>
            <b className="gain">
              {longestWinStreak} trade{longestWinStreak === 1 ? '' : 's'}
            </b>
          </div>
          <div className="stile">
            <span>Longest losing streak</span>
            <b className="loss">
              {longestLossStreak} trade{longestLossStreak === 1 ? '' : 's'}
            </b>
          </div>
          <div className="stile">
            <span>Trades underwater</span>
            <b>
              {tradesUnderwaterCount} of {closedTrades.length}
            </b>
          </div>
          <div className="stile">
            <span>Recovery time</span>
            <b>
              {recoveryTrades} trade{recoveryTrades === 1 ? '' : 's'}
            </b>
          </div>
        </div>
      </section>

      {/* ROW 4 RIGHT: SCENARIO NOTE */}
      <section
        className="tile place cert"
        style={{ '--gc': '9 / 13', '--gr': '4' } as React.CSSProperties}
        aria-label="Scenario note"
      >
        <div
          className="note"
          style={{
            background: 'color-mix(in srgb, var(--tw-s1) 9%, var(--tw-tile))',
            boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--tw-s1) 30%, transparent)',
          }}
        >
          <div className="row" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="eyebrow">Scenario note</span>
          </div>
          <p>Fixed R outcomes applied to this record. Sensitivity analysis only.</p>
        </div>
      </section>
    </main>
  );
};

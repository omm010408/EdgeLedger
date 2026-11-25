'use client';

import React from 'react';
import {
  ReportComputedData,
  formatSignedCurrency,
  formatSignedR,
} from './types';

interface StrategyAttributionViewProps {
  data: ReportComputedData;
}

export const StrategyAttributionView: React.FC<StrategyAttributionViewProps> = ({ data }) => {
  const { closedTrades, netProfit, totalR, strategies, sessions } = data;

  const sortedByR = [...strategies].sort((a, b) => b.totalR - a.totalR);
  const topStrategy = strategies[0] || null;
  const bestAvgRStrategy =
    strategies.length > 0 ? [...strategies].sort((a, b) => b.avgR - a.avgR)[0] : null;
  const lowestAvgRStrategy =
    strategies.length > 0 ? [...strategies].sort((a, b) => a.avgR - b.avgR)[0] : null;

  const maxStrategyR = Math.max(0.01, ...sortedByR.map((s) => Math.abs(s.totalR)));
  const sessionCountsStr = sessions.map((s) => s.count).join(' · ') || '0';
  const sessionNamesStr = sessions.map((s) => s.name).join(' · ') || 'No sessions';

  return (
    <main className="tw-rep-grid">
      {/* HERO: Top Strategy (Cols 1-4, Row 1) */}
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
          <span className="eyebrow">Top strategy</span>
          <span className="pill ok">
            {topStrategy ? `${topStrategy.winRate.toFixed(0)}% win` : '0% win'}
          </span>
        </div>

        <div className="big2 sm">
          {topStrategy ? formatSignedCurrency(topStrategy.pnl) : '$0.00'}
        </div>
        <p className="hsub">
          {topStrategy
            ? `${topStrategy.name}, ${topStrategy.count} trade${
                topStrategy.count === 1 ? '' : 's'
              }, ${formatSignedR(topStrategy.totalR)}.`
            : 'Record closed trades to evaluate top strategy attribution.'}
        </p>

        <div className="chips">
          <span className="chip">
            {topStrategy ? `${topStrategy.sharePct.toFixed(1)}% of net` : '0% of net'}
          </span>
          <span className="chip">
            {topStrategy
              ? `${topStrategy.count} trade${topStrategy.count === 1 ? '' : 's'}`
              : '0 trades'}
          </span>
          <span className="chip">
            Sample: {closedTrades.length < 10 ? 'small' : 'established'}
          </span>
        </div>

        <div className="foot">
          <span>Share of net P&amp;L</span>
          <span className="mono">
            {topStrategy ? `${topStrategy.sharePct.toFixed(1)}%` : '0.0%'}
          </span>
        </div>
      </section>

      {/* TOTAL R BY STRATEGY (Cols 5-9, Row 1) */}
      <section
        className="tile place"
        style={{ '--gc': '5 / 10', '--gr': '1' } as React.CSSProperties}
        aria-label="R by strategy"
      >
        <div className="head">
          <span className="eyebrow">Total R by strategy</span>
          <span className="sub">Ranked, R-multiple</span>
        </div>

        {sortedByR.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-xs text-[var(--tw-ink-3)] font-mono">
            No closed strategy trades
          </div>
        ) : (
          sortedByR.slice(0, 3).map((s) => (
            <div className="barrow" key={s.name}>
              <span className="lab">{s.shortName}</span>
              <span className={`val ${s.totalR >= 0 ? '' : 'loss'}`}>
                {formatSignedR(s.totalR)}
              </span>
              <div className="track">
                <i
                  style={{
                    width: `${Math.max(4, (Math.abs(s.totalR) / maxStrategyR) * 100).toFixed(1)}%`,
                    background: s.color,
                  }}
                />
              </div>
            </div>
          ))
        )}
      </section>

      {/* WIN RATE BY STRATEGY (Cols 10-12, Row 1) */}
      <section
        className="tile place"
        style={{ '--gc': '10 / 13', '--gr': '1' } as React.CSSProperties}
        aria-label="Win rate by strategy"
      >
        <div className="head">
          <span className="eyebrow">Win rate</span>
          <span className="sub">Wins vs losses</span>
        </div>

        {sortedByR.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-xs text-[var(--tw-ink-3)] font-mono">
            No win/loss split
          </div>
        ) : (
          sortedByR.slice(0, 3).map((s) => {
            const winW = Math.min(100, Math.max(0, s.winRate));
            const lossW = 100 - winW;
            return (
              <div className="barrow" key={`wr-${s.name}`}>
                <span className="lab">{s.shortName}</span>
                <span className="val">{s.winRate.toFixed(0)}%</span>
                <div className="track">
                  <i style={{ width: `${winW.toFixed(1)}%`, background: 'var(--tw-gain)' }} />
                  <i style={{ width: `${lossW.toFixed(1)}%`, background: 'var(--tw-loss)' }} />
                </div>
              </div>
            );
          })
        )}
      </section>

      {/* ROW 2 KPIs */}
      <section
        className="tile place kpi"
        style={{
          '--gc': '1 / 4',
          '--gr': '2',
          background:
            'linear-gradient(160deg, color-mix(in srgb, var(--tw-s3) 15%, var(--tw-tile)) 0%, var(--tw-tile) 72%)',
        } as React.CSSProperties}
        aria-label="Strategies"
      >
        <div className="head">
          <span className="lbl">Strategies</span>
          <span className="pill vi">{strategies.length} setups</span>
        </div>
        <div>
          <div className="v" style={{ color: 'var(--tw-s3)' }}>
            {strategies.length}
          </div>
          <div className="sub">From {closedTrades.length} closed trades</div>
        </div>
      </section>

      <section
        className="tile place kpi"
        style={{
          '--gc': '4 / 7',
          '--gr': '2',
          background:
            'linear-gradient(160deg, color-mix(in srgb, var(--tw-gain) 15%, var(--tw-tile)) 0%, var(--tw-tile) 72%)',
        } as React.CSSProperties}
        aria-label="Best average R"
      >
        <div className="head">
          <span className="lbl">Best average R</span>
          <span className="pill ok">Leader</span>
        </div>
        <div>
          <div className="v" style={{ color: 'var(--tw-gain)' }}>
            {bestAvgRStrategy ? formatSignedR(bestAvgRStrategy.avgR) : '0.00R'}
          </div>
          <div className="sub">{bestAvgRStrategy?.shortName || 'No sample'}</div>
        </div>
      </section>

      <section
        className="tile place kpi"
        style={{
          '--gc': '7 / 10',
          '--gr': '2',
          background:
            'linear-gradient(160deg, color-mix(in srgb, var(--tw-warn) 15%, var(--tw-tile)) 0%, var(--tw-tile) 72%)',
        } as React.CSSProperties}
        aria-label="Lowest average R"
      >
        <div className="head">
          <span className="lbl">Lowest average R</span>
          <span className="pill w">
            {lowestAvgRStrategy && lowestAvgRStrategy.losses > 0 ? 'Mixed' : 'Lowest'}
          </span>
        </div>
        <div>
          <div className="v" style={{ color: 'var(--tw-warn)' }}>
            {lowestAvgRStrategy ? formatSignedR(lowestAvgRStrategy.avgR) : '0.00R'}
          </div>
          <div className="sub">
            {lowestAvgRStrategy
              ? `${lowestAvgRStrategy.shortName}, ${lowestAvgRStrategy.wins} win · ${lowestAvgRStrategy.losses} loss`
              : 'No sample'}
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
        aria-label="Session mix"
      >
        <div className="head">
          <span className="lbl">Session mix</span>
          <span className="pill g">Derived</span>
        </div>
        <div>
          <div className="v" style={{ fontSize: 24, lineHeight: '32px' }}>
            {sessionCountsStr}
          </div>
          <div className="sub">{sessionNamesStr}</div>
        </div>
      </section>

      {/* ROW 3 LEFT: STRATEGY TABLE */}
      <section
        className="tile place exec"
        style={{ '--gc': '1 / 9', '--gr': '3' } as React.CSSProperties}
        aria-label="Strategy table"
      >
        <div className="head">
          <span className="eyebrow">Strategy table</span>
          <span className="sub">Attributed, {closedTrades.length} trades</span>
        </div>

        <div className="tw-rep-table-wrap">
          {strategies.length === 0 ? (
            <div className="py-10 text-center text-xs text-[var(--tw-ink-3)] font-mono">
              No strategy executions to display.
            </div>
          ) : (
            <table className="ex tight">
              <thead>
                <tr>
                  <th>Strategy</th>
                  <th>Trades</th>
                  <th>Win</th>
                  <th>Avg R</th>
                  <th>Total R</th>
                  <th className="num">Net P&amp;L</th>
                  <th>Share</th>
                </tr>
              </thead>
              <tbody>
                {strategies.map((st) => (
                  <tr key={st.name}>
                    <td className="l">{st.name}</td>
                    <td className="mono">{st.count}</td>
                    <td className="mono">{st.winRate.toFixed(0)}%</td>
                    <td className="mono">{formatSignedR(st.avgR)}</td>
                    <td className="mono">{formatSignedR(st.totalR)}</td>
                    <td className={`mono num ${st.pnl >= 0 ? 'gain' : 'loss'}`}>
                      {formatSignedCurrency(st.pnl)}
                    </td>
                    <td className="mono">{st.sharePct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Total, {closedTrades.length} closed trades</td>
                  <td className="mono">{formatSignedR(data.avgR)}</td>
                  <td className="mono">{formatSignedR(totalR)}</td>
                  <td className={`mono num ${netProfit >= 0 ? 'gain' : 'loss'}`}>
                    {formatSignedCurrency(netProfit)}
                  </td>
                  <td className="mono">100%</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </section>

      {/* ROW 3 RIGHT: SESSION MIX */}
      <section
        className="tile place strat-tile"
        style={{ '--gc': '9 / 13', '--gr': '3' } as React.CSSProperties}
        aria-label="Session mix"
      >
        <div className="head">
          <span className="eyebrow">Session mix</span>
          <span className="sub">Share of trades</span>
        </div>

        {sessions.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-xs text-[var(--tw-ink-3)] font-mono">
            No session data
          </div>
        ) : (
          sessions.slice(0, 3).map((sess) => (
            <div className="barrow" key={sess.name}>
              <span className="lab">{sess.name}</span>
              <span className="val">
                {sess.count} trade{sess.count === 1 ? '' : 's'}
              </span>
              <div className="track">
                <i
                  style={{
                    width: `${Math.max(4, sess.sharePct).toFixed(1)}%`,
                    background: sess.color,
                  }}
                />
              </div>
            </div>
          ))
        )}

        <div className="sumline">
          <span>Sessions from executions</span>
          <span className="mono">{closedTrades.length} trades</span>
        </div>
      </section>

      {/* ROW 4 LEFT: WHAT THE SAMPLE SAYS */}
      <section
        className="tile place rules"
        style={{ '--gc': '1 / 9', '--gr': '4' } as React.CSSProperties}
        aria-label="What the sample says"
      >
        <div className="head">
          <span className="eyebrow">What the sample says</span>
          <span className="sub">Descriptive only</span>
        </div>

        <div className="insight">
          <div style={{ '--c': 'var(--tw-s3)' } as React.CSSProperties}>
            {lowestAvgRStrategy && lowestAvgRStrategy.losses > 0
              ? `${lowestAvgRStrategy.shortName} is the mixed setup: ${lowestAvgRStrategy.wins} win, ${lowestAvgRStrategy.losses} loss.`
              : 'Every recorded setup closed positive in the active scope.'}
          </div>
          <div style={{ '--c': 'var(--tw-gain)' } as React.CSSProperties}>
            {topStrategy
              ? `${topStrategy.shortName} leads net P&L with ${formatSignedCurrency(topStrategy.pnl)} (${topStrategy.sharePct.toFixed(1)}%).`
              : 'Execute and journal setups to surface performance leaders.'}
          </div>
          <div style={{ '--c': 'var(--tw-warn)' } as React.CSSProperties}>
            {closedTrades.length < 20
              ? 'Treat rankings as provisional until each setup has a larger sample.'
              : 'Sample size supports multi-session expectancy comparison.'}
          </div>
        </div>
      </section>

      {/* ROW 4 RIGHT: SAMPLE SIZE */}
      <section
        className="tile place cert"
        style={{ '--gc': '9 / 13', '--gr': '4' } as React.CSSProperties}
        aria-label="Sample size"
      >
        <div
          className="note"
          style={{
            background: 'color-mix(in srgb, var(--tw-warn) 10%, var(--tw-tile))',
            boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--tw-warn) 35%, transparent)',
          }}
        >
          <div className="row" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="eyebrow">Sample size</span>
            <span className="pill w">
              {closedTrades.length < 15 ? 'Small sample' : 'Established'}
            </span>
          </div>
          <p>
            {closedTrades.length} trade{closedTrades.length === 1 ? '' : 's'} in total. Rankings describe this record and do not predict future results.
          </p>
        </div>
      </section>
    </main>
  );
};

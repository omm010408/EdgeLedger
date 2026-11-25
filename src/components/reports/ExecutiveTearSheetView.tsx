'use client';

import React from 'react';
import {
  ReportComputedData,
  formatSignedCurrency,
  formatSignedR,
} from './types';

interface ExecutiveTearSheetViewProps {
  data: ReportComputedData;
}

function formatCompactMoney(val: number): string {
  const abs = Math.round(Math.abs(val)).toLocaleString('en-US');
  if (val > 0) return `+${abs}`;
  if (val < 0) return `−${abs}`;
  return '0';
}

export const ExecutiveTearSheetView: React.FC<ExecutiveTearSheetViewProps> = ({ data }) => {
  const {
    closedTrades,
    scopeLabel,
    auditRefId,
    reportTimestamp,
    dateRangeChip,
    netProfit,
    grossProfit,
    grossLoss,
    winCount,
    lossCount,
    winRate,
    profitFactor,
    avgR,
    totalR,
    largestLossTrade,
    largestLossR,
    largestLossPnl,
    strategies,
    rules,
    clearRulesCount,
    pendingRulesCount,
    breachedRulesCount,
  } = data;

  // Build dynamic Trade Bridge bars (up to latest 5 closed trades + final Net bar)
  const bridgeTrades = closedTrades.slice(-5);
  const bridgeRender = React.useMemo(() => {
    if (bridgeTrades.length === 0) return null;

    let running = 0;
    const steps = bridgeTrades.map((t) => {
      const start = running;
      const end = running + t.netPnl;
      running = end;
      return {
        symbol: t.instrumentSymbol,
        delta: t.netPnl,
        start,
        end,
        isGain: t.netPnl >= 0,
      };
    });

    const totalNet = running;
    const allVals = [0, totalNet, ...steps.flatMap((s) => [s.start, s.end])];
    const minVal = Math.min(...allVals);
    const maxVal = Math.max(...allVals);
    const range = maxVal - minVal || 1;

    const yTop = 26;
    const yBottom = 116;
    const plotHeight = yBottom - yTop;
    const toY = (v: number) => yBottom - ((v - minVal) / range) * plotHeight;
    const yZero = toY(0);

    const totalBars = steps.length + 1;
    const slotWidth = 540 / totalBars;
    const barWidth = Math.min(60, slotWidth * 0.56);

    const bars = steps.map((s, idx) => {
      const x = 10 + idx * slotWidth + (slotWidth - barWidth) / 2;
      const y1 = toY(s.start);
      const y2 = toY(s.end);
      const y = Math.min(y1, y2);
      const h = Math.max(4, Math.abs(y2 - y1));
      const nextX = 10 + (idx + 1) * slotWidth + (slotWidth - barWidth) / 2;
      return {
        ...s,
        x,
        y,
        h,
        barWidth,
        labelX: x + barWidth / 2,
        labelY: s.isGain ? Math.max(16, y - 7) : Math.max(16, y - 7),
        connectorY: y2,
        connectorX1: x + barWidth,
        connectorX2: nextX,
      };
    });

    const netIdx = steps.length;
    const netX = 10 + netIdx * slotWidth + (slotWidth - barWidth) / 2;
    const netY1 = toY(0);
    const netY2 = toY(totalNet);
    const netY = Math.min(netY1, netY2);
    const netH = Math.max(4, Math.abs(netY2 - netY1));

    return {
      yZero,
      yTop,
      bars,
      netBar: {
        x: netX,
        y: netY,
        h: netH,
        barWidth,
        labelX: netX + barWidth / 2,
        value: totalNet,
      },
    };
  }, [bridgeTrades]);

  // Rule clearance SVG ring (r=54 -> C = 339.29)
  const ruleRingSegments = React.useMemo(() => {
    const list = rules.length > 0 ? rules : [];
    const total = list.length || 1;
    const C = 339.29;
    const gap = total > 1 ? 6 : 0;
    const segLen = Math.max(10, C / total - gap);

    return list.map((r, i) => ({
      id: r.id,
      dash: `${segLen.toFixed(1)} ${(C - segLen).toFixed(1)}`,
      offset: -i * (C / total),
      color:
        r.status === 'clear' || r.status === 'verified'
          ? 'var(--tw-gain)'
          : r.status === 'pending'
          ? 'var(--tw-warn)'
          : 'var(--tw-loss)',
    }));
  }, [rules]);

  // Profit factor proportional widths
  const totalGrossVol = grossProfit + grossLoss;
  const gainSharePct = totalGrossVol > 0 ? (grossProfit / totalGrossVol) * 100 : 0;
  const lossSharePct = totalGrossVol > 0 ? (grossLoss / totalGrossVol) * 100 : 0;

  // Strategy donut arcs (r=50 -> C = 314.16)
  const strategyArcs = React.useMemo(() => {
    const C = 314.16;
    let offset = 0;
    const totalAbs = strategies.reduce((s, st) => s + Math.abs(st.pnl), 0) || 1;
    return strategies.slice(0, 4).map((st) => {
      const share = Math.abs(st.pnl) / totalAbs;
      const dashLen = Number((share * C).toFixed(1));
      const currentOffset = -offset;
      offset += dashLen;
      return {
        ...st,
        dash: `${dashLen} ${C.toFixed(1)}`,
        offset: currentOffset,
      };
    });
  }, [strategies]);

  const compliancePillClass =
    breachedRulesCount > 0 ? 'l' : pendingRulesCount > 0 ? 'w' : 'ok';
  const complianceStatusLabel =
    breachedRulesCount > 0
      ? 'Status: breach flagged'
      : pendingRulesCount > 0
      ? `Status: pending (${pendingRulesCount})`
      : 'Status: compliant';

  // Dot plot position for R values (domain [-1.5R .. +3.5R])
  const rToDotLeftPct = (rVal: number) => {
    const clamped = Math.max(-1.5, Math.min(3.5, rVal));
    return ((clamped + 1.5) / 5.0) * 100;
  };

  return (
    <main className="tw-rep-grid">
      {/* HERO: Headline Result (Cols 1-4, Row 1) */}
      <section className="tile hero" aria-label="Headline result">
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
          <span className="eyebrow">EdgeLedger performance audit</span>
          <span className={`pill ${compliancePillClass}`}>{complianceStatusLabel}</span>
        </div>

        <div className="big">{formatSignedCurrency(netProfit)}</div>
        <p className="hsub">Net realised P&amp;L across {scopeLabel.toLowerCase()}</p>

        <div className="chips">
          <span className="chip">
            {closedTrades.length} closed trade{closedTrades.length === 1 ? '' : 's'}
          </span>
          <span className="chip">Sample: {dateRangeChip}</span>
          <span className="chip">USD</span>
        </div>

        <div className="foot">
          <span>
            Ref <span className="mono">{auditRefId}</span>
          </span>
          <span suppressHydrationWarning>Generated {reportTimestamp}</span>
        </div>
      </section>

      {/* TRADE BRIDGE WATERFALL (Cols 5-9, Row 1) */}
      <section className="tile bridge" aria-label="Trade bridge, cumulative net P&L">
        <div className="head">
          <div>
            <span className="eyebrow">Trade bridge</span>
            <p className="sub" style={{ margin: '4px 0 0' }}>
              Cumulative net P&amp;L after each closed trade, USD
            </p>
          </div>
          <span className={`pill ${netProfit >= 0 ? 'ok' : 'l'}`}>
            {formatSignedCurrency(netProfit)}
          </span>
        </div>

        {bridgeRender ? (
          <svg
            viewBox="0 0 560 150"
            role="img"
            aria-label={`Cumulative net P&L builds to ${formatSignedCurrency(bridgeRender.netBar.value)}`}
          >
            <defs>
              <linearGradient id="tw-rep-wg" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" style={{ stopColor: 'var(--tw-gain)', stopOpacity: 1 }} />
                <stop offset="1" style={{ stopColor: 'var(--tw-gain)', stopOpacity: 0.45 }} />
              </linearGradient>
              <linearGradient id="tw-rep-wl" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" style={{ stopColor: 'var(--tw-loss)', stopOpacity: 1 }} />
                <stop offset="1" style={{ stopColor: 'var(--tw-loss)', stopOpacity: 0.6 }} />
              </linearGradient>
              <linearGradient id="tw-rep-wn" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" style={{ stopColor: 'var(--tw-sun)', stopOpacity: 1 }} />
                <stop offset="1" style={{ stopColor: 'var(--tw-sun)', stopOpacity: 0.5 }} />
              </linearGradient>
            </defs>

            {/* Target / Top guide & baseline */}
            <line
              x1="0"
              x2="560"
              y1={bridgeRender.yTop}
              y2={bridgeRender.yTop}
              style={{ stroke: 'var(--tw-line)', strokeWidth: 1, strokeDasharray: '2 4' }}
            />
            <line
              x1="0"
              x2="560"
              y1={bridgeRender.yZero}
              y2={bridgeRender.yZero}
              style={{ stroke: 'var(--tw-line-strong)', strokeWidth: 1 }}
            />

            {/* Step Connectors */}
            <g style={{ stroke: 'var(--tw-line-strong)', strokeWidth: 1, strokeDasharray: '3 3' }}>
              {bridgeRender.bars.map((b, i) => (
                <line
                  key={`conn-${i}`}
                  x1={b.connectorX1}
                  x2={b.connectorX2}
                  y1={b.connectorY}
                  y2={b.connectorY}
                />
              ))}
            </g>

            {/* Trade Bars + Net Bar */}
            {bridgeRender.bars.map((b, i) => (
              <rect
                key={`bar-${i}`}
                x={b.x}
                y={b.y}
                width={b.barWidth}
                height={b.h}
                rx={b.isGain ? 8 : 3}
                style={{ fill: b.isGain ? 'url(#tw-rep-wg)' : 'url(#tw-rep-wl)' }}
              />
            ))}
            <rect
              x={bridgeRender.netBar.x}
              y={bridgeRender.netBar.y}
              width={bridgeRender.netBar.barWidth}
              height={bridgeRender.netBar.h}
              rx="8"
              style={{ fill: 'url(#tw-rep-wn)' }}
            />

            {/* Numeric Labels */}
            <g className="mono" style={{ fontSize: 12, fontWeight: 600 }}>
              {bridgeRender.bars.map((b, i) => (
                <text
                  key={`val-${i}`}
                  x={b.labelX}
                  y={b.labelY}
                  textAnchor="middle"
                  style={{ fill: b.isGain ? 'var(--tw-ink)' : 'var(--tw-loss)' }}
                >
                  {formatCompactMoney(b.delta)}
                </text>
              ))}
              <text
                x={bridgeRender.netBar.labelX}
                y={Math.max(16, bridgeRender.netBar.y - 7)}
                textAnchor="middle"
                style={{ fill: 'var(--tw-ink)' }}
              >
                {formatCompactMoney(bridgeRender.netBar.value)}
              </text>
            </g>

            {/* Symbol Axis Labels */}
            <g style={{ fontSize: 11, fontWeight: 600, fill: 'var(--tw-ink-3)' }}>
              {bridgeRender.bars.map((b, i) => (
                <text key={`sym-${i}`} x={b.labelX} y="138" textAnchor="middle">
                  {b.symbol}
                </text>
              ))}
              <text x={bridgeRender.netBar.labelX} y="138" textAnchor="middle">
                Net
              </text>
            </g>
          </svg>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-[var(--tw-ink-3)] font-mono">
            No closed executions recorded yet
          </div>
        )}
      </section>

      {/* RULE CLEARANCE DONUT (Cols 10-12, Row 1) */}
      <section className="tile comp" aria-label="Prop-firm rule clearance">
        <div className="head">
          <span className="eyebrow">Rule clearance</span>
          <span className={`pill ${breachedRulesCount > 0 ? 'l' : 'ok'}`}>
            {clearRulesCount} of {rules.length} clear
          </span>
        </div>

        <div className="body">
          <svg
            viewBox="0 0 132 132"
            role="img"
            aria-label={`${clearRulesCount} of ${rules.length} rules clear`}
          >
            <circle
              cx="66"
              cy="66"
              r="54"
              style={{ fill: 'none', stroke: 'var(--tw-track)', strokeWidth: 13 }}
            />
            <g transform="rotate(-90 66 66)" style={{ fill: 'none', strokeWidth: 13 }}>
              {ruleRingSegments.map((seg) => (
                <circle
                  key={seg.id}
                  cx="66"
                  cy="66"
                  r="54"
                  style={{
                    stroke: seg.color,
                    strokeDasharray: seg.dash,
                    strokeDashoffset: seg.offset,
                  }}
                />
              ))}
            </g>
            <text
              x="66"
              y="66"
              textAnchor="middle"
              className="mono"
              style={{ fontSize: 24, fontWeight: 600, fill: 'var(--tw-ink)' }}
            >
              {clearRulesCount}/{rules.length}
            </text>
            <text
              x="66"
              y="84"
              textAnchor="middle"
              style={{ fontSize: 10.5, fontWeight: 600, fill: 'var(--tw-ink-3)' }}
            >
              rules clear
            </text>
          </svg>

          <div className="stats">
            <div className="stat" style={{ '--c': 'var(--tw-gain)' } as React.CSSProperties}>
              <b className="gain">{clearRulesCount} clear</b>
              <span>Daily loss, floor, risk</span>
            </div>
            <div className="stat" style={{ '--c': 'var(--tw-warn)' } as React.CSSProperties}>
              <b className="warn">{pendingRulesCount} pending</b>
              <span>Minimum trading days</span>
            </div>
            <div className="stat" style={{ '--c': 'var(--tw-loss)' } as React.CSSProperties}>
              <b className="loss">{breachedRulesCount} breached</b>
              <span>{breachedRulesCount === 0 ? 'No limit broken' : 'Action required'}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ROW 2 KPI 1: Overall win rate */}
      <section className="tile kpi k1" aria-label="Overall win rate">
        <div className="head">
          <span className="lbl">Overall win rate</span>
          <span className="pill ok">
            {winCount} of {closedTrades.length} won
          </span>
        </div>
        <div>
          <div className="v gain">{winRate.toFixed(1)}%</div>
          <div className="sub">
            {winCount} win{winCount === 1 ? '' : 's'} · {lossCount} loss{lossCount === 1 ? '' : 'es'}
          </div>
          <div className="segs" aria-hidden="true">
            {closedTrades.length > 0 ? (
              closedTrades.slice(-10).map((t) => (
                <i
                  key={t.id}
                  style={{
                    background: t.netPnl >= 0 ? 'var(--tw-gain)' : 'var(--tw-loss)',
                  }}
                />
              ))
            ) : (
              <i style={{ background: 'var(--tw-track)' }} />
            )}
          </div>
        </div>
      </section>

      {/* ROW 2 KPI 2: Profit factor */}
      <section className="tile kpi k2" aria-label="Profit factor">
        <div className="head">
          <span className="lbl">Profit factor</span>
          <span className="pill g">
            {closedTrades.length === 0
              ? 'No sample'
              : closedTrades.length < 10
              ? 'Small sample'
              : 'Verified'}
          </span>
        </div>
        <div>
          <div className="v">
            {profitFactor >= 99 ? '∞' : profitFactor.toFixed(2)}
          </div>
          <div className="sub">
            {formatSignedCurrency(grossProfit).replace('+', '')} won ÷{' '}
            {formatSignedCurrency(grossLoss).replace('+', '')} lost
          </div>
          <div className="micro" aria-hidden="true">
            <i className="g" style={{ left: 0, width: `${gainSharePct.toFixed(1)}%` }} />
            <i
              className="l"
              style={{ left: `${gainSharePct.toFixed(1)}%`, width: `${lossSharePct.toFixed(1)}%` }}
            />
          </div>
        </div>
      </section>

      {/* ROW 2 KPI 3: Average realised R */}
      <section className="tile kpi k3" aria-label="Average realised R">
        <div className="head">
          <span className="lbl">Average realised R</span>
          <span className="pill vi">{closedTrades.length} closed</span>
        </div>
        <div>
          <div className="v" style={{ color: 'var(--tw-s3)' }}>
            {formatSignedR(avgR)}
          </div>
          <div className="sub">
            {closedTrades.length}-trade mean {formatSignedR(avgR)} · Σ {formatSignedR(totalR)}
          </div>
          <div className="dots" aria-hidden="true">
            {closedTrades.slice(-8).map((t) => {
              const r = t.realizedR || 0;
              return (
                <i
                  key={t.id}
                  style={{
                    left: `${rToDotLeftPct(r).toFixed(1)}%`,
                    background: r >= 0 ? 'var(--tw-gain)' : 'var(--tw-loss)',
                  }}
                />
              );
            })}
          </div>
        </div>
      </section>

      {/* ROW 2 KPI 4: Largest loss */}
      <section className="tile kpi k4" aria-label="Largest loss">
        <div className="head">
          <span className="lbl">Largest loss</span>
          <span className="pill l">
            {lossCount} trade{lossCount === 1 ? '' : 's'}
          </span>
        </div>
        <div>
          <div className="v loss">
            {largestLossTrade ? formatSignedR(largestLossR) : '0.00R'}
          </div>
          <div className="sub">
            {largestLossTrade
              ? `${largestLossTrade.instrumentSymbol} · ${formatSignedCurrency(largestLossPnl)} · ${
                  largestLossTrade.exitTime
                    ? new Date(largestLossTrade.exitTime).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        timeZone: 'UTC',
                      })
                    : 'Closed'
                }`
              : 'No losing trades recorded'}
          </div>
          <div className="micro" aria-hidden="true">
            <i
              className="l"
              style={{
                left: 0,
                width: `${largestLossTrade ? Math.min(100, Math.abs(largestLossR) * 33.3).toFixed(1) : 0}%`,
              }}
            />
          </div>
        </div>
      </section>

      {/* ROW 3 LEFT: DETAILED EXECUTION ATTRIBUTION TABLE (Cols 1-8) */}
      <section className="tile exec" aria-label="Detailed execution attribution">
        <div className="head">
          <span className="eyebrow">Detailed execution attribution</span>
          <span className="sub">
            {closedTrades.length} of {closedTrades.length} trades closed
          </span>
        </div>

        <div className="tw-rep-table-wrap">
          {closedTrades.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--tw-ink-3)] font-mono">
              No closed executions in scope. Record or import trades to build attribution.
            </div>
          ) : (
            <table className="ex">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Asset</th>
                  <th>Side</th>
                  <th>In → out</th>
                  <th>Strategy</th>
                  <th>R-multiple</th>
                  <th className="num">Net P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {closedTrades.map((t) => {
                  const rVal = t.realizedR || 0;
                  const exitPrice = t.allocations?.[0]?.exitPrice;
                  const magPct = Math.min(1, Math.abs(rVal) / 3) * 50;
                  const isBuy = t.direction === 'BUY';
                  const isWin = t.netPnl >= 0;
                  return (
                    <tr key={t.id}>
                      <td className="mono">{(t.exitTime || t.entryTime || '').slice(0, 10)}</td>
                      <td className="asset">{t.instrumentSymbol}</td>
                      <td>
                        <span className={`side ${isBuy ? 'buy' : 'sell'}`}>{t.direction}</span>
                      </td>
                      <td className="mono">
                        {t.entryPrice} → {exitPrice !== undefined ? exitPrice : '—'}
                      </td>
                      <td className="strat">{t.strategyName || t.setupType || 'Discretionary'}</td>
                      <td>
                        <div className="rcell">
                          <span className="rb">
                            <i
                              className={rVal >= 0 ? 'p' : 'n'}
                              style={{
                                left: rVal >= 0 ? '50%' : `${(50 - magPct).toFixed(1)}%`,
                                width: `${magPct.toFixed(1)}%`,
                              }}
                            />
                          </span>
                          <span className={`rn ${rVal >= 0 ? 'gain' : 'loss'}`}>
                            {formatSignedR(rVal)}
                          </span>
                        </div>
                      </td>
                      <td className={`mono num ${isWin ? 'gain' : 'loss'}`}>
                        {formatSignedCurrency(t.netPnl)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5}>
                    Total, {closedTrades.length} closed trade{closedTrades.length === 1 ? '' : 's'}
                  </td>
                  <td>
                    <span className={`rn ${totalR >= 0 ? 'gain' : 'loss'}`}>
                      {formatSignedR(totalR)}
                    </span>
                  </td>
                  <td className={`mono num ${netProfit >= 0 ? 'gain' : 'loss'}`}>
                    {formatSignedCurrency(netProfit)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </section>

      {/* ROW 3 RIGHT: STRATEGY ATTRIBUTION DONUT (Cols 9-12) */}
      <section className="tile strat-tile" aria-label="Strategy attribution">
        <div className="head">
          <span className="eyebrow">Strategy attribution</span>
          <span className="sub">Share of net P&amp;L</span>
        </div>

        <div className="donut">
          <svg viewBox="0 0 120 120" role="img" aria-label="Strategy share donut">
            <circle
              cx="60"
              cy="60"
              r="50"
              style={{ fill: 'none', stroke: 'var(--tw-track)', strokeWidth: 16 }}
            />
            <g transform="rotate(-90 60 60)" style={{ fill: 'none', strokeWidth: 16 }}>
              {strategyArcs.map((arc) => (
                <circle
                  key={arc.name}
                  cx="60"
                  cy="60"
                  r="50"
                  style={{
                    stroke: arc.color,
                    strokeDasharray: arc.dash,
                    strokeDashoffset: arc.offset,
                  }}
                />
              ))}
            </g>
            <text
              x="60"
              y="58"
              textAnchor="middle"
              className="mono"
              style={{ fontSize: 13.5, fontWeight: 600, fill: 'var(--tw-ink)' }}
            >
              {formatSignedCurrency(netProfit).replace('.00', '')}
            </text>
            <text
              x="60"
              y="72"
              textAnchor="middle"
              style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '0.06em', fill: 'var(--tw-ink-3)' }}
            >
              NET P&amp;L
            </text>
          </svg>

          <div className="lgs">
            {strategies.length === 0 ? (
              <div className="text-xs text-[var(--tw-ink-3)] font-mono">
                No strategy attribution yet
              </div>
            ) : (
              strategies.slice(0, 3).map((st) => (
                <div className="lg" key={st.name}>
                  <i style={{ background: st.color }} />
                  <b title={st.name}>{st.shortName}</b>
                  <span className={`mono ${st.pnl >= 0 ? 'gain' : 'loss'}`}>
                    {formatSignedCurrency(st.pnl).replace('.00', '')}
                  </span>
                  <span className="sub">
                    {st.count} trade{st.count === 1 ? '' : 's'} · {st.winRate.toFixed(0)}% win ·{' '}
                    {formatSignedR(st.totalR)} · {st.sharePct.toFixed(1)}%
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="sumline">
          <span>Attributed total</span>
          <span className="mono">
            {formatSignedR(totalR)} · {formatSignedCurrency(netProfit)}
          </span>
        </div>
      </section>

      {/* ROW 4 LEFT: PROP-FIRM RULE LIMITS (Cols 1-8) */}
      <section className="tile rules" aria-label="Prop-firm rule limits">
        <div className="head">
          <span className="eyebrow">Prop-firm rule limits</span>
          <span className="sub">
            {rules.length} rules · {scopeLabel.toLowerCase()}
          </span>
        </div>

        <div className="rgrid">
          {rules.map((r) => (
            <div className="rule" key={r.id} style={{ '--c': r.color } as React.CSSProperties}>
              <span className="t">{r.title}</span>
              <span className="v">{r.headline}</span>
              <span className="s">{r.subtitle}</span>
              <div className="meter" aria-hidden="true">
                <i style={{ width: `${Math.min(100, Math.max(4, r.pct))}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ROW 4 RIGHT: AUTOMATED AUDIT CERTIFICATION SEAL (Cols 9-12) */}
      <section className="tile cert" aria-label="Automated audit certification">
        <svg className="seal" viewBox="0 0 76 76" aria-hidden="true">
          <circle cx="38" cy="38" r="36" style={{ fill: 'var(--tw-sun)' }} />
          <circle
            cx="38"
            cy="38"
            r="30"
            style={{
              fill: 'none',
              stroke: 'var(--tw-sun-ink)',
              strokeWidth: 1.25,
              strokeDasharray: '2 3',
              opacity: 0.45,
            }}
          />
          <path
            d="M26 39 L34 47 L51 29"
            style={{
              fill: 'none',
              stroke: 'var(--tw-sun-ink)',
              strokeWidth: 4.5,
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
            }}
          />
        </svg>

        <div className="txt">
          <div className="row">
            <span className="eyebrow">Audit certification</span>
            <span className={`pill ${breachedRulesCount > 0 ? 'l' : 'ok'}`}>
              {breachedRulesCount > 0 ? 'Review needed' : 'Compliant'}
            </span>
          </div>
          <p>Derived by EdgeLedger&apos;s calculation engine, with zero floating-point approximation.</p>
          <span className="fine mono">Ref {auditRefId}</span>
        </div>
      </section>
    </main>
  );
};

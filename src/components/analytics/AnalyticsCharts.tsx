'use client';

import React, { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  RotateCcw,
} from 'lucide-react';
import type {
  AnalyticsFilterState,
  BreakdownRow,
  CurveValueMode,
  DeskRuleMonitor,
  EquitySeries,
  HeatmapCell,
  RHistogramBin,
  StrategyAttributionRow,
  StreakClusterStats,
} from '@/lib/analytics/analyticsEngine';
import {
  ChartHeaderBar,
  CurrencyText,
  SampleStatusPill,
  downloadCsvFile,
  downloadSvgElementAsPng,
  formatPercentSigned,
  formatRSigned,
} from './AnalyticsShared';

type DrilldownSelection = NonNullable<AnalyticsFilterState['drilldown']>;

function getSeriesStroke(index: number, isCombined: boolean): { color: string; dash?: string } {
  if (isCombined) return { color: 'var(--tw-focus)' };
  const palette = [
    { color: 'var(--tw-s1)', dash: undefined },
    { color: 'var(--tw-s2)', dash: '6 4' },
    { color: 'var(--tw-s3)', dash: '2 4' },
    { color: 'var(--tw-gain)', dash: '10 3 2 3' },
  ];
  return palette[index % palette.length];
}

// ============================================================================
// MODULE 1: Equity & Drawdown
// ============================================================================
export function EquityDrawdownModule({
  combined,
  perDesk,
  curveMode,
  onChangeCurveMode,
  isPnlHidden,
  dateRangeLabel,
}: {
  combined: EquitySeries;
  perDesk: EquitySeries[];
  curveMode: CurveValueMode;
  onChangeCurveMode: (mode: CurveValueMode) => void;
  isPnlHidden: boolean;
  dateRangeLabel: string;
}) {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const [showPerDesk, setShowPerDesk] = useState<boolean>(true);
  const [activeIndex, setActiveIndex] = useState<number>(() =>
    Math.max(0, combined.points.length - 1)
  );
  const svgRef = useRef<SVGSVGElement | null>(null);

  const safeIdx = Math.min(activeIndex, Math.max(0, combined.points.length - 1));
  const activePoint = combined.points[safeIdx] ?? null;

  const width = 860;
  const eqHeight = 250;
  const ddHeight = 145;
  const totalHeight = eqHeight + ddHeight + 24;
  const padL = 88;
  const padR = 26;
  const padT = 28;
  const plotW = width - padL - padR;

  const visibleSeries = useMemo(() => {
    const list: Array<{ series: EquitySeries; isCombined: boolean }> = [
      { series: combined, isCombined: true },
    ];
    if (showPerDesk) {
      for (const d of perDesk) {
        if (d.points.length > 0) list.push({ series: d, isCombined: false });
      }
    }
    return list;
  }, [combined, perDesk, showPerDesk]);

  const { minY, maxY, maxDd } = useMemo(() => {
    let minVal = Infinity;
    let maxVal = -Infinity;
    let maxDrawdown = 0.5;
    for (const item of visibleSeries) {
      for (const p of item.series.points) {
        const val = curveMode === 'equity' ? p.equity : p.balance;
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
        if (p.drawdownPct > maxDrawdown) maxDrawdown = p.drawdownPct;
      }
    }
    if (!Number.isFinite(minVal) || !Number.isFinite(maxVal)) {
      return { minY: 0, maxY: 100, maxDd: 1 };
    }
    const pad = Math.max((maxVal - minVal) * 0.14, 150);
    return {
      minY: minVal - pad,
      maxY: maxVal + pad,
      maxDd: Math.max(maxDrawdown * 1.2, 1),
    };
  }, [visibleSeries, curveMode]);

  const xScale = (idx: number, len: number) => {
    if (len <= 1) return padL + plotW / 2;
    return padL + (idx / (len - 1)) * plotW;
  };

  const yEqScale = (val: number) => {
    const span = maxY - minY || 1;
    return padT + (1 - (val - minY) / span) * (eqHeight - padT - 34);
  };

  const ddTop = eqHeight + 24;
  const ddPlotH = ddHeight - 36;
  const yDdScale = (ddPct: number) => ddTop + 12 + (ddPct / (maxDd || 1)) * ddPlotH;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (combined.points.length === 0) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(combined.points.length - 1, prev + 1));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(0, prev - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(combined.points.length - 1);
    }
  };

  const exportCsv = () => {
    const headers = ['Step', 'Date', 'Label', 'Equity USD', 'Balance USD', 'Drawdown %', 'Drawdown USD'];
    const rows = combined.points.map((p) => [
      p.index,
      p.dateKey,
      p.label,
      p.equity.toFixed(2),
      p.balance.toFixed(2),
      (-p.drawdownPct).toFixed(2),
      (-p.drawdownDollars).toFixed(2),
    ]);
    downloadCsvFile('edgeledger-equity-drawdown.csv', headers, rows);
  };

  const eqTicks = 4;
  const peakIdx = combined.peakIndex;
  const troughIdx = combined.troughIndex;
  const recoveryIdx = combined.recoveryIndex ?? -1;
  const closedCount = Math.max(0, combined.points.length - 1);

  return (
    <section className="tw-bento-tile tw-ana-span12" aria-label="1. Equity and Drawdown">
      <ChartHeaderBar
        title="1. Equity & Drawdown"
        subtitle={`Peak, trough, and recovery markers across ${dateRangeLabel}`}
        unitLabel={curveMode === 'equity' ? 'USD Equity / DD %' : 'USD Balance / DD %'}
        n={closedCount}
        viewMode={viewMode}
        onToggleViewMode={setViewMode}
        onExportPng={() => downloadSvgElementAsPng(svgRef.current, 'edgeledger-equity-drawdown.png')}
        onExportCsv={exportCsv}
        extraControls={
          <>
            <div className="tw-seg tw-ana-mini-seg" role="group" aria-label="Curve valuation basis">
              <button
                type="button"
                className={curveMode === 'equity' ? 'on' : ''}
                aria-pressed={curveMode === 'equity'}
                onClick={() => onChangeCurveMode('equity')}
              >
                Equity
              </button>
              <button
                type="button"
                className={curveMode === 'balance' ? 'on' : ''}
                aria-pressed={curveMode === 'balance'}
                onClick={() => onChangeCurveMode('balance')}
              >
                Balance
              </button>
            </div>
            <button
              type="button"
              className={`tw-ana-chip-btn ${showPerDesk ? 'on' : ''}`}
              aria-pressed={showPerDesk}
              onClick={() => setShowPerDesk((v) => !v)}
            >
              {showPerDesk ? 'Showing Desks' : 'Combined Only'}
            </button>
          </>
        }
      />

      {/* Landmark summary bar */}
      <div className="tw-ana-landmark-strip">
        <div className="tw-ana-landmark-item">
          <small>▲ Peak ({combined.peakDate || '—'})</small>
          <strong>
            <CurrencyText amount={combined.peakValue} isPnlHidden={isPnlHidden} signed={false} />
          </strong>
        </div>
        <div className="tw-ana-landmark-item">
          <small>▼ Max Trough ({combined.troughDate || '—'})</small>
          <strong className={combined.maxDrawdownPct > 0 ? 'tw-neg' : ''}>
            {formatPercentSigned(-combined.maxDrawdownPct)}
          </strong>
        </div>
        <div className="tw-ana-landmark-item">
          <small>● Recovery</small>
          <strong className={combined.recoveryDate ? 'tw-pos' : ''}>
            {combined.recoveryDate
              ? combined.recoveryDate === 'No drawdown'
                ? 'No drawdown'
                : `Recovered ${combined.recoveryDate}`
              : 'Unrecovered (open DD)'}
          </strong>
        </div>
        <div className="tw-ana-landmark-item">
          <small>Selected Point</small>
          <strong>
            {activePoint ? (
              <>
                {activePoint.dateKey} ·{' '}
                <CurrencyText
                  amount={curveMode === 'equity' ? activePoint.equity : activePoint.balance}
                  isPnlHidden={isPnlHidden}
                  signed={false}
                />{' '}
                ({formatPercentSigned(-activePoint.drawdownPct)})
              </>
            ) : (
              '—'
            )}
          </strong>
        </div>
      </div>

      {viewMode === 'chart' ? (
        <div
          className="tw-ana-svg-wrap"
          tabIndex={0}
          role="region"
          aria-label="Equity and drawdown chart. Use Left and Right arrow keys to inspect closed-trade milestones."
          onKeyDown={handleKeyDown}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${totalHeight}`}
            className="tw-ana-svg"
            role="img"
            aria-labelledby="eq-svg-title"
          >
            <title id="eq-svg-title">Combined and Per-Desk Equity Curve with Drawdown Panel</title>

            {Array.from({ length: eqTicks + 1 }).map((_, idx) => {
              const frac = idx / eqTicks;
              const val = minY + frac * (maxY - minY);
              const y = yEqScale(val);
              return (
                <g key={idx}>
                  <line
                    x1={padL}
                    x2={width - padR}
                    y1={y}
                    y2={y}
                    stroke="var(--tw-line)"
                    strokeDasharray="3 4"
                  />
                  <text
                    x={padL - 8}
                    y={y + 4}
                    textAnchor="end"
                    fontSize="11"
                    fontFamily="'JetBrains Mono', monospace"
                    fill="var(--tw-ink-3)"
                    className={isPnlHidden ? 'tw-pnl-blur' : ''}
                  >
                    ${Math.round(val).toLocaleString('en-US')}
                  </text>
                </g>
              );
            })}

            <text
              x={padL}
              y={14}
              textAnchor="start"
              fontSize="10"
              fontWeight="600"
              fontFamily="'JetBrains Mono', monospace"
              fill="var(--tw-ink-3)"
            >
              {curveMode === 'equity' ? 'UNIT: EQUITY ($)' : 'UNIT: BALANCE ($)'}
            </text>
            <text
              x={padL}
              y={ddTop + 6}
              textAnchor="start"
              fontSize="10"
              fontWeight="600"
              fontFamily="'JetBrains Mono', monospace"
              fill="var(--tw-ink-3)"
            >
              UNIT: DRAWDOWN (%)
            </text>

            {visibleSeries.map(({ series, isCombined }, sIdx) => {
              const pts = series.points;
              if (pts.length === 0) return null;
              const { color, dash } = getSeriesStroke(sIdx - 1, isCombined);
              const d = pts
                .map((p, i) => {
                  const x = xScale(i, pts.length);
                  const y = yEqScale(curveMode === 'equity' ? p.equity : p.balance);
                  return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                })
                .join(' ');
              return (
                <g key={series.id}>
                  <path
                    d={d}
                    fill="none"
                    stroke={color}
                    strokeWidth={isCombined ? 2.8 : 1.7}
                    strokeDasharray={dash}
                    className="tw-ana-chart-transition"
                  />
                  {isCombined &&
                    pts.map((p, i) => {
                      const cx = xScale(i, pts.length);
                      const cy = yEqScale(curveMode === 'equity' ? p.equity : p.balance);
                      const isPeak = p.index === peakIdx && i > 0;
                      const isTrough = p.index === troughIdx && p.drawdownPct > 0;
                      const isRec = p.index === recoveryIdx;
                      const isActive = i === safeIdx;
                      return (
                        <g
                          key={p.index}
                          className="tw-ana-svg-point"
                          onClick={() => setActiveIndex(i)}
                        >
                          <circle
                            cx={cx}
                            cy={cy}
                            r={isActive ? 6 : 4}
                            fill={isTrough ? 'var(--tw-loss)' : isActive ? 'var(--tw-warn)' : 'var(--tw-focus)'}
                            stroke="var(--tw-tile)"
                            strokeWidth="2"
                          />
                          {isPeak && (
                            <text
                              x={Math.min(width - padR - 4, Math.max(padL + 10, cx))}
                              y={Math.max(14, cy - 10)}
                              textAnchor={i === pts.length - 1 ? 'end' : 'middle'}
                              fontSize="10"
                              fontWeight="700"
                              fontFamily="'JetBrains Mono', monospace"
                              fill="var(--tw-gain)"
                            >
                              ▲ Peak
                            </text>
                          )}
                          {isTrough && (
                            <text
                              x={cx}
                              y={Math.min(eqHeight - 8, cy + 16)}
                              textAnchor="middle"
                              fontSize="10"
                              fontWeight="700"
                              fontFamily="'JetBrains Mono', monospace"
                              fill="var(--tw-loss)"
                            >
                              ▼ Trough
                            </text>
                          )}
                          {isRec && (
                            <text
                              x={cx}
                              y={Math.min(eqHeight - 8, cy + 16)}
                              textAnchor={i === pts.length - 1 ? 'end' : 'middle'}
                              fontSize="10"
                              fontWeight="700"
                              fontFamily="'JetBrains Mono', monospace"
                              fill="var(--tw-s1)"
                            >
                              ● Recovered
                            </text>
                          )}
                        </g>
                      );
                    })}
                </g>
              );
            })}

            <line
              x1={padL}
              x2={width - padR}
              y1={ddTop + 12}
              y2={ddTop + 12}
              stroke="var(--tw-line-strong)"
            />
            {[0, maxDd * 0.5, maxDd].map((ddTick, i) => {
              const y = yDdScale(ddTick);
              return (
                <g key={i}>
                  <line
                    x1={padL}
                    x2={width - padR}
                    y1={y}
                    y2={y}
                    stroke="var(--tw-line)"
                    strokeDasharray="2 4"
                  />
                  <text
                    x={padL - 8}
                    y={y + 4}
                    textAnchor="end"
                    fontSize="11"
                    fontFamily="'JetBrains Mono', monospace"
                    fill="var(--tw-ink-3)"
                  >
                    {ddTick === 0 ? '0.0%' : `−${ddTick.toFixed(1)}%`}
                  </text>
                </g>
              );
            })}

            {combined.points.length > 1 && (
              <>
                <path
                  d={
                    combined.points
                      .map((p, i) => {
                        const x = xScale(i, combined.points.length);
                        const y = yDdScale(p.drawdownPct);
                        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                      })
                      .join(' ') +
                    ` L ${xScale(combined.points.length - 1, combined.points.length).toFixed(1)} ${yDdScale(0).toFixed(1)} L ${xScale(0, combined.points.length).toFixed(1)} ${yDdScale(0).toFixed(1)} Z`
                  }
                  fill="var(--tw-loss-bg)"
                  opacity="0.75"
                />
                <path
                  d={combined.points
                    .map((p, i) => {
                      const x = xScale(i, combined.points.length);
                      const y = yDdScale(p.drawdownPct);
                      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
                    })
                    .join(' ')}
                  fill="none"
                  stroke="var(--tw-loss)"
                  strokeWidth="2"
                />
              </>
            )}

            {activePoint && (
              <line
                x1={xScale(safeIdx, combined.points.length)}
                x2={xScale(safeIdx, combined.points.length)}
                y1={padT}
                y2={ddTop + 12 + ddPlotH}
                stroke="var(--tw-focus)"
                strokeWidth="1.2"
                strokeDasharray="3 3"
              />
            )}

            {combined.points.map((p, i) => {
              const showTick =
                combined.points.length <= 7 ||
                i === 0 ||
                i === combined.points.length - 1 ||
                i % Math.ceil(combined.points.length / 6) === 0;
              if (!showTick) return null;
              const x = xScale(i, combined.points.length);
              return (
                <text
                  key={p.index}
                  x={x}
                  y={totalHeight - 6}
                  textAnchor={
                    i === 0 ? 'start' : i === combined.points.length - 1 ? 'end' : 'middle'
                  }
                  fontSize="10"
                  fontFamily="'JetBrains Mono', monospace"
                  fill="var(--tw-ink-3)"
                >
                  {p.label}
                </text>
              );
            })}
          </svg>

          <div className="tw-ana-legend" aria-label="Equity series legend">
            {visibleSeries.map(({ series, isCombined }, idx) => {
              const { color, dash } = getSeriesStroke(idx - 1, isCombined);
              return (
                <span key={series.id} className="tw-ana-legend-item">
                  <svg width="24" height="8" aria-hidden="true">
                    <line
                      x1="0"
                      x2="24"
                      y1="4"
                      y2="4"
                      stroke={color}
                      strokeWidth={isCombined ? 3 : 2}
                      strokeDasharray={dash}
                    />
                  </svg>
                  <span>{series.label}</span>
                </span>
              );
            })}
            <span className="tw-ana-kbd-hint">Use ← / → arrow keys to step points</span>
          </div>
        </div>
      ) : (
        <div className="tw-ana-table-wrap">
          <table className="tw-ana-table">
            <thead>
              <tr>
                <th>Milestone</th>
                <th>Date</th>
                <th>Trade</th>
                <th>{curveMode === 'equity' ? 'Equity ($)' : 'Balance ($)'}</th>
                <th>Drawdown %</th>
                <th>Drawdown ($)</th>
              </tr>
            </thead>
            <tbody>
              {combined.points.map((p) => (
                <tr key={p.index}>
                  <td>#{p.index}</td>
                  <td>{p.dateKey}</td>
                  <td>{p.label}</td>
                  <td>
                    <CurrencyText
                      amount={curveMode === 'equity' ? p.equity : p.balance}
                      isPnlHidden={isPnlHidden}
                      signed={false}
                    />
                  </td>
                  <td className={p.drawdownPct > 0 ? 'tw-neg' : ''}>
                    {formatPercentSigned(-p.drawdownPct)}
                  </td>
                  <td className={p.drawdownDollars > 0 ? 'tw-neg' : ''}>
                    <CurrencyText amount={-p.drawdownDollars} isPnlHidden={isPnlHidden} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ============================================================================
// MODULE 2: Firm-Rule Monitor
// ============================================================================
export function FirmRuleMonitorModule({
  monitors,
  onUpdateConfig,
  onResetConfig,
}: {
  monitors: DeskRuleMonitor[];
  onUpdateConfig: (accountId: string, patch: Partial<DeskRuleMonitor['config']>) => void;
  onResetConfig: (accountId: string) => void;
}) {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');

  const exportCsv = () => {
    const headers = ['Desk', 'Rule', 'Current', 'Limit', 'Usage %', 'Status'];
    const rows: Array<Array<string | number>> = [];
    for (const m of monitors) {
      for (const r of m.bars) {
        rows.push([
          m.shortLabel,
          r.label,
          r.formattedUsage,
          r.formattedLimit,
          r.usagePct.toFixed(1),
          r.statusLabel,
        ]);
      }
    }
    downloadCsvFile('edgeledger-firm-rules.csv', headers, rows);
  };

  return (
    <section className="tw-bento-tile tw-ana-span12" aria-label="2. Firm-Rule Monitor">
      <ChartHeaderBar
        title="2. Firm-Rule Monitor"
        subtitle="Configurable per-desk risk gates · Amber warning at 80%, red breach at 100%"
        unitLabel="% of Rule Threshold"
        n={monitors.length}
        viewMode={viewMode}
        onToggleViewMode={setViewMode}
        onExportCsv={exportCsv}
      />

      {viewMode === 'chart' ? (
        <div className="tw-ana-rules-4">
          {monitors.map((desk) => {
            const hasBreach = desk.bars.some((b) => b.status === 'red');
            const hasWarn = desk.bars.some((b) => b.status === 'amber');
            const deskStatusClass = hasBreach ? 'breach' : hasWarn ? 'amber' : 'ok';
            const deskStatusText = hasBreach ? 'Breach' : hasWarn ? 'Warning' : 'On track';
            return (
              <article key={desk.accountId} className="tw-ana-rcard">
                <div className="tw-ana-rcard-head">
                  <div>
                    <h3>{desk.shortLabel}</h3>
                    <span className="tw-ana-rule-sub">{desk.accountName}</span>
                  </div>
                  <span className={`tw-ana-status-tag ${deskStatusClass}`}>{deskStatusText}</span>
                </div>

                <div className="tw-ana-rule-bars">
                  {desk.bars.map((rule) => {
                    const scaledFill = (Math.min(120, Math.max(0, rule.usagePct)) / 120) * 100;
                    const statusClass =
                      rule.status === 'red' ? 'breach' : rule.status === 'amber' ? 'amber' : 'ok';
                    return (
                      <div key={rule.id} className="tw-ana-rule-row">
                        <div className="tw-ana-rule-meta">
                          <span>{rule.label}</span>
                          <span className="tw-ana-rule-nums">
                            {rule.formattedUsage} / {rule.formattedLimit}
                          </span>
                        </div>
                        <div
                          className="tw-ana-rule-track-v2"
                          role="progressbar"
                          aria-valuenow={Math.round(rule.usagePct)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${desk.shortLabel} ${rule.label}`}
                        >
                          <div
                            className={`tw-ana-rule-fill ${statusClass} tw-ana-chart-transition`}
                            style={{ width: `${scaledFill}%` }}
                          />
                          {rule.unit === 'pct' && (
                            <span
                              className="tw-ana-rule-tick-80"
                              style={{ left: `${(80 / 120) * 100}%` }}
                              title="80% Warning Threshold"
                            />
                          )}
                          <span
                            className="tw-ana-rule-tick-100"
                            style={{ left: `${(100 / 120) * 100}%` }}
                            title="100% Limit Threshold"
                          />
                        </div>
                        <div className="tw-ana-rule-foot">
                          <span className={`tw-ana-status-tag ${statusClass}`}>
                            {rule.status === 'red' ? (
                              <>
                                <XCircle size={12} aria-hidden="true" />
                                <span>{rule.statusLabel}</span>
                              </>
                            ) : rule.status === 'amber' ? (
                              <>
                                <AlertTriangle size={12} aria-hidden="true" />
                                <span>{rule.statusLabel}</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 size={12} aria-hidden="true" />
                                <span>{rule.statusLabel}</span>
                              </>
                            )}
                          </span>
                          <span className="tw-ana-rule-pct">{rule.usagePct.toFixed(1)}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <details className="tw-ana-rule-config">
                  <summary>Configure rules</summary>
                  <div className="tw-ana-rule-inputs">
                    <label>
                      <span>Max Daily Loss %</span>
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        max="100"
                        value={desk.config.maxDailyLossPct}
                        onChange={(e) =>
                          onUpdateConfig(desk.accountId, {
                            maxDailyLossPct: Math.max(0.5, Number(e.target.value) || 0.5),
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>Max Total DD %</span>
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        max="100"
                        value={desk.config.maxTotalDrawdownPct}
                        onChange={(e) =>
                          onUpdateConfig(desk.accountId, {
                            maxTotalDrawdownPct: Math.max(0.5, Number(e.target.value) || 0.5),
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>Min Trading Days</span>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        max="60"
                        value={desk.config.minTradingDays}
                        onChange={(e) =>
                          onUpdateConfig(desk.accountId, {
                            minTradingDays: Math.max(1, Math.round(Number(e.target.value) || 1)),
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>Best-Day Share %</span>
                      <input
                        type="number"
                        step="5"
                        min="5"
                        max="100"
                        value={desk.config.maxBestDayProfitSharePct}
                        onChange={(e) =>
                          onUpdateConfig(desk.accountId, {
                            maxBestDayProfitSharePct: Math.max(5, Number(e.target.value) || 5),
                          })
                        }
                      />
                    </label>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <button
                      type="button"
                      className="tw-ana-icon-btn"
                      onClick={() => onResetConfig(desk.accountId)}
                      title="Reset desk rule config to account defaults"
                    >
                      <RotateCcw size={12} aria-hidden="true" />
                      <span>Reset defaults</span>
                    </button>
                  </div>
                </details>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="tw-ana-table-wrap">
          <table className="tw-ana-table">
            <thead>
              <tr>
                <th>Desk</th>
                <th>Rule</th>
                <th>Current</th>
                <th>Configured Limit</th>
                <th>Usage %</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {monitors.flatMap((desk) =>
                desk.bars.map((r) => {
                  const statusClass =
                    r.status === 'red' ? 'breach' : r.status === 'amber' ? 'amber' : 'ok';
                  return (
                    <tr key={`${desk.accountId}-${r.id}`}>
                      <td>{desk.shortLabel}</td>
                      <td>{r.label}</td>
                      <td>{r.formattedUsage}</td>
                      <td>{r.formattedLimit}</td>
                      <td>{r.usagePct.toFixed(1)}%</td>
                      <td>
                        <span className={`tw-ana-status-tag ${statusClass}`}>
                          {r.statusLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ============================================================================
// MODULE 3: R-Multiple Distribution
// ============================================================================
export function RDistributionModule({
  bins,
  meanR,
  medianR,
  expectancyUsd,
  n,
  isPnlHidden,
  activeDrilldown,
  onSelectDrilldown,
  dateRangeLabel,
}: {
  bins: RHistogramBin[];
  meanR: number;
  medianR: number;
  expectancyUsd: number;
  n: number;
  isPnlHidden: boolean;
  activeDrilldown?: DrilldownSelection | null;
  onSelectDrilldown: (d?: DrilldownSelection) => void;
  dateRangeLabel: string;
}) {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const [focusedBinIdx, setFocusedBinIdx] = useState<number>(0);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const width = 620;
  const height = 240;
  const padL = 48;
  const padR = 20;
  const padT = 34;
  const padB = 40;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const maxCount = Math.max(1, ...bins.map((b) => b.count));

  const mapRToX = (r: number) => {
    const clamped = Math.max(-2, Math.min(4, r));
    return padL + ((clamped + 2) / 6) * plotW;
  };

  const zeroX = mapRToX(0);
  const meanX = mapRToX(meanR);
  const medianX = mapRToX(medianR);
  const activeBin = bins[focusedBinIdx] ?? bins[0];

  const handleBinClick = (bin: RHistogramBin) => {
    const isSame = activeDrilldown?.type === 'rbin' && activeDrilldown.value === bin.id;
    onSelectDrilldown(
      isSame
        ? undefined
        : { type: 'rbin', value: bin.id, label: `R-multiple ${bin.label}` }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setFocusedBinIdx((i) => Math.min(bins.length - 1, i + 1));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setFocusedBinIdx((i) => Math.max(0, i - 1));
    } else if ((e.key === 'Enter' || e.key === ' ') && activeBin) {
      e.preventDefault();
      handleBinClick(activeBin);
    }
  };

  return (
    <section className="tw-bento-tile tw-ana-span6" aria-label="3. R-Multiple Distribution">
      <ChartHeaderBar
        title="3. R-Multiple Distribution"
        subtitle={`Histogram with 0R, Mean & Median lines · ${dateRangeLabel}`}
        unitLabel="Count / R-multiple"
        n={n}
        viewMode={viewMode}
        onToggleViewMode={setViewMode}
        onExportPng={() => downloadSvgElementAsPng(svgRef.current, 'edgeledger-r-distribution.png')}
        onExportCsv={() =>
          downloadCsvFile(
            'edgeledger-r-distribution.csv',
            ['Bin', 'Count', 'Net USD'],
            bins.map((b) => [b.label, b.count, b.netPnl.toFixed(2)])
          )
        }
      />

      <div className="tw-ana-stat-strip">
        <div>
          <small>Expectancy (R)</small>
          <strong className={meanR >= 0 ? 'tw-pos' : 'tw-neg'}>
            {n > 0 ? formatRSigned(meanR) : '—'}
          </strong>
        </div>
        <div>
          <small>Expectancy ($)</small>
          <strong className={expectancyUsd >= 0 ? 'tw-pos' : 'tw-neg'}>
            {n > 0 ? <CurrencyText amount={expectancyUsd} isPnlHidden={isPnlHidden} /> : '—'}
          </strong>
        </div>
        <div>
          <small>Mean R</small>
          <strong>{n > 0 ? formatRSigned(meanR) : '—'}</strong>
        </div>
        <div>
          <small>Median R</small>
          <strong>{n > 0 ? formatRSigned(medianR) : '—'}</strong>
        </div>
      </div>

      {activeBin && (
        <div className="tw-ana-tooltip-bar" role="status">
          <span>
            Bin <strong>{activeBin.label}</strong>
          </span>
          <span>n = {activeBin.count} trades</span>
          <span>
            Net: <CurrencyText amount={activeBin.netPnl} isPnlHidden={isPnlHidden} />
          </span>
          <span className="tw-ana-kbd-hint">Click or Enter to filter</span>
        </div>
      )}

      {viewMode === 'chart' ? (
        <div
          className="tw-ana-svg-wrap"
          tabIndex={0}
          role="region"
          aria-label="R-multiple histogram. Arrow keys navigate bins; Enter filters trade table."
          onKeyDown={handleKeyDown}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            className="tw-ana-svg"
            role="img"
            aria-labelledby="rdist-svg-title"
          >
            <title id="rdist-svg-title">R-Multiple Distribution Histogram</title>

            {[0, Math.ceil(maxCount / 2), maxCount].map((tick, idx) => {
              const y = padT + plotH - (tick / maxCount) * plotH;
              return (
                <g key={idx}>
                  <line x1={padL} x2={width - padR} y1={y} y2={y} stroke="var(--tw-line)" strokeDasharray="3 4" />
                  <text
                    x={padL - 8}
                    y={y + 4}
                    textAnchor="end"
                    fontSize="11"
                    fontFamily="'JetBrains Mono', monospace"
                    fill="var(--tw-ink-3)"
                  >
                    {tick}
                  </text>
                </g>
              );
            })}
            <text
              x={10}
              y={padT + 10}
              fontSize="10"
              fontFamily="'JetBrains Mono', monospace"
              fill="var(--tw-ink-3)"
            >
              TRADES
            </text>

            {bins.map((bin, idx) => {
              const slotW = plotW / bins.length;
              const barW = Math.max(18, slotW - 14);
              const x = padL + idx * slotW + (slotW - barW) / 2;
              const barH = (bin.count / maxCount) * plotH;
              const y = padT + plotH - barH;
              const isPos = bin.minR >= 0;
              const isSelected = activeDrilldown?.type === 'rbin' && activeDrilldown.value === bin.id;
              const isFocused = idx === focusedBinIdx;
              return (
                <g
                  key={bin.id}
                  className="tw-ana-svg-point"
                  onClick={() => {
                    setFocusedBinIdx(idx);
                    handleBinClick(bin);
                  }}
                >
                  <rect
                    x={x}
                    y={Math.min(y, padT + plotH - 2)}
                    width={barW}
                    height={Math.max(2, barH)}
                    rx={6}
                    fill={isPos ? 'var(--tw-gain)' : 'var(--tw-loss)'}
                    opacity={bin.count === 0 ? 0.18 : 0.88}
                    stroke={isSelected || isFocused ? 'var(--tw-focus)' : 'none'}
                    strokeWidth={isSelected || isFocused ? 2.2 : 0}
                    className="tw-ana-chart-transition"
                  />
                  {bin.count > 0 && (
                    <text
                      x={x + barW / 2}
                      y={Math.max(padT + 12, y - 6)}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="700"
                      fontFamily="'JetBrains Mono', monospace"
                      fill="var(--tw-ink)"
                    >
                      {bin.count}
                    </text>
                  )}
                  <text
                    x={x + barW / 2}
                    y={height - 12}
                    textAnchor="middle"
                    fontSize="10"
                    fontFamily="'JetBrains Mono', monospace"
                    fill="var(--tw-ink-2)"
                  >
                    {bin.label}
                  </text>
                </g>
              );
            })}

            {n > 0 && (
              <>
                <line x1={zeroX} x2={zeroX} y1={padT} y2={padT + plotH} stroke="var(--tw-ink-2)" strokeDasharray="4 3" strokeWidth="1.4" />
                <text x={zeroX} y={padT - 8} textAnchor="middle" fontSize="10" fontFamily="'JetBrains Mono', monospace" fill="var(--tw-ink-2)">
                  0R
                </text>

                <line x1={meanX} x2={meanX} y1={padT} y2={padT + plotH} stroke="var(--tw-s1)" strokeWidth="2" />
                <text
                  x={Math.min(width - padR - 4, meanX)}
                  y={14}
                  textAnchor={meanX > width - 85 ? 'end' : 'middle'}
                  fontSize="10"
                  fontWeight="700"
                  fontFamily="'JetBrains Mono', monospace"
                  fill="var(--tw-s1)"
                >
                  Mean {formatRSigned(meanR)}
                </text>

                <line x1={medianX} x2={medianX} y1={padT} y2={padT + plotH} stroke="var(--tw-warn)" strokeDasharray="2 3" strokeWidth="2" />
                <text
                  x={Math.min(width - padR - 4, medianX)}
                  y={25}
                  textAnchor={medianX > width - 95 ? 'end' : 'middle'}
                  fontSize="10"
                  fontWeight="700"
                  fontFamily="'JetBrains Mono', monospace"
                  fill="var(--tw-warn)"
                >
                  Med {formatRSigned(medianR)}
                </text>
              </>
            )}
          </svg>
        </div>
      ) : (
        <div className="tw-ana-table-wrap">
          <table className="tw-ana-table">
            <thead>
              <tr>
                <th>R Bin</th>
                <th>Trades (n)</th>
                <th>Net P&amp;L ($)</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {bins.map((b) => (
                <tr key={b.id}>
                  <td>{b.label}</td>
                  <td>{b.count}</td>
                  <td className={b.netPnl >= 0 ? 'tw-pos' : 'tw-neg'}>
                    <CurrencyText amount={b.netPnl} isPnlHidden={isPnlHidden} />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="tw-ana-link-btn"
                      disabled={b.count === 0}
                      onClick={() => handleBinClick(b)}
                    >
                      Filter
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ============================================================================
// MODULE 4: Edge Heatmap (Weekday x Session)
// ============================================================================
export function EdgeHeatmapModule({
  weekdays,
  sessions,
  cells,
  excludedSwingCount,
  excludeSwingFromSession,
  onToggleExcludeSwing,
  isPnlHidden,
  activeDrilldown,
  onSelectDrilldown,
  dateRangeLabel,
}: {
  weekdays: readonly string[];
  sessions: string[];
  cells: HeatmapCell[];
  excludedSwingCount: number;
  excludeSwingFromSession: boolean;
  onToggleExcludeSwing: (next: boolean) => void;
  isPnlHidden: boolean;
  activeDrilldown?: DrilldownSelection | null;
  onSelectDrilldown: (d?: DrilldownSelection) => void;
  dateRangeLabel: string;
}) {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const [focusIdx, setFocusIdx] = useState<number>(0);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const cellMap = useMemo(() => {
    const m = new Map<string, HeatmapCell>();
    for (const c of cells) m.set(`${c.weekday}::${c.session}`, c);
    return m;
  }, [cells]);

  const orderedCells = useMemo(() => {
    const out: HeatmapCell[] = [];
    for (const w of weekdays) {
      for (const s of sessions) {
        const found = cellMap.get(`${w}::${s}`);
        if (found) out.push(found);
      }
    }
    return out;
  }, [weekdays, sessions, cellMap]);

  const totalN = useMemo(
    () => orderedCells.reduce((acc, c) => acc + c.n, 0),
    [orderedCells]
  );

  const focusedCell = orderedCells[focusIdx] ?? orderedCells[0];

  const handleCellSelect = (cell: HeatmapCell) => {
    if (cell.n === 0) return;
    const key = `${cell.weekday}::${cell.session}`;
    const isSame = activeDrilldown?.type === 'heatmap' && activeDrilldown.value === key;
    onSelectDrilldown(
      isSame
        ? undefined
        : {
            type: 'heatmap',
            value: cell.weekday,
            secondaryValue: cell.session,
            label: `${cell.weekday} × ${cell.session}`,
          }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const cols = sessions.length;
    if (orderedCells.length === 0) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setFocusIdx((i) => Math.min(orderedCells.length - 1, i + 1));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setFocusIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusIdx((i) => Math.min(orderedCells.length - 1, i + cols));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIdx((i) => Math.max(0, i - cols));
    } else if ((e.key === 'Enter' || e.key === ' ') && focusedCell) {
      e.preventDefault();
      handleCellSelect(focusedCell);
    }
  };

  const width = 680;
  const leftAxisW = 68;
  const topAxisH = 38;
  const rowH = 44;
  const colW = (width - leftAxisW - 14) / Math.max(1, sessions.length);
  const height = topAxisH + weekdays.length * rowH + 14;

  return (
    <section className="tw-bento-tile tw-ana-span6" aria-label="4. Edge Heatmap">
      <ChartHeaderBar
        title="4. Edge Heatmap (Expectancy R)"
        subtitle={`Weekday × Session · Empty cells read "no trades" (${dateRangeLabel})`}
        unitLabel="Expectancy (R) / n"
        n={totalN}
        viewMode={viewMode}
        onToggleViewMode={setViewMode}
        onExportPng={() => downloadSvgElementAsPng(svgRef.current, 'edgeledger-edge-heatmap.png')}
        onExportCsv={() =>
          downloadCsvFile(
            'edgeledger-edge-heatmap.csv',
            ['Weekday', 'Session', 'Trades (n)', 'Expectancy R', 'Net USD'],
            orderedCells.map((c) => [
              c.weekday,
              c.session,
              c.n,
              c.expectancyR === null ? 'no trades' : c.expectancyR.toFixed(2),
              c.netPnl.toFixed(2),
            ])
          )
        }
        extraControls={
          <button
            type="button"
            className={`tw-ana-chip-btn ${excludeSwingFromSession ? 'on' : ''}`}
            aria-pressed={excludeSwingFromSession}
            onClick={() => onToggleExcludeSwing(!excludeSwingFromSession)}
            title="Rule: exclude Swing / HTF non-session trades from session attribution"
          >
            {excludeSwingFromSession
              ? `Swing Excluded (${excludedSwingCount})`
              : 'Swing Included'}
          </button>
        }
      />

      {focusedCell && (
        <div className="tw-ana-tooltip-bar" role="status">
          <span>
            <strong>
              {focusedCell.weekday} × {focusedCell.session}
            </strong>
          </span>
          <span>
            {focusedCell.n === 0
              ? 'no trades'
              : `Exp: ${formatRSigned(focusedCell.expectancyR ?? 0)}`}
          </span>
          <span>n = {focusedCell.n}</span>
          {focusedCell.n > 0 && (
            <span>
              Net: <CurrencyText amount={focusedCell.netPnl} isPnlHidden={isPnlHidden} />
            </span>
          )}
        </div>
      )}

      {viewMode === 'chart' ? (
        <div
          className="tw-ana-svg-wrap"
          tabIndex={0}
          role="region"
          aria-label="Weekday by session expectancy heatmap. Arrow keys move between cells; Enter filters trades."
          onKeyDown={handleKeyDown}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            className="tw-ana-svg"
            role="img"
            aria-labelledby="heatmap-svg-title"
          >
            <title id="heatmap-svg-title">Expectancy R by Weekday and Trading Session Heatmap</title>

            {sessions.map((s, colIdx) => (
              <text
                key={s}
                x={leftAxisW + colIdx * colW + colW / 2}
                y={22}
                textAnchor="middle"
                fontSize="11"
                fontWeight="600"
                fontFamily="'JetBrains Mono', monospace"
                fill="var(--tw-ink-2)"
              >
                {s === 'London Close' ? 'LDN Close' : s}
              </text>
            ))}

            {weekdays.map((w, rowIdx) => (
              <text
                key={w}
                x={leftAxisW - 10}
                y={topAxisH + rowIdx * rowH + rowH / 2 + 4}
                textAnchor="end"
                fontSize="11"
                fontWeight="600"
                fontFamily="'JetBrains Mono', monospace"
                fill="var(--tw-ink-2)"
              >
                {w}
              </text>
            ))}

            {orderedCells.map((cell, idx) => {
              const rowIdx = Math.floor(idx / sessions.length);
              const colIdx = idx % sessions.length;
              const x = leftAxisW + colIdx * colW + 3;
              const y = topAxisH + rowIdx * rowH + 3;
              const cw = colW - 6;
              const ch = rowH - 6;
              const isEmpty = cell.n === 0 || cell.expectancyR === null;
              const isPos = (cell.expectancyR ?? 0) >= 0;
              const cellKey = `${cell.weekday}::${cell.session}`;
              const isSelected =
                activeDrilldown?.type === 'heatmap' &&
                activeDrilldown.value === cell.weekday &&
                activeDrilldown.secondaryValue === cell.session;
              const isFocused = idx === focusIdx;

              const bgFill = isEmpty
                ? 'var(--tw-track)'
                : isPos
                ? 'var(--tw-gain-bg)'
                : 'var(--tw-loss-bg)';
              const textColor = isEmpty
                ? 'var(--tw-ink-3)'
                : isPos
                ? 'var(--tw-gain)'
                : 'var(--tw-loss)';

              return (
                <g
                  key={cellKey}
                  className={isEmpty ? '' : 'tw-ana-svg-point'}
                  onClick={() => {
                    setFocusIdx(idx);
                    handleCellSelect(cell);
                  }}
                >
                  <rect
                    x={x}
                    y={y}
                    width={cw}
                    height={ch}
                    rx={10}
                    fill={bgFill}
                    stroke={
                      isSelected || isFocused
                        ? 'var(--tw-focus)'
                        : isEmpty
                        ? 'var(--tw-line)'
                        : textColor
                    }
                    strokeWidth={isSelected || isFocused ? 2.2 : 1}
                    className="tw-ana-chart-transition"
                  />
                  {isEmpty ? (
                    <text
                      x={x + cw / 2}
                      y={y + ch / 2 + 3}
                      textAnchor="middle"
                      fontSize="10"
                      fontFamily="'JetBrains Mono', monospace"
                      fill="var(--tw-ink-3)"
                    >
                      no trades
                    </text>
                  ) : (
                    <>
                      <text
                        x={x + cw / 2}
                        y={y + ch / 2 - 2}
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="700"
                        fontFamily="'JetBrains Mono', monospace"
                        fill={textColor}
                      >
                        {formatRSigned(cell.expectancyR ?? 0)}
                      </text>
                      <text
                        x={x + cw / 2}
                        y={y + ch / 2 + 12}
                        textAnchor="middle"
                        fontSize="10"
                        fontFamily="'JetBrains Mono', monospace"
                        fill="var(--tw-ink-2)"
                      >
                        n={cell.n}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      ) : (
        <div className="tw-ana-table-wrap">
          <table className="tw-ana-table">
            <thead>
              <tr>
                <th>Weekday × Session</th>
                <th>n</th>
                <th>Expectancy (R)</th>
                <th>Net P&amp;L ($)</th>
              </tr>
            </thead>
            <tbody>
              {orderedCells.map((c) => (
                <tr key={`${c.weekday}::${c.session}`}>
                  <td>
                    {c.weekday} × {c.session}
                  </td>
                  <td>{c.n}</td>
                  <td>
                    {c.n === 0 || c.expectancyR === null
                      ? 'no trades'
                      : formatRSigned(c.expectancyR)}
                  </td>
                  <td>
                    {c.n === 0 ? (
                      'no trades'
                    ) : (
                      <CurrencyText amount={c.netPnl} isPnlHidden={isPnlHidden} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ============================================================================
// MODULE 5: Strategy Attribution Table
// ============================================================================
export function StrategyAttributionModule({
  rows,
  totalN,
  isPnlHidden,
  activeDrilldown,
  onSelectDrilldown,
}: {
  rows: StrategyAttributionRow[];
  totalN: number;
  isPnlHidden: boolean;
  activeDrilldown?: DrilldownSelection | null;
  onSelectDrilldown: (d?: DrilldownSelection) => void;
}) {
  return (
    <section className="tw-bento-tile tw-ana-span12" aria-label="5. Strategy Attribution">
      <div className="tw-ana-mod-head">
        <div className="tw-ana-mod-titles">
          <div className="tw-ana-mod-toprow">
            <h2 className="tw-h">5. Strategy Attribution</h2>
            <span className="tw-ana-unit-tag">Net USD / R / Share %</span>
            <SampleStatusPill n={totalN} />
          </div>
          <p className="tw-ana-mod-sub">
            Click a strategy row to filter closed trades below, or open its Playbook entry.
          </p>
        </div>
        <div className="tw-ana-mod-actions">
          <button
            type="button"
            className="tw-ana-icon-btn"
            onClick={() =>
              downloadCsvFile(
                'edgeledger-strategy-attribution.csv',
                ['Strategy', 'n', 'Win Rate', 'Profit Factor', 'Expectancy USD', 'Expectancy R', 'Net USD', 'Share of Net %'],
                rows.map((r) => [
                  r.strategyName,
                  r.n,
                  r.n < 5 ? 'Insufficient sample' : `${r.winRate.toFixed(1)}%`,
                  r.profitFactorDisplay,
                  r.expectancyUsd.toFixed(2),
                  r.expectancyR.toFixed(2),
                  r.netPnl.toFixed(2),
                  r.shareOfNetPct.toFixed(1),
                ])
              )
            }
          >
            <span>CSV</span>
          </button>
        </div>
      </div>

      <div className="tw-ana-table-wrap">
        <table className="tw-ana-table">
          <thead>
            <tr>
              <th>Strategy</th>
              <th>n</th>
              <th>Win Rate</th>
              <th>Profit Factor</th>
              <th>Expectancy ($)</th>
              <th>Expectancy (R)</th>
              <th>Net P&amp;L</th>
              <th>Share of Net</th>
              <th>Playbook</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isSelected =
                activeDrilldown?.type === 'strategy' && activeDrilldown.value === row.strategyId;
              const winLabel = row.n < 5 ? 'Insufficient sample' : `${row.winRate.toFixed(1)}%`;
              return (
                <tr
                  key={row.strategyId}
                  className={isSelected ? 'tw-ana-row-selected' : ''}
                  onClick={() =>
                    row.n > 0 &&
                    onSelectDrilldown(
                      isSelected
                        ? undefined
                        : { type: 'strategy', value: row.strategyId, label: `Strategy: ${row.strategyName}` }
                    )
                  }
                  style={{ cursor: row.n > 0 ? 'pointer' : 'default' }}
                >
                  <td>{row.strategyName}</td>
                  <td>{row.n}</td>
                  <td>{winLabel}</td>
                  <td>{row.profitFactorDisplay}</td>
                  <td>
                    <CurrencyText amount={row.expectancyUsd} isPnlHidden={isPnlHidden} />
                  </td>
                  <td>{row.n > 0 ? formatRSigned(row.expectancyR) : '—'}</td>
                  <td className={row.netPnl >= 0 ? 'tw-pos' : 'tw-neg'}>
                    <CurrencyText amount={row.netPnl} isPnlHidden={isPnlHidden} />
                  </td>
                  <td>{formatPercentSigned(row.shareOfNetPct, true, 1)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <Link href={row.playbookHref} className="tw-ana-play-link">
                      <span>Open Playbook</span>
                      <ArrowUpRight size={13} aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ============================================================================
// MODULE 6: Streaks & Clustering
// ============================================================================
export function StreaksClusterModule({
  stats,
  n,
}: {
  stats: StreakClusterStats;
  n: number;
}) {
  const [viewMode, setViewMode] = useState<'chart' | 'table'>('chart');
  const [focusIdx, setFocusIdx] = useState<number>(0);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const dist = stats.tradesPerDayDistribution;
  const maxDayCount = Math.max(1, ...dist.map((d) => d.daysCount));
  const width = 560;
  const height = 210;
  const padL = 44;
  const padR = 20;
  const padT = 26;
  const padB = 34;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const activeBucket = dist[focusIdx] ?? null;
  const totalTradingDays = dist.reduce((acc, d) => acc + d.daysCount, 0);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (dist.length === 0) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setFocusIdx((i) => Math.min(dist.length - 1, i + 1));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setFocusIdx((i) => Math.max(0, i - 1));
    }
  };

  return (
    <section className="tw-bento-tile tw-ana-span6" aria-label="6. Streaks and Trades Per Day">
      <ChartHeaderBar
        title="6. Streaks & Trades-Per-Day"
        subtitle="Sequential streaks and daily clustering density"
        unitLabel="Trades / Day"
        n={n}
        viewMode={viewMode}
        onToggleViewMode={setViewMode}
        onExportPng={() => downloadSvgElementAsPng(svgRef.current, 'edgeledger-streaks-clustering.png')}
        onExportCsv={() =>
          downloadCsvFile(
            'edgeledger-trades-per-day.csv',
            ['Trades Per Day', 'Trading Days Count', 'Avg Daily Net USD'],
            dist.map((d) => [d.tradesCountLabel, d.daysCount, d.avgDailyNetPnl.toFixed(2)])
          )
        }
      />

      <div className="tw-ana-stat-strip">
        <div>
          <small>Current Streak</small>
          <strong className={stats.currentStreakType === 'WIN' ? 'tw-pos' : stats.currentStreakType === 'LOSS' ? 'tw-neg' : ''}>
            {stats.currentStreakCount > 0 ? stats.currentStreakLabel : 'None'}
          </strong>
        </div>
        <div>
          <small>Longest Win Streak</small>
          <strong className="tw-pos">{stats.longestWinStreak}</strong>
        </div>
        <div>
          <small>Longest Loss Streak</small>
          <strong className="tw-neg">{stats.longestLossStreak}</strong>
        </div>
        <div>
          <small>Active Days</small>
          <strong>{totalTradingDays}</strong>
        </div>
      </div>

      {activeBucket && (
        <div className="tw-ana-tooltip-bar" role="status">
          <span>
            <strong>{activeBucket.tradesCountLabel}</strong>
          </span>
          <span>Observed on {activeBucket.daysCount} trading day(s)</span>
        </div>
      )}

      {viewMode === 'chart' ? (
        <div
          className="tw-ana-svg-wrap"
          tabIndex={0}
          role="region"
          aria-label="Trades per day distribution chart"
          onKeyDown={handleKeyDown}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            className="tw-ana-svg"
            role="img"
            aria-labelledby="cluster-svg-title"
          >
            <title id="cluster-svg-title">Trades Per Day Clustering Distribution</title>
            {[0, maxDayCount].map((tick, idx) => {
              const y = padT + plotH - (tick / maxDayCount) * plotH;
              return (
                <g key={idx}>
                  <line x1={padL} x2={width - padR} y1={y} y2={y} stroke="var(--tw-line)" strokeDasharray="3 4" />
                  <text
                    x={padL - 8}
                    y={y + 4}
                    textAnchor="end"
                    fontSize="11"
                    fontFamily="'JetBrains Mono', monospace"
                    fill="var(--tw-ink-3)"
                  >
                    {tick}
                  </text>
                </g>
              );
            })}
            <text
              x={10}
              y={padT + 8}
              fontSize="10"
              fontFamily="'JetBrains Mono', monospace"
              fill="var(--tw-ink-3)"
            >
              DAYS
            </text>

            {dist.length === 0 ? (
              <text
                x={width / 2}
                y={height / 2}
                textAnchor="middle"
                fontSize="12"
                fill="var(--tw-ink-3)"
              >
                No trading days in view
              </text>
            ) : (
              dist.map((d, idx) => {
                const slotW = plotW / dist.length;
                const barW = Math.min(72, Math.max(24, slotW - 18));
                const x = padL + idx * slotW + (slotW - barW) / 2;
                const bh = (d.daysCount / maxDayCount) * plotH;
                const y = padT + plotH - bh;
                return (
                  <g
                    key={d.tradesCount}
                    className="tw-ana-svg-point"
                    onClick={() => setFocusIdx(idx)}
                  >
                    <rect
                      x={x}
                      y={y}
                      width={barW}
                      height={Math.max(4, bh)}
                      rx={8}
                      fill="var(--tw-s1)"
                      stroke={idx === focusIdx ? 'var(--tw-focus)' : 'none'}
                      strokeWidth="2"
                      className="tw-ana-chart-transition"
                    />
                    <text
                      x={x + barW / 2}
                      y={Math.max(padT + 12, y - 6)}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="700"
                      fontFamily="'JetBrains Mono', monospace"
                      fill="var(--tw-ink)"
                    >
                      {d.daysCount}d
                    </text>
                    <text
                      x={x + barW / 2}
                      y={height - 10}
                      textAnchor="middle"
                      fontSize="11"
                      fontFamily="'JetBrains Mono', monospace"
                      fill="var(--tw-ink-2)"
                    >
                      {d.tradesCountLabel}
                    </text>
                  </g>
                );
              })
            )}
          </svg>
        </div>
      ) : (
        <div className="tw-ana-table-wrap">
          <table className="tw-ana-table">
            <thead>
              <tr>
                <th>Trades Per Day</th>
                <th>Trading Days</th>
              </tr>
            </thead>
            <tbody>
              {dist.map((d) => (
                <tr key={d.tradesCount}>
                  <td>{d.tradesCountLabel}</td>
                  <td>{d.daysCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ============================================================================
// MODULE 7: Direction & Symbol Breakdown (Same Metrics)
// ============================================================================
export function DirectionSymbolBreakdownModule({
  directionRows,
  symbolRows,
  n,
  isPnlHidden,
  activeDrilldown,
  onSelectDrilldown,
}: {
  directionRows: BreakdownRow[];
  symbolRows: BreakdownRow[];
  n: number;
  isPnlHidden: boolean;
  activeDrilldown?: DrilldownSelection | null;
  onSelectDrilldown: (d?: DrilldownSelection) => void;
}) {
  const [tab, setTab] = useState<'symbol' | 'direction'>('symbol');
  const activeRows = tab === 'symbol' ? symbolRows : directionRows;

  return (
    <section className="tw-bento-tile tw-ana-span6" aria-label="7. Long vs Short and Symbol Breakdown">
      <div className="tw-ana-mod-head">
        <div className="tw-ana-mod-titles">
          <div className="tw-ana-mod-toprow">
            <h2 className="tw-h">7. Long vs Short &amp; Symbol Breakdown</h2>
            <SampleStatusPill n={n} />
          </div>
          <p className="tw-ana-mod-sub">
            Unified metrics across direction and ticker · Click a row to filter trades below
          </p>
        </div>
        <div className="tw-ana-mod-actions">
          <div className="tw-seg tw-ana-mini-seg" role="group" aria-label="Breakdown dimension">
            <button
              type="button"
              className={tab === 'symbol' ? 'on' : ''}
              aria-pressed={tab === 'symbol'}
              onClick={() => setTab('symbol')}
            >
              By Symbol
            </button>
            <button
              type="button"
              className={tab === 'direction' ? 'on' : ''}
              aria-pressed={tab === 'direction'}
              onClick={() => setTab('direction')}
            >
              Long / Short
            </button>
          </div>
          <button
            type="button"
            className="tw-ana-icon-btn"
            onClick={() =>
              downloadCsvFile(
                `edgeledger-${tab}-breakdown.csv`,
                ['Segment', 'n', 'Win Rate', 'Profit Factor', 'Expectancy USD', 'Expectancy R', 'Net USD', 'Share %'],
                activeRows.map((r) => [
                  r.label,
                  r.n,
                  r.n < 5 ? 'Insufficient sample' : `${r.winRate.toFixed(1)}%`,
                  r.profitFactorDisplay,
                  r.expectancyUsd.toFixed(2),
                  r.expectancyR.toFixed(2),
                  r.netPnl.toFixed(2),
                  r.shareOfNetPct.toFixed(1),
                ])
              )
            }
          >
            <span>CSV</span>
          </button>
        </div>
      </div>

      <div className="tw-ana-table-wrap">
        <table className="tw-ana-table">
          <thead>
            <tr>
              <th>{tab === 'symbol' ? 'Symbol' : 'Direction'}</th>
              <th>n</th>
              <th>Win Rate</th>
              <th>Profit Factor</th>
              <th>Expectancy ($)</th>
              <th>Expectancy (R)</th>
              <th>Net P&amp;L</th>
              <th>Share</th>
            </tr>
          </thead>
          <tbody>
            {activeRows.map((row) => {
              const type = tab === 'symbol' ? 'symbol' : 'direction';
              const isSelected =
                activeDrilldown?.type === type && activeDrilldown.value === row.key;
              const winLabel = row.n < 5 ? 'Insufficient sample' : `${row.winRate.toFixed(1)}%`;
              return (
                <tr
                  key={row.key}
                  className={isSelected ? 'tw-ana-row-selected' : ''}
                  style={{ cursor: row.n > 0 ? 'pointer' : 'default' }}
                  onClick={() =>
                    row.n > 0 &&
                    onSelectDrilldown(
                      isSelected
                        ? undefined
                        : { type, value: row.key, label: `${tab === 'symbol' ? 'Symbol' : 'Direction'}: ${row.label}` }
                    )
                  }
                >
                  <td>{row.label}</td>
                  <td>{row.n}</td>
                  <td>{winLabel}</td>
                  <td>{row.profitFactorDisplay}</td>
                  <td>
                    <CurrencyText amount={row.expectancyUsd} isPnlHidden={isPnlHidden} />
                  </td>
                  <td>{row.n > 0 ? formatRSigned(row.expectancyR) : '—'}</td>
                  <td className={row.netPnl >= 0 ? 'tw-pos' : 'tw-neg'}>
                    <CurrencyText amount={row.netPnl} isPnlHidden={isPnlHidden} />
                  </td>
                  <td>{formatPercentSigned(row.shareOfNetPct, true, 1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

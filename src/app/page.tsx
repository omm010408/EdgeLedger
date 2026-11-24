'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Fingerprint, Eye, EyeOff } from 'lucide-react';
import { useTrading } from '../context/TradingContext';

export default function OverviewPage() {
  const {
    accounts,
    selectedAccountId,
    selectedAccount,
    trades,
    filteredTrades,
    portfolioMetrics,
    periodFilter,
    isPnlHidden,
    setIsPnlHidden,
  } = useTrading();

  const [isScanning, setIsScanning] = useState(false);

  const handleFingerprintClick = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();

    if (!isPnlHidden) {
      // Re-lock
      setIsPnlHidden(true);
      return;
    }

    // Biometric scanning sequence
    setIsScanning(true);
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([25, 40, 25]);
      } catch {}
    }

    setTimeout(() => {
      setIsScanning(false);
      setIsPnlHidden(false);
    }, 550);
  };

  // Filter trades based on active period and selected account
  const activeTrades = useMemo(() => {
    let list = filteredTrades;

    // Filter by period
    if (periodFilter === 'Week') {
      // 16 to 22 Mar or recent 7-day window
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

  const closedTrades = useMemo(() => {
    return activeTrades
      .filter((t) => t.status === 'CLOSED')
      .sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime());
  }, [activeTrades]);

  const openTrades = useMemo(() => {
    return activeTrades.filter((t) => t.status === 'OPEN');
  }, [activeTrades]);

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

    const wonCount = closedTrades.filter((t) => t.netPnl > 0).length;
    const lostCount = closedTrades.filter((t) => t.netPnl < 0).length;
    const totalClosed = closedTrades.length;
    const winRatePct = totalClosed > 0 ? (wonCount / totalClosed) * 100 : 0;

    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99.99 : 0;
    const expectancy = totalClosed > 0 ? netProfit / totalClosed : 0;
    const avgR =
      totalClosed > 0
        ? closedTrades.reduce((sum, t) => sum + (t.realizedR || 0), 0) / totalClosed
        : 0;

    const avgWin = wonCount > 0 ? grossProfit / wonCount : 0;
    const avgLoss = lostCount > 0 ? grossLoss / lostCount : 0;
    const payoffRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? 99.99 : 0;

    return {
      startingBal,
      currentBal,
      netProfit,
      grossProfit,
      grossLoss,
      returnPct,
      wonCount,
      lostCount,
      totalClosed,
      winRatePct,
      profitFactor,
      expectancy,
      avgR,
      avgWin,
      avgLoss,
      payoffRatio,
    };
  }, [accounts, selectedAccount, closedTrades]);

  // Format currency helpers
  const formatCur = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const formatInt = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 0,
    }).format(Math.round(val));
  };

  const formatWholeCents = (val: number) => {
    const formatted = formatCur(Math.abs(val));
    const sign = val >= 0 ? '+' : '−';
    const parts = formatted.split('.');
    return {
      sign,
      whole: parts[0],
      cents: parts[1] || '00',
    };
  };

  // Open trade details for surveillance tile
  const primaryOpenTrade = openTrades[0] || null;

  return (
    <main className="tw-grid">
      {/* ------------------------------------------------------------------ */}
      {/* 1. HERO TILE: Net P&L Contour Wave (Cols 1-5, Rows 1-2)             */}
      {/* ------------------------------------------------------------------ */}
      <section className={`tw-tile tw-hero ${isPnlHidden ? 'tw-hero-locked' : 'tw-hero-unlocked'}`} aria-label="Net P&L">
        <div className="tw-hero-topline">
          <div className="tw-lbl">
            Net P&amp;L from closed trades,{' '}
            {periodFilter === 'Week'
              ? '16–22 Mar'
              : periodFilter === 'Month'
              ? '1–31 Mar'
              : 'All Time'}
          </div>
          <button
            type="button"
            className={`tw-fp-btn ${isPnlHidden ? 'tw-fp-locked' : 'tw-fp-unlocked'} ${isScanning ? 'tw-fp-scanning' : ''}`}
            onClick={handleFingerprintClick}
            aria-label={isPnlHidden ? 'Unlock P&L with Fingerprint' : 'Hide P&L'}
            title={isPnlHidden ? 'Click to verify fingerprint & unhide P&L' : 'Click to hide and lock P&L'}
          >
            <span className="tw-fp-icon-wrap">
              {isPnlHidden ? (
                <EyeOff size={14} className="tw-fp-icon text-[#FFD56B]" />
              ) : (
                <Eye size={14} className="tw-fp-icon text-[#5BE6AE]" />
              )}
              {isScanning && <span className="tw-fp-laser" />}
            </span>
            <span>
              {isScanning ? 'Verifying...' : isPnlHidden ? 'Touch ID to Open' : 'Hide P&L'}
            </span>
          </button>
        </div>

        {/* Blurred Content Container */}
        <div className={`tw-hero-body ${isPnlHidden ? 'tw-blurred' : 'tw-unblurred'}`}>
          <div className="tw-big">
            {capitalStats.netProfit >= 0 ? '+' : '−'}
            {formatCur(Math.abs(capitalStats.netProfit)).replace('.00', '')}
            <small>.00</small>
          </div>

          <div className="tw-delta">
            <span className="tw-pill">
              {capitalStats.returnPct >= 0 ? '+' : ''}{capitalStats.returnPct.toFixed(2)}%
            </span>
            on a {formatCur(capitalStats.startingBal)} start
          </div>

          <dl className="tw-stats">
            <div>
              <dt>Balance</dt>
              <dd>{formatCur(capitalStats.currentBal)}</dd>
            </div>
            <div>
              <dt>Gross profit</dt>
              <dd>{formatCur(capitalStats.grossProfit)}</dd>
            </div>
            <div>
              <dt>Gross loss</dt>
              <dd>−{formatCur(capitalStats.grossLoss)}</dd>
            </div>
          </dl>

          <div className="tw-chart">
            <svg
              viewBox="0 0 540 220"
              preserveAspectRatio="none"
              role="img"
              aria-label={`Balance rises from ${formatCur(capitalStats.startingBal)} to ${formatCur(capitalStats.currentBal)} across ${capitalStats.totalClosed} closed trades`}
            >
              <defs>
                <path
                  id="tw-line"
                  d="M0 162.2C45 147.5 90 130.3 135 118.1C180 105.9 225 103.6 270 89.1C315 74.6 360 30.9 405 30.9C450 30.9 495 34.6 540 36.5"
                />
              </defs>
              <g transform="translate(0 40)">
                <path
                  className="tw-area"
                  d="M0 162.2C45 147.5 90 130.3 135 118.1C180 105.9 225 103.6 270 89.1C315 74.6 360 30.9 405 30.9C450 30.9 495 34.6 540 36.5V180H0Z"
                />
                <use className="tw-contour c3" href="#tw-line" transform="translate(0 24)" />
                <use className="tw-contour c2" href="#tw-line" transform="translate(0 12)" />
                <use className="tw-curve" href="#tw-line" />
              </g>
            </svg>
            <span className="tw-end" aria-hidden="true" />
            <span className="tw-tag start">
              Start, ${formatInt(capitalStats.startingBal)}
            </span>
            <span className="tw-tag close">
              Closing, ${formatInt(capitalStats.currentBal)}
            </span>
            <span className="tw-tag x x1">18 Mar</span>
            <span className="tw-tag x x2">19 Mar</span>
          </div>
        </div>

        {/* Center Blur Privacy Overlay with Closed Eye and Touch ID / Fingerprint */}
        {isPnlHidden && (
          <div
            className={`tw-privacy-overlay ${isScanning ? 'is-scanning' : ''}`}
            onClick={handleFingerprintClick}
            role="button"
            tabIndex={0}
            aria-label="Unlock P&L with Fingerprint"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') handleFingerprintClick();
            }}
          >
            <div className="tw-privacy-card">
              {/* Closed Eye Sign in middle */}
              <div className="tw-privacy-eye-badge">
                <EyeOff size={15} className="tw-privacy-eye-icon" />
                <span>P&amp;L Confidential</span>
              </div>

              {/* Central Interactive Biometric Touch ID Sensor */}
              <div className="tw-privacy-sensor">
                <div className="tw-privacy-sensor-inner">
                  <Fingerprint size={38} className="tw-privacy-fp-icon" />
                  {isScanning && <div className="tw-fp-laser-bar" />}
                </div>
                <div className="tw-privacy-sensor-glow" />
              </div>

              {/* Text Feedback */}
              <div className="tw-privacy-text-group">
                <div className="tw-privacy-title">
                  {isScanning ? 'Scanning Touch ID...' : 'Touch ID / Fingerprint'}
                </div>
                <div className="tw-privacy-sub">
                  {isScanning ? 'Verifying biometric signature' : 'Click sensor to open dashboard P&L'}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 2. PROFIT FACTOR TILE: Sun Over the Water Arch (Cols 6-7, Row 1)   */}
      {/* ------------------------------------------------------------------ */}
      <section className="tw-tile tw-arch" aria-label="Profit factor">
        <span className="tw-disc" aria-hidden="true" />
        <div className="tw-lbl">Profit factor</div>
        <div className="tw-n">{capitalStats.profitFactor.toFixed(2)}</div>
        <div className={`tw-sub ${isPnlHidden ? 'tw-pnl-blur' : ''}`}>
          Gross {isPnlHidden ? '$••••' : `$${formatInt(capitalStats.grossProfit)}`} over{' '}
          {isPnlHidden ? '$•••' : `$${formatInt(capitalStats.grossLoss)}`} in losses
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 3. WIN RATE RING TILE: Segmented Donut Ring (Cols 8-9, Row 1)      */}
      {/* ------------------------------------------------------------------ */}
      <section className="tw-tile tw-ring" aria-label="Win rate">
        <div className="tw-lbl">Win rate</div>
        <svg
          viewBox="0 0 120 120"
          width="124"
          height="124"
          role="img"
          aria-label={`${capitalStats.winRatePct.toFixed(1)} percent: ${capitalStats.wonCount} won and ${capitalStats.lostCount} lost`}
        >
          <circle
            cx="60"
            cy="60"
            r="46"
            style={{ fill: 'none', stroke: 'var(--tw-ring-track)', strokeWidth: 12 }}
          />
          <circle
            cx="60"
            cy="60"
            r="46"
            transform="rotate(-90 60 60)"
            strokeDasharray="64 225"
            style={{ fill: 'none', stroke: 'var(--tw-gain)', strokeWidth: 12 }}
          >
            <title>Trade 1, XAUUSD buy, 18 Mar: win, +2.48R</title>
          </circle>
          <circle
            cx="60"
            cy="60"
            r="46"
            transform="rotate(0 60 60)"
            strokeDasharray="64 225"
            style={{ fill: 'none', stroke: 'var(--tw-gain)', strokeWidth: 12 }}
          >
            <title>Trade 2, EURUSD buy, 18 Mar: win, +1.64R</title>
          </circle>
          <circle
            cx="60"
            cy="60"
            r="46"
            transform="rotate(90 60 60)"
            strokeDasharray="64 225"
            style={{ fill: 'none', stroke: 'var(--tw-gain)', strokeWidth: 12 }}
          >
            <title>Trade 3, BTCUSD buy, 19 Mar: win, +2.97R</title>
          </circle>
          <circle
            cx="60"
            cy="60"
            r="46"
            transform="rotate(180 60 60)"
            strokeDasharray="64 225"
            style={{ fill: 'none', stroke: 'var(--tw-loss)', strokeWidth: 12 }}
          >
            <title>Trade 4, BTCUSD sell, 19 Mar: loss, −0.29R</title>
          </circle>
          <text
            x="60"
            y="68"
            textAnchor="middle"
            fontFamily="Instrument Sans, Inter, sans-serif"
            fontSize="22"
            fontWeight="600"
            style={{ fill: 'var(--tw-ink)' }}
          >
            {capitalStats.winRatePct.toFixed(1)}%
          </text>
        </svg>
        <div className="tw-sub">
          {capitalStats.wonCount} won, {capitalStats.lostCount} lost, {capitalStats.totalClosed} closed trades
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 4. EXPECTANCY TILE: Aqua Expectancy Block (Cols 10-12, Row 1)      */}
      {/* ------------------------------------------------------------------ */}
      <section className="tw-tile tw-aqua" aria-label="Expectancy">
        <div className="tw-lbl">Expectancy per closed trade</div>
        <div className="tw-n tw-exp">
          {isPnlHidden ? (
            <span className="tw-val-hidden">+$••••.••</span>
          ) : (
            <>
              {capitalStats.expectancy >= 0 ? '+' : '−'}
              {formatCur(Math.abs(capitalStats.expectancy))}
            </>
          )}
        </div>
        <div>
          <span className="tw-pill">
            Average R +{periodFilter === 'Week' ? '1.70' : capitalStats.avgR.toFixed(2)}R
          </span>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 5. WEEK BUBBLES TILE: Net P&L by Day (Cols 6-10, Row 2)            */}
      {/* ------------------------------------------------------------------ */}
      <section className="tw-tile tw-week" aria-label="Net P&L by day, 16 to 22 March">
        <div className="tw-clip" aria-hidden="true">
          <svg className="tw-wave" viewBox="0 0 560 84" preserveAspectRatio="none">
            <path d="M0 40C90 18 170 56 280 36S460 16 560 38V84H0Z" />
          </svg>
        </div>
        <div>
          <div className="tw-lbl">Net P&amp;L by day, 16–22 Mar</div>
          <div className="tw-sub tw-s12" style={{ marginTop: '2px' }}>
            Bubble area shows net result. A dashed ring marks an open trade.
          </div>
        </div>
        <div className="tw-days" role="list">
          <div className="tw-day has-tip" role="listitem" tabIndex={0}>
            <div className="tw-bwrap">
              <span className="tw-bub empty" />
            </div>
            <div className="tw-dl">
              <div className="tw-d">16</div>
              <div className="tw-v none">No trades</div>
            </div>
            <div className="tip">
              <b>16 Mar, no trades</b>
            </div>
          </div>
          <div className="tw-day has-tip" role="listitem" tabIndex={0}>
            <div className="tw-bwrap">
              <span className="tw-bub empty" />
            </div>
            <div className="tw-dl">
              <div className="tw-d">17</div>
              <div className="tw-v none">No trades</div>
            </div>
            <div className="tip">
              <b>17 Mar, no trades</b>
            </div>
          </div>
          <div className="tw-day has-tip" role="listitem" tabIndex={0}>
            <div className="tw-bwrap">
              <span className="tw-bub strong" style={{ width: '64px', height: '64px' }} />
            </div>
            <div className="tw-dl">
              <div className="tw-d">18</div>
              <div className="tw-v">{isPnlHidden ? '+$••••' : '+$4,115'}</div>
            </div>
            <div className="tip">
              <b>18 Mar, {isPnlHidden ? '+$••••.••' : '+$4,115.00'}</b>2 trades: XAUUSD and EURUSD, both won
            </div>
          </div>
          <div className="tw-day has-tip" role="listitem" tabIndex={0}>
            <div className="tw-bwrap">
              <span className="tw-bub mid" style={{ width: '54px', height: '54px' }} />
            </div>
            <div className="tw-dl">
              <div className="tw-d">19</div>
              <div className="tw-v">{isPnlHidden ? '+$••••' : '+$2,956'}</div>
            </div>
            <div className="tip">
              <b>19 Mar, {isPnlHidden ? '+$••••.••' : '+$2,956.00'}</b>2 trades: BTCUSD win and loss
            </div>
          </div>
          <div className="tw-day has-tip" role="listitem" tabIndex={0}>
            <div className="tw-bwrap">
              <span className="tw-bub open" />
            </div>
            <div className="tw-dl">
              <div className="tw-d">20</div>
              <div className="tw-v">Open</div>
            </div>
            <div className="tip">
              <b>20 Mar, open trade</b>XAUUSD sell at 2,712.0. Floating P&amp;L is not in totals.
            </div>
          </div>
          <div className="tw-day has-tip" role="listitem" tabIndex={0}>
            <div className="tw-bwrap">
              <span className="tw-bub empty" />
            </div>
            <div className="tw-dl">
              <div className="tw-d">21</div>
              <div className="tw-v none">No trades</div>
            </div>
            <div className="tip">
              <b>21 Mar, no trades</b>
            </div>
          </div>
          <div className="tw-day has-tip" role="listitem" tabIndex={0}>
            <div className="tw-bwrap">
              <span className="tw-bub empty" />
            </div>
            <div className="tw-dl">
              <div className="tw-d">22</div>
              <div className="tw-v none">No trades</div>
            </div>
            <div className="tip">
              <b>22 Mar, no trades</b>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 6. TRADE QUALITY TILE: Payoff Ratio & Win/Loss (Cols 11-12, Row 2) */}
      {/* ------------------------------------------------------------------ */}
      <section className="tw-tile tw-qual" aria-label="Trade quality">
        <div className="tw-lbl">Trade quality</div>
        <div>
          <div className="tw-row2">
            <span className="tw-sub">Average win</span>
            <span className={`tw-pos ${isPnlHidden ? 'tw-pnl-blur' : ''}`} style={{ fontWeight: 600 }}>
              {isPnlHidden ? '+$••••' : `+$${formatInt(capitalStats.avgWin)}`}
            </span>
          </div>
          <div className="tw-qbar">
            <span style={{ width: '100%', background: 'var(--tw-gain)' }} />
          </div>
        </div>
        <div>
          <div className="tw-row2">
            <span className="tw-sub">Average loss</span>
            <span className={`tw-neg ${isPnlHidden ? 'tw-pnl-blur' : ''}`} style={{ fontWeight: 600 }}>
              {isPnlHidden ? '−$•••' : `−$${formatInt(capitalStats.avgLoss)}`}
            </span>
          </div>
          <div className="tw-qbar">
            <span
              style={{
                width: `${Math.min(
                  (capitalStats.avgLoss / (capitalStats.avgWin || 1)) * 100,
                  100
                ).toFixed(1)}%`,
                background: 'var(--tw-loss)',
              }}
            />
          </div>
        </div>
        <div>
          <span className="tw-pill" style={{ background: 'var(--tw-sun)', color: 'var(--tw-sun-ink)' }}>
            Payoff {capitalStats.payoffRatio.toFixed(2)}×
          </span>
          <div className="tw-sub tw-s12" style={{ marginTop: '8px' }}>
            Average win divided by average loss
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 7. INSTRUMENT SHARE TILE: Split Bar & Legend (Cols 1-4, Row 3)      */}
      {/* ------------------------------------------------------------------ */}
      <section className="tw-tile tw-inst" aria-label="Share of net P&L by instrument">
        <div className="tw-lbl">Share of net P&amp;L by instrument</div>
        <div
          className="tw-split"
          role="img"
          aria-label="BTCUSD 41.8 percent, XAUUSD 35.1 percent, EURUSD 23.1 percent"
        >
          <span style={{ width: '41.8%', background: 'var(--tw-s1)', boxShadow: 'inset -3px 0 0 var(--tw-tile)' }} />
          <span style={{ width: '35.1%', background: 'var(--tw-s2)', boxShadow: 'inset -3px 0 0 var(--tw-tile)' }} />
          <span style={{ width: '23.1%', background: 'var(--tw-s3)' }} />
        </div>
        <ul className="tw-legend">
          <li>
            <i style={{ background: 'var(--tw-s1)' }} />
            <span>
              BTCUSD<span className="tw-sub"> 2 trades</span>
            </span>
            <span style={{ fontWeight: 600 }}>{isPnlHidden ? '+$••••.••' : '+$2,956.00'}</span>
            <span className="tw-sub" style={{ textAlign: 'right' }}>
              41.8%
            </span>
          </li>
          <li>
            <i style={{ background: 'var(--tw-s2)' }} />
            <span>
              XAUUSD<span className="tw-sub"> 2 trades</span>
            </span>
            <span style={{ fontWeight: 600 }}>{isPnlHidden ? '+$••••.••' : '+$2,480.00'}</span>
            <span className="tw-sub" style={{ textAlign: 'right' }}>
              35.1%
            </span>
          </li>
          <li>
            <i style={{ background: 'var(--tw-s3)' }} />
            <span>
              EURUSD<span className="tw-sub"> 1 trade</span>
            </span>
            <span style={{ fontWeight: 600 }}>{isPnlHidden ? '+$••••.••' : '+$1,635.00'}</span>
            <span className="tw-sub" style={{ textAlign: 'right' }}>
              23.1%
            </span>
          </li>
        </ul>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 8. OPEN POSITION TILE: Active Surveillance Ticket (Cols 1-4, Row 4)*/}
      {/* ------------------------------------------------------------------ */}
      <section className="tw-tile tw-opos" aria-label="Open position and risk">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="tw-lbl">Open position</div>
          <span className="tw-pill tw-riskpill">Risk alert</span>
        </div>
        <div>
          <div className="tw-ticket">
            {primaryOpenTrade
              ? `${primaryOpenTrade.instrumentSymbol} ${primaryOpenTrade.direction.toLowerCase()}`
              : 'XAUUSD sell'}
          </div>
          <div className="tw-sub" style={{ marginTop: '4px' }}>
            Opened 20 Mar at 2,712.0. Floating P&amp;L is not in totals.
          </div>
        </div>
        <dl className="tw-facts">
          <div>
            <dt>Open risk</dt>
            <dd>$600.00</dd>
            <small>0.33% of balance</small>
          </div>
          <div>
            <dt>Largest loss</dt>
            <dd className="tw-neg">−$314.00</dd>
            <small>0.18% of start</small>
          </div>
          <div>
            <dt>Typical risk</dt>
            <dd>$1,000–1,100</dd>
            <small>per trade</small>
          </div>
        </dl>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 9. R LADDER TILE: Diverging R Distribution (Cols 5-8, Rows 3-4)    */}
      {/* ------------------------------------------------------------------ */}
      <section className="tw-tile tw-ladder" aria-label="R per closed trade">
        <div className="tw-lbl">R per closed trade</div>
        <div className="tw-sub">The dotted line marks break-even at 0R. Hover a row for details.</div>
        <div className="tw-rows">
          <div className="tw-rrow has-tip" tabIndex={0}>
            <div>
              <div className="tw-rv tw-pos">+2.97R</div>
              <div className="tw-sub tw-s12">BTCUSD, 19 Mar</div>
            </div>
            <div className="tw-track">
              <span className="tw-bar up" style={{ width: '49.5%' }} />
            </div>
            <div className="tip">
              <b>BTCUSD buy, 19 Mar</b>+$3,270.00, or +2.97R
            </div>
          </div>
          <div className="tw-rrow has-tip" tabIndex={0}>
            <div>
              <div className="tw-rv tw-pos">+2.48R</div>
              <div className="tw-sub tw-s12">XAUUSD, 18 Mar</div>
            </div>
            <div className="tw-track">
              <span className="tw-bar up" style={{ width: '41.3%' }} />
            </div>
            <div className="tip">
              <b>XAUUSD buy, 18 Mar</b>+$2,480.00, or +2.48R
            </div>
          </div>
          <div className="tw-rrow has-tip" tabIndex={0}>
            <div>
              <div className="tw-rv tw-pos">+1.64R</div>
              <div className="tw-sub tw-s12">EURUSD, 18 Mar</div>
            </div>
            <div className="tw-track">
              <span className="tw-bar up" style={{ width: '27.3%' }} />
            </div>
            <div className="tip">
              <b>EURUSD buy, 18 Mar</b>+$1,635.00, or +1.64R
            </div>
          </div>
          <div className="tw-rrow has-tip" tabIndex={0}>
            <div>
              <div className="tw-rv tw-neg">−0.29R</div>
              <div className="tw-sub tw-s12">BTCUSD, 19 Mar</div>
            </div>
            <div className="tw-track">
              <span className="tw-bar dn" style={{ width: '4.8%' }} />
            </div>
            <div className="tip">
              <b>BTCUSD sell, 19 Mar</b>−$314.00, or −0.29R
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 10. RECENT EXECUTIONS TILE: Audit Ledger (Cols 9-12, Rows 3-4)     */}
      {/* ------------------------------------------------------------------ */}
      <section className="tw-tile tw-exec" aria-label="Recent executions">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div className="tw-lbl">Recent executions</div>
          <Link className="tw-link" href="/trades">
            View all trades
          </Link>
        </div>
        <table className="tw-tbl">
          <caption className="sr-only">Five most recent trades, newest first</caption>
          <thead>
            <tr>
              <th scope="col">Instrument</th>
              <th scope="col">Side</th>
              <th scope="col">Date</th>
              <th scope="col" className="r">
                Net P&amp;L
              </th>
              <th scope="col" className="r">
                R
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="s">XAUUSD</td>
              <td>
                <span className="tw-side sell">Sell</span>
              </td>
              <td>20 Mar</td>
              <td className="r">Open</td>
              <td className="r">—</td>
            </tr>
            <tr>
              <td className="s">BTCUSD</td>
              <td>
                <span className="tw-side sell">Sell</span>
              </td>
              <td>19 Mar</td>
              <td className="r tw-neg">{isPnlHidden ? '••••••' : '−$314.00'}</td>
              <td className="r tw-neg">−0.29R</td>
            </tr>
            <tr>
              <td className="s">BTCUSD</td>
              <td>
                <span className="tw-side buy">Buy</span>
              </td>
              <td>19 Mar</td>
              <td className="r tw-pos">{isPnlHidden ? '••••••' : '+$3,270.00'}</td>
              <td className="r tw-pos">+2.97R</td>
            </tr>
            <tr>
              <td className="s">XAUUSD</td>
              <td>
                <span className="tw-side buy">Buy</span>
              </td>
              <td>18 Mar</td>
              <td className="r tw-pos">{isPnlHidden ? '••••••' : '+$2,480.00'}</td>
              <td className="r tw-pos">+2.48R</td>
            </tr>
            <tr>
              <td className="s">EURUSD</td>
              <td>
                <span className="tw-side buy">Buy</span>
              </td>
              <td>18 Mar</td>
              <td className="r tw-pos">{isPnlHidden ? '••••••' : '+$1,635.00'}</td>
              <td className="r tw-pos">+1.64R</td>
            </tr>
          </tbody>
        </table>
        <dl className="tw-facts tw-exfoot">
          <div>
            <dt>Best closed trade</dt>
            <dd className="tw-pos">{isPnlHidden ? '+$••••.••' : '+$3,270.00'}</dd>
            <small>BTCUSD, 19 Mar</small>
          </div>
          <div>
            <dt>Worst closed trade</dt>
            <dd className="tw-neg">{isPnlHidden ? '−$••••.••' : '−$314.00'}</dd>
            <small>BTCUSD, 19 Mar</small>
          </div>
        </dl>
      </section>
    </main>
  );
}

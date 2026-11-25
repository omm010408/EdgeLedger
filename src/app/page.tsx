'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  filterTradesByPeriod,
  getPeriodDateRangeLabel,
  getRollingSevenDays,
} from '../lib/data/periodFilter';
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
    return filterTradesByPeriod(filteredTrades, periodFilter);
  }, [filteredTrades, periodFilter]);

  const closedTrades = useMemo(() => {
    return activeTrades
      .filter((t) => t.status === 'CLOSED')
      .sort((a, b) => new Date(a.entryTime).getTime() - new Date(b.entryTime).getTime());
  }, [activeTrades]);

  const openTrades = useMemo(() => {
    return activeTrades.filter((t) => t.status === 'OPEN');
  }, [activeTrades]);

  const getScopedTradePnl = (t: (typeof activeTrades)[number]) => {
    if (selectedAccountId === 'ALL') return t.netPnl;
    return t.allocations.find((a) => a.accountId === selectedAccountId)?.netPnl ?? t.netPnl;
  };

  // Dynamic Portfolio Capital Stats
  const capitalStats = useMemo(() => {
    const startingBal = selectedAccount
      ? selectedAccount.startingBalance
      : accounts.reduce((sum, a) => sum + a.startingBalance, 0);

    const netProfit = closedTrades.reduce((sum, t) => sum + getScopedTradePnl(t), 0);
    const grossProfit = closedTrades.filter((t) => getScopedTradePnl(t) > 0).reduce((sum, t) => sum + getScopedTradePnl(t), 0);
    const grossLoss = Math.abs(closedTrades.filter((t) => getScopedTradePnl(t) < 0).reduce((sum, t) => sum + getScopedTradePnl(t), 0));
    const currentBal = startingBal + netProfit;
    const returnPct = startingBal > 0 ? (netProfit / startingBal) * 100 : 0;

    const wonCount = closedTrades.filter((t) => getScopedTradePnl(t) > 0).length;
    const lostCount = closedTrades.filter((t) => getScopedTradePnl(t) < 0).length;
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

  // Live derived metrics for Overview tiles (One Data Model)
  const instrumentBreakdown = useMemo(() => {
    const map = new Map<string, { symbol: string; count: number; netPnl: number }>();
    closedTrades.forEach((t) => {
      const existing = map.get(t.instrumentSymbol) || {
        symbol: t.instrumentSymbol,
        count: 0,
        netPnl: 0,
      };
      existing.count += 1;
      existing.netPnl += t.netPnl;
      map.set(t.instrumentSymbol, existing);
    });
    const list = Array.from(map.values()).sort((a, b) => Math.abs(b.netPnl) - Math.abs(a.netPnl));
    const totalAbs = list.reduce((sum, item) => sum + Math.abs(item.netPnl), 0) || 1;
    const colors = ['var(--tw-s1)', 'var(--tw-s2)', 'var(--tw-s3)', 'var(--tw-gain)'];
    return list.map((item, idx) => ({
      ...item,
      sharePct: (Math.abs(item.netPnl) / totalAbs) * 100,
      color: item.netPnl < 0 ? 'var(--tw-loss)' : colors[idx % colors.length],
    }));
  }, [closedTrades]);

  const weekDays = useMemo(() => {
    const baseDates = getRollingSevenDays(activeTrades);
    return baseDates.map(({ day, monthShort, dateKey }) => {
      const dayTrades = activeTrades.filter((t) => (t.entryTime || t.createdAt).startsWith(dateKey));
      const dayClosed = dayTrades.filter((t) => t.status === 'CLOSED');
      const dayOpen = dayTrades.filter((t) => t.status === 'OPEN' || t.status === 'PARTIALLY_CLOSED');
      const netPnl = dayClosed.reduce((sum, t) => sum + getScopedTradePnl(t), 0);
      return { day, monthShort, dateKey, dayTrades, dayClosed, dayOpen, netPnl };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTrades, selectedAccountId]);

  const periodRangeLabel = useMemo(
    () => getPeriodDateRangeLabel(activeTrades, periodFilter),
    [activeTrades, periodFilter]
  );

  const weekBubbleRangeLabel = useMemo(() => {
    if (weekDays.length === 0) return '7-day window';
    const first = weekDays[0];
    const last = weekDays[weekDays.length - 1];
    const year = last.dateKey.slice(0, 4);
    return first.monthShort === last.monthShort
      ? `${first.day}–${last.day} ${last.monthShort} ${year}`
      : `${first.day} ${first.monthShort}–${last.day} ${last.monthShort} ${year}`;
  }, [weekDays]);

  const rankedByR = useMemo(() => {
    return [...closedTrades].sort((a, b) => (b.realizedR || 0) - (a.realizedR || 0)).slice(0, 4);
  }, [closedTrades]);

  const maxAbsR = useMemo(() => {
    const vals = rankedByR.map((t) => Math.abs(t.realizedR || 0));
    return Math.max(3, ...vals);
  }, [rankedByR]);

  const recentExecutions = useMemo(() => {
    return [...activeTrades]
      .sort((a, b) => new Date(b.entryTime || b.createdAt).getTime() - new Date(a.entryTime || a.createdAt).getTime())
      .slice(0, 5);
  }, [activeTrades]);

  const bestClosedTrade = useMemo(() => {
    if (closedTrades.length === 0) return null;
    return [...closedTrades].sort((a, b) => b.netPnl - a.netPnl)[0];
  }, [closedTrades]);

  const worstClosedTrade = useMemo(() => {
    if (closedTrades.length === 0) return null;
    return [...closedTrades].sort((a, b) => a.netPnl - b.netPnl)[0];
  }, [closedTrades]);

  const openRiskStats = useMemo(() => {
    const startingBal = selectedAccount
      ? selectedAccount.startingBalance
      : accounts.reduce((sum, a) => sum + a.startingBalance, 0);
    const totalBal = startingBal + capitalStats.netProfit;
    const openRisk = openTrades.reduce((sum, t) => sum + (t.plannedRiskUsd || 0), 0);
    const closedRisks = closedTrades.map((t) => t.plannedRiskUsd || 0).filter((v) => v > 0);
    const minRisk = closedRisks.length > 0 ? Math.min(...closedRisks) : 0;
    const maxRisk = closedRisks.length > 0 ? Math.max(...closedRisks) : 0;
    return {
      openRisk,
      openRiskPct: totalBal > 0 ? (openRisk / totalBal) * 100 : 0,
      worstLossPnl: worstClosedTrade && worstClosedTrade.netPnl < 0 ? worstClosedTrade.netPnl : 0,
      worstLossPct:
        startingBal > 0 && worstClosedTrade && worstClosedTrade.netPnl < 0
          ? (Math.abs(worstClosedTrade.netPnl) / startingBal) * 100
          : 0,
      minRisk,
      maxRisk,
    };
  }, [accounts, selectedAccount, capitalStats.netProfit, openTrades, closedTrades, worstClosedTrade]);

  const winRateSegments = useMemo(() => {
    const circumference = 2 * Math.PI * 46; // ~289.03
    if (closedTrades.length === 0) return [];
    const gap = closedTrades.length > 1 ? 6 : 0;
    const slotAngle = 360 / closedTrades.length;
    const segLen = Math.max(8, circumference / closedTrades.length - gap);
    return closedTrades.map((t, i) => ({
      id: t.id,
      dash: `${segLen.toFixed(1)} ${(circumference - segLen).toFixed(1)}`,
      angle: -90 + i * slotAngle,
      color: t.netPnl >= 0 ? 'var(--tw-gain)' : 'var(--tw-loss)',
      title: `Trade ${i + 1}, ${t.instrumentSymbol} ${t.direction.toLowerCase()}, ${new Date(
        t.entryTime
      ).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}: ${
        t.netPnl >= 0 ? 'win' : 'loss'
      }, ${(t.realizedR || 0) >= 0 ? '+' : '−'}${Math.abs(t.realizedR || 0).toFixed(2)}R`,
    }));
  }, [closedTrades]);

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
            Net P&amp;L from closed trades, {periodRangeLabel}
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
            <span className="tw-tag start" suppressHydrationWarning>
              Start, ${formatInt(capitalStats.startingBal)}
            </span>
            <span className="tw-tag close" suppressHydrationWarning>
              Closing, ${formatInt(capitalStats.currentBal)}
            </span>
            <span className="tw-tag x x1">
              {closedTrades[0]
                ? new Date(closedTrades[0].entryTime || closedTrades[0].createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
                : weekDays[0]
                ? `${weekDays[0].day} ${weekDays[0].monthShort}`
                : 'Start'}
            </span>
            <span className="tw-tag x x2">
              {closedTrades.length > 0
                ? new Date(closedTrades[closedTrades.length - 1].entryTime || closedTrades[closedTrades.length - 1].createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
                : weekDays[weekDays.length - 1]
                ? `${weekDays[weekDays.length - 1].day} ${weekDays[weekDays.length - 1].monthShort}`
                : 'Now'}
            </span>
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
        <div className={`tw-sub ${isPnlHidden ? 'tw-pnl-blur' : ''}`} suppressHydrationWarning>
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
          {winRateSegments.map((seg) => (
            <circle
              key={seg.id}
              cx="60"
              cy="60"
              r="46"
              transform={`rotate(${seg.angle} 60 60)`}
              strokeDasharray={seg.dash}
              style={{ fill: 'none', stroke: seg.color, strokeWidth: 12 }}
            >
              <title>{seg.title}</title>
            </circle>
          ))}
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
            Average R {capitalStats.avgR >= 0 ? '+' : '−'}
            {Math.abs(capitalStats.avgR).toFixed(2)}R
          </span>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 5. WEEK BUBBLES TILE: Net P&L by Day (Cols 6-10, Row 2)            */}
      {/* ------------------------------------------------------------------ */}
      <section className="tw-tile tw-week" aria-label={`Net P&L by day, ${weekBubbleRangeLabel}`}>
        <div className="tw-clip" aria-hidden="true">
          <svg className="tw-wave" viewBox="0 0 560 84" preserveAspectRatio="none">
            <path d="M0 40C90 18 170 56 280 36S460 16 560 38V84H0Z" />
          </svg>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
          <div>
            <div className="tw-lbl">Net P&amp;L by day, {weekBubbleRangeLabel}</div>
            <div className="tw-sub tw-s12" style={{ marginTop: '2px' }}>
              Click a day to filter Trade ledger. Dashed ring marks an open trade.
            </div>
          </div>
          <Link className="tw-link" href="/calendar" style={{ whiteSpace: 'nowrap' }}>
            Calendar
          </Link>
        </div>
        <div className="tw-days" role="list">
          {weekDays.map((wd) => {
            const hasClosed = wd.dayClosed.length > 0;
            const hasOpen = wd.dayOpen.length > 0;
            const bubbleSize = hasClosed
              ? Math.max(36, Math.min(64, Math.round((Math.abs(wd.netPnl) / 4200) * 64)))
              : 0;
            const bubbleClass = hasClosed
              ? wd.netPnl >= 2500
                ? 'strong'
                : wd.netPnl >= 0
                ? 'mid'
                : 'loss'
              : hasOpen
              ? 'open'
              : 'empty';
            const syms = Array.from(new Set(wd.dayTrades.map((t) => t.instrumentSymbol))).join(' and ');

            return (
              <Link
                key={wd.dateKey}
                href={wd.dayTrades.length > 0 ? `/trades?date=${wd.dateKey}` : `/calendar?date=${wd.dateKey}`}
                className="tw-day has-tip"
                role="listitem"
              >
                <div className="tw-bwrap">
                  <span
                    className={`tw-bub ${bubbleClass}`}
                    style={hasClosed ? { width: `${bubbleSize}px`, height: `${bubbleSize}px` } : undefined}
                  />
                </div>
                <div className="tw-dl">
                  <div className="tw-d">{wd.day}</div>
                  <div className={`tw-v ${!hasClosed && !hasOpen ? 'none' : ''}`}>
                    {hasClosed
                      ? isPnlHidden
                        ? '+$••••'
                        : `${wd.netPnl >= 0 ? '+' : '−'}$${formatInt(Math.abs(wd.netPnl))}`
                      : hasOpen
                      ? 'Open'
                      : 'No trades'}
                  </div>
                </div>
                <div className="tip">
                  {hasClosed ? (
                    <>
                      <b>
                        {wd.day} {wd.monthShort},{' '}
                        {isPnlHidden
                          ? '••••••'
                          : `${wd.netPnl >= 0 ? '+' : '−'}${formatCur(Math.abs(wd.netPnl))}`}
                      </b>
                      {wd.dayClosed.length} trade{wd.dayClosed.length === 1 ? '' : 's'}: {syms}
                    </>
                  ) : hasOpen ? (
                    <>
                      <b>{wd.day} {wd.monthShort}, open trade</b>
                      {syms} floating position
                    </>
                  ) : (
                    <>
                      <b>{wd.day} {wd.monthShort}, no trades</b>Click to open calendar
                    </>
                  )}
                </div>
              </Link>
            );
          })}
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
            <span className={`tw-pos ${isPnlHidden ? 'tw-pnl-blur' : ''}`} style={{ fontWeight: 600 }} suppressHydrationWarning>
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
            <span className={`tw-neg ${isPnlHidden ? 'tw-pnl-blur' : ''}`} style={{ fontWeight: 600 }} suppressHydrationWarning>
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
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div className="tw-lbl">Share of net P&amp;L by instrument</div>
          <Link className="tw-link" href="/accounts">
            Desks
          </Link>
        </div>
        <div
          className="tw-split"
          role="img"
          aria-label="Share of net P&L across traded instruments"
        >
          {instrumentBreakdown.length > 0 ? (
            instrumentBreakdown.map((item, idx) => (
              <span
                key={item.symbol}
                style={{
                  width: `${item.sharePct.toFixed(1)}%`,
                  background: item.color,
                  boxShadow:
                    idx < instrumentBreakdown.length - 1
                      ? 'inset -3px 0 0 var(--tw-tile)'
                      : undefined,
                }}
              />
            ))
          ) : (
            <span style={{ width: '100%', background: 'var(--tw-track)' }} />
          )}
        </div>
        <ul className="tw-legend">
          {instrumentBreakdown.length > 0 ? (
            instrumentBreakdown.map((item) => (
              <li key={item.symbol}>
                <i style={{ background: item.color }} />
                <span>
                  {item.symbol}
                  <span className="tw-sub">
                    {' '}
                    {item.count} trade{item.count === 1 ? '' : 's'}
                  </span>
                </span>
                <span style={{ fontWeight: 600 }} className={item.netPnl < 0 ? 'tw-neg' : ''}>
                  {isPnlHidden
                    ? '••••••'
                    : `${item.netPnl >= 0 ? '+' : '−'}${formatCur(Math.abs(item.netPnl))}`}
                </span>
                <span className="tw-sub" style={{ textAlign: 'right' }}>
                  {item.sharePct.toFixed(1)}%
                </span>
              </li>
            ))
          ) : (
            <li className="tw-sub">No closed instruments in current period.</li>
          )}
        </ul>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* 8. OPEN POSITION TILE: Active Surveillance Ticket (Cols 1-4, Row 4)*/}
      {/* ------------------------------------------------------------------ */}
      <section className="tw-tile tw-opos" aria-label="Open position and risk">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="tw-lbl">Open position</div>
          <Link
            href={selectedAccountId !== 'ALL' ? `/risk?accountId=${selectedAccountId}` : '/risk'}
            className="tw-pill tw-riskpill"
          >
            Risk alert →
          </Link>
        </div>
        <div>
          <div className="tw-ticket">
            {primaryOpenTrade
              ? `${primaryOpenTrade.instrumentSymbol} ${primaryOpenTrade.direction.toLowerCase()}`
              : 'No active position'}
          </div>
          <div className="tw-sub" style={{ marginTop: '4px' }}>
            {primaryOpenTrade
              ? `Opened ${new Date(primaryOpenTrade.entryTime).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  timeZone: 'UTC',
                })} at ${primaryOpenTrade.entryPrice.toLocaleString('en-US')}. Floating P&L is excluded from totals.`
              : 'All tracked positions are currently flat.'}
          </div>
        </div>
        <dl className="tw-facts">
          <div>
            <dt>Open risk</dt>
            <dd>{formatCur(openRiskStats.openRisk)}</dd>
            <small>{openRiskStats.openRiskPct.toFixed(2)}% of balance</small>
          </div>
          <div>
            <dt>Largest loss</dt>
            <dd className="tw-neg">
              {openRiskStats.worstLossPnl < 0
                ? isPnlHidden
                  ? '−$••••'
                  : `−${formatCur(Math.abs(openRiskStats.worstLossPnl))}`
                : '$0.00'}
            </dd>
            <small>{openRiskStats.worstLossPct.toFixed(2)}% of start</small>
          </div>
          <div>
            <dt>Typical risk</dt>
            <dd>
              {openRiskStats.minRisk > 0
                ? `$${formatInt(openRiskStats.minRisk)}–${formatInt(openRiskStats.maxRisk)}`
                : '$0'}
            </dd>
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
          {rankedByR.length > 0 ? (
            rankedByR.map((trade) => {
              const rVal = trade.realizedR || 0;
              const isGain = rVal >= 0;
              const widthPct = Math.min(50, (Math.abs(rVal) / maxAbsR) * 50);
              const dateLabel = new Date(trade.entryTime).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                timeZone: 'UTC',
              });
              return (
                <Link
                  key={trade.id}
                  href={`/trades?tradeId=${trade.id}`}
                  className="tw-rrow has-tip"
                >
                  <div>
                    <div className={`tw-rv ${isGain ? 'tw-pos' : 'tw-neg'}`}>
                      {isGain ? '+' : '−'}
                      {Math.abs(rVal).toFixed(2)}R
                    </div>
                    <div className="tw-sub tw-s12">
                      {trade.instrumentSymbol}, {dateLabel}
                    </div>
                  </div>
                  <div className="tw-track">
                    <span
                      className={`tw-bar ${isGain ? 'up' : 'dn'}`}
                      style={{ width: `${widthPct.toFixed(1)}%` }}
                    />
                  </div>
                  <div className="tip">
                    <b>
                      {trade.instrumentSymbol} {trade.direction.toLowerCase()}, {dateLabel}
                    </b>
                    {isPnlHidden
                      ? '••••••'
                      : `${trade.netPnl >= 0 ? '+' : '−'}${formatCur(Math.abs(trade.netPnl))}`}
                    , or {isGain ? '+' : '−'}
                    {Math.abs(rVal).toFixed(2)}R
                  </div>
                </Link>
              );
            })
          ) : (
            <div className="tw-sub" style={{ padding: '16px 0' }}>
              No closed trades recorded for this filter.
            </div>
          )}
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
            {recentExecutions.length > 0 ? (
              recentExecutions.map((trade) => {
                const isClosed = trade.status === 'CLOSED';
                const dateLabel = new Date(trade.entryTime).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  timeZone: 'UTC',
                });
                const rVal = trade.realizedR || 0;
                return (
                  <tr key={trade.id}>
                    <td className="s">
                      <Link href={`/trades?tradeId=${trade.id}`} className="hover:underline">
                        {trade.instrumentSymbol}
                      </Link>
                    </td>
                    <td>
                      <span className={`tw-side ${trade.direction === 'BUY' ? 'buy' : 'sell'}`}>
                        {trade.direction === 'BUY' ? 'Buy' : 'Sell'}
                      </span>
                    </td>
                    <td>{dateLabel}</td>
                    <td
                      className={`r ${
                        !isClosed ? '' : trade.netPnl >= 0 ? 'tw-pos' : 'tw-neg'
                      }`}
                    >
                      {!isClosed
                        ? 'Open'
                        : isPnlHidden
                        ? '••••••'
                        : `${trade.netPnl >= 0 ? '+' : '−'}${formatCur(Math.abs(trade.netPnl))}`}
                    </td>
                    <td
                      className={`r ${
                        !isClosed ? '' : rVal >= 0 ? 'tw-pos' : 'tw-neg'
                      }`}
                    >
                      {!isClosed
                        ? '—'
                        : `${rVal >= 0 ? '+' : '−'}${Math.abs(rVal).toFixed(2)}R`}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="tw-sub" style={{ textAlign: 'center', padding: '16px 0' }}>
                  No executions found for current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <dl className="tw-facts tw-exfoot">
          <div>
            <dt>Best closed trade</dt>
            <dd className="tw-pos">
              {bestClosedTrade
                ? isPnlHidden
                  ? '+$••••.••'
                  : `+${formatCur(Math.abs(bestClosedTrade.netPnl))}`
                : '$0.00'}
            </dd>
            <small>
              {bestClosedTrade
                ? `${bestClosedTrade.instrumentSymbol}, ${new Date(
                    bestClosedTrade.entryTime
                  ).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    timeZone: 'UTC',
                  })}`
                : 'No closed sample'}
            </small>
          </div>
          <div>
            <dt>Worst closed trade</dt>
            <dd className={worstClosedTrade && worstClosedTrade.netPnl < 0 ? 'tw-neg' : 'tw-pos'}>
              {worstClosedTrade
                ? isPnlHidden
                  ? '••••••'
                  : `${worstClosedTrade.netPnl >= 0 ? '+' : '−'}${formatCur(
                      Math.abs(worstClosedTrade.netPnl)
                    )}`
                : '$0.00'}
            </dd>
            <small>
              {worstClosedTrade
                ? `${worstClosedTrade.instrumentSymbol}, ${new Date(
                    worstClosedTrade.entryTime
                  ).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    timeZone: 'UTC',
                  })}`
                : 'No closed sample'}
            </small>
          </div>
        </dl>
      </section>
    </main>
  );
}

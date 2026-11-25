'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useTrading } from '../../context/TradingContext';
import { ChevronLeft, ChevronRight, ExternalLink, Edit3, Plus } from 'lucide-react';
import { Trade } from '../../lib/types/financial';
import { DeleteConfirmButton } from '../../components/ui/DeleteConfirmButton';
import { QuickTradeModal } from '../../components/modals/QuickTradeModal';

interface DayTradeSummary {
  dateNum: number;
  dateStr: string;
  weekdayStr: string;
  formattedTitle: string;
  isCurrentMonth: boolean;
  isOpenTradeDay: boolean;
  isProfitDay: boolean;
  isLossDay: boolean;
  hasTrades: boolean;
  netPnl: number;
  tradeCount: number;
  openCount: number;
  winCount: number;
  winRatePct: number;
  trades: Trade[];
  journalNote?: string;
  disciplineScore?: number | null;
}

export default function CalendarPage() {
  const {
    accounts,
    selectedAccountId,
    selectedAccount,
    trades,
    filteredTrades,
    journalEntries,
    environmentFilter,
    setEnvironmentFilter,
    isPnlHidden,
    isLoaded,
    deleteTrade,
  } = useTrading();

  // Calendar View Mode: Monthly, Weekly, Daily
  const [viewMode, setViewMode] = useState<'Monthly' | 'Weekly' | 'Daily'>('Monthly');
  const [quickTradeOpen, setQuickTradeOpen] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);

  // Default to today's year, month, and day
  const [displayedYear, setDisplayedYear] = useState<number>(() => new Date().getFullYear());
  const [displayedMonth, setDisplayedMonth] = useState<number>(() => new Date().getMonth());
  const [selectedDayNum, setSelectedDayNum] = useState<number>(() => new Date().getDate());

  const handleJumpToday = () => {
    const today = new Date();
    setDisplayedYear(today.getFullYear());
    setDisplayedMonth(today.getMonth());
    setSelectedDayNum(today.getDate());
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get('date');
    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      const [y, m, d] = dateParam.split('-').map(Number);
      if (y && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        setDisplayedYear(y);
        setDisplayedMonth(m - 1);
        setSelectedDayNum(d);
        return;
      }
    }
    const today = new Date();
    setDisplayedYear(today.getFullYear());
    setDisplayedMonth(today.getMonth());
    setSelectedDayNum(today.getDate());
  }, []);

  // Month navigation helpers
  const handlePrevMonth = () => {
    if (displayedMonth === 0) {
      setDisplayedMonth(11);
      setDisplayedYear((y) => y - 1);
    } else {
      setDisplayedMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (displayedMonth === 11) {
      setDisplayedMonth(0);
      setDisplayedYear((y) => y + 1);
    } else {
      setDisplayedMonth((m) => m + 1);
    }
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const monthName = monthNames[displayedMonth];

  // Helper: Get P&L for a trade given selected account
  const getTradePnl = (t: Trade) => {
    if (selectedAccountId === 'ALL') return t.netPnl;
    const alloc = t.allocations.find((a) => a.accountId === selectedAccountId);
    return alloc ? alloc.netPnl : t.netPnl;
  };

  // Capital Stats for Month
  const startingBal = useMemo(() => {
    if (selectedAccount) return selectedAccount.startingBalance;
    return accounts.reduce((sum, a) => sum + a.startingBalance, 0);
  }, [accounts, selectedAccount]);

  // Aggregate day data for displayed month
  const calendarCells = useMemo(() => {
    // Determine start day of week for 1st of month (0 = Sun, 1 = Mon ... 6 = Sat)
    // We want Monday-based grid (Mon=0, Tue=1 ... Sun=6)
    const firstDayDate = new Date(displayedYear, displayedMonth, 1);
    let startDayOfWeek = firstDayDate.getDay(); // 0 is Sun
    let mondayOffset = (startDayOfWeek + 6) % 7; // Monday = 0, Sunday = 6

    // Total days in current month
    const totalDaysInMonth = new Date(displayedYear, displayedMonth + 1, 0).getDate();

    // Total days in previous month
    const prevMonthDays = new Date(displayedYear, displayedMonth, 0).getDate();

    // Map of day number to trades in this month
    const dayMap = new Map<number, Trade[]>();
    for (let d = 1; d <= totalDaysInMonth; d++) {
      dayMap.set(d, []);
    }

    filteredTrades.forEach((t) => {
      const date = new Date(t.entryTime || t.createdAt);
      const tYear = date.getUTCFullYear();
      const tMonth = date.getUTCMonth();
      const tDay = date.getUTCDate();
      if (tYear === displayedYear && tMonth === displayedMonth) {
        if (dayMap.has(tDay)) {
          dayMap.get(tDay)!.push(t);
        }
      }
    });

    const cells: DayTradeSummary[] = [];

    // 1. Muted leading cells from previous month
    for (let i = mondayOffset - 1; i >= 0; i--) {
      const dNum = prevMonthDays - i;
      cells.push({
        dateNum: dNum,
        dateStr: `${displayedYear}-${String(displayedMonth).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`,
        weekdayStr: '',
        formattedTitle: `${dNum} ${monthNames[(displayedMonth + 11) % 12]}`,
        isCurrentMonth: false,
        isOpenTradeDay: false,
        isProfitDay: false,
        isLossDay: false,
        hasTrades: false,
        netPnl: 0,
        tradeCount: 0,
        openCount: 0,
        winCount: 0,
        winRatePct: 0,
        trades: [],
      });
    }

    // 2. Current month days
    for (let d = 1; d <= totalDaysInMonth; d++) {
      const dTrades = dayMap.get(d) || [];
      const closed = dTrades.filter((t) => t.status === 'CLOSED');
      const open = dTrades.filter((t) => t.status === 'OPEN');

      const net = closed.reduce((sum, t) => sum + getTradePnl(t), 0);
      const wins = closed.filter((t) => getTradePnl(t) > 0).length;
      const winRate = closed.length > 0 ? (wins / closed.length) * 100 : 0;

      const dateObj = new Date(displayedYear, displayedMonth, d);
      const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const weekdayStr = weekdayNames[dateObj.getDay()];

      cells.push({
        dateNum: d,
        dateStr: `${displayedYear}-${String(displayedMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        weekdayStr,
        formattedTitle: `${weekdayStr} ${d} ${monthName}`,
        isCurrentMonth: true,
        isOpenTradeDay: open.length > 0 && closed.length === 0,
        isProfitDay: closed.length > 0 && net >= 0,
        isLossDay: closed.length > 0 && net < 0,
        hasTrades: dTrades.length > 0,
        netPnl: net,
        tradeCount: closed.length,
        openCount: open.length,
        winCount: wins,
        winRatePct: Math.round(winRate),
        trades: dTrades,
      });
    }

    // 3. Muted trailing cells to make up a 6-row grid (42 cells total)
    const totalRendered = cells.length;
    const remaining = 42 - totalRendered;
    for (let j = 1; j <= remaining; j++) {
      cells.push({
        dateNum: j,
        dateStr: `${displayedYear}-${String(displayedMonth + 2).padStart(2, '0')}-${String(j).padStart(2, '0')}`,
        weekdayStr: '',
        formattedTitle: `${j} ${monthNames[(displayedMonth + 1) % 12]}`,
        isCurrentMonth: false,
        isOpenTradeDay: false,
        isProfitDay: false,
        isLossDay: false,
        hasTrades: false,
        netPnl: 0,
        tradeCount: 0,
        openCount: 0,
        winCount: 0,
        winRatePct: 0,
        trades: [],
      });
    }

    return cells;
  }, [displayedYear, displayedMonth, filteredTrades, selectedAccountId]);

  // Group cells into 6 weeks with weekly summaries (8th column)
  const calendarWeeks = useMemo(() => {
    const weeks: {
      days: DayTradeSummary[];
      mondayDateNum: number;
      weekNetPnl: number;
      weekTradeCount: number;
      isHit: boolean;
    }[] = [];

    for (let w = 0; w < 6; w++) {
      const days = calendarCells.slice(w * 7, (w + 1) * 7);
      const mondayDateNum = days[0]?.dateNum || 1;
      const closedInWeek = days.flatMap((d) =>
        d.trades.filter((t) => t.status === 'CLOSED')
      );
      const weekNetPnl = closedInWeek.reduce(
        (sum, t) => sum + getTradePnl(t),
        0
      );
      const weekTradeCount = closedInWeek.length;
      const isHit = weekTradeCount > 0 && weekNetPnl > 0;

      weeks.push({
        days,
        mondayDateNum,
        weekNetPnl,
        weekTradeCount,
        isHit,
      });
    }

    return weeks;
  }, [calendarCells, selectedAccountId]);

  // Monthly summary stats
  const monthSummary = useMemo(() => {
    const currentCells = calendarCells.filter((c) => c.isCurrentMonth && c.hasTrades);
    const closedTradesInMonth = currentCells.flatMap((c) =>
      c.trades.filter((t) => t.status === 'CLOSED')
    );
    const openTradesInMonth = currentCells.flatMap((c) =>
      c.trades.filter((t) => t.status === 'OPEN')
    );

    const netPnl = closedTradesInMonth.reduce((sum, t) => sum + getTradePnl(t), 0);
    const wonCount = closedTradesInMonth.filter((t) => getTradePnl(t) > 0).length;
    const totalClosed = closedTradesInMonth.length;
    const winRate = totalClosed > 0 ? (wonCount / totalClosed) * 100 : 0;
    const returnPct = startingBal > 0 ? (netPnl / startingBal) * 100 : 0;

    const daysTraded = currentCells.filter((c) => c.tradeCount > 0).length;

    // Best day
    let bestDay = currentCells.reduce<DayTradeSummary | null>((best, c) => {
      if (c.tradeCount > 0) {
        if (!best || c.netPnl > best.netPnl) return c;
      }
      return best;
    }, null);

    // Fallback best day if no calculation match
    if (!bestDay && currentCells.length > 0) {
      bestDay = currentCells[0];
    }

    // Build live monthly cumulative sparkline path
    const monthDayCells = calendarCells.filter((c) => c.isCurrentMonth);
    const daysInMonth = monthDayCells.length || 30;
    let running = 0;
    const series = monthDayCells.map((c) => {
      running += c.netPnl;
      return running;
    });
    const minVal = Math.min(0, ...series);
    const maxVal = Math.max(0, ...series);
    const span = maxVal - minVal || 1;
    const pts = series.map((v, i) => {
      const x = daysInMonth > 1 ? (i / (daysInMonth - 1)) * 300 : 150;
      const y = maxVal === minVal ? 55 : 80 - ((v - minVal) / span) * 68;
      return { x, y };
    });
    const linePath =
      pts.length > 0
        ? pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
        : 'M0 55 L300 55';
    const areaPath = `${linePath} L300 90 L0 90 Z`;

    return {
      netPnl,
      returnPct,
      totalClosed,
      totalOpen: openTradesInMonth.length,
      winRate,
      daysTraded,
      bestDay,
      daysInMonth,
      linePath,
      areaPath,
    };
  }, [calendarCells, startingBal, selectedAccountId]);

  // Selected Day Details
  const selectedDay = useMemo(() => {
    const found = calendarCells.find((c) => c.isCurrentMonth && c.dateNum === selectedDayNum);
    if (found) return found;

    const currentMonthCells = calendarCells.filter((c) => c.isCurrentMonth);
    return (
      currentMonthCells[Math.min(selectedDayNum - 1, currentMonthCells.length - 1)] ||
      currentMonthCells[0] ||
      calendarCells[15]
    );
  }, [calendarCells, selectedDayNum]);

  // Formatter helpers
  const formatCur = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(val);
  };

  const formatRoundCur = (val: number) => {
    const sign = val >= 0 ? '+' : '−';
    return `${sign}$${new Intl.NumberFormat('en-US').format(Math.round(Math.abs(val)))}`;
  };

  const activeDeskLabel =
    selectedAccountId === 'ALL'
      ? `All accounts, ${accounts.length}`
      : selectedAccount?.name || `All accounts, ${accounts.length}`;

  return (
    <div className="w-full max-w-[1440px] mx-auto flex-1 flex flex-col gap-3 pb-6">
      {/* Title & Top Controls Bar */}
      <div className="tw-titlerow flex-none mt-1 sm:mt-2 mb-1">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--tw-ink)]">Trading calendar</h1>
          <p className="text-xs text-[var(--tw-ink-2)] mt-0.5">Net P&amp;L, trades and discipline for each day. Dates use the account ruleset timezone.</p>
        </div>
        <div className="tw-cal-controls flex flex-wrap items-center gap-2">
          {/* View Segmented Pill */}
          <div className="tw-seg" role="group" aria-label="View">
            {(['Monthly', 'Weekly', 'Daily'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={viewMode === mode}
                onClick={() => setViewMode(mode)}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* Month Switcher Controls */}
          <div className="flex items-center gap-1 bg-[var(--tw-pill)] p-1 rounded-full border border-[var(--tw-line-strong)] shrink-0">
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="Previous month"
              className="p-1 hover:text-[var(--tw-ink)] text-[var(--tw-ink-2)] transition-colors rounded-full cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-semibold px-2 text-[var(--tw-ink)] font-mono whitespace-nowrap">
              {monthName} {displayedYear}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="Next month"
              className="p-1 hover:text-[var(--tw-ink)] text-[var(--tw-ink-2)] transition-colors rounded-full cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              onClick={handleJumpToday}
              className="ml-0.5 px-2 py-0.5 text-[11px] font-semibold rounded-full bg-[var(--tw-tile)] text-[var(--tw-ink)] border border-[var(--tw-line)] hover:border-[var(--tw-line-strong)] transition-colors cursor-pointer"
            >
              Today
            </button>
          </div>

          {/* Account Selector Button */}
          <button className="tw-btn text-xs" type="button">
            <span>{activeDeskLabel}</span>
          </button>

          {/* Environment Filter Button */}
          <button
            className="tw-btn quiet text-xs"
            type="button"
            onClick={() =>
              setEnvironmentFilter(environmentFilter === 'live' ? 'ALL' : 'live')
            }
          >
            <span>{environmentFilter === 'live' ? 'Live only' : 'All envs'}</span>
          </button>
        </div>
      </div>

      {/* Main Bento Grid Canvas (12 cols x 3 rows) */}
      <main className="tw-cal-grid">
        {/* ================================================================= */}
        {/* 1. CALENDAR TILE (Cols 1-8, Rows 1-3)                             */}
        {/* ================================================================= */}
        <section
          className="tw-tile tw-cal"
          aria-label={`${monthName} ${displayedYear} trading calendar`}
        >
          <div className="tw-calhead">
            <div>
              <h2>
                {monthName} {displayedYear}
              </h2>
              <p>Shade scales with the best day in view. Bar shows each day&apos;s share of it.</p>
            </div>
            <div className="tw-cal-legend">
              <span>
                Loss<i className="tw-ramp" aria-hidden="true" />Profit
              </span>
              <span>
                <i className="tw-sw op" />
                Open trade
              </span>
              <span>
                <i className="tw-sw sel" />
                Selected
              </span>
            </div>
          </div>

          {/* Weekday Column Headers (8 Columns: Mon..Sun + Week) */}
          <div className="tw-weekdays" aria-hidden="true">
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
            <span>Sun</span>
            <span>Week</span>
          </div>

          {/* 48 Grid Cells (6 Weeks x 8 Columns: 7 days + 1 week total) */}
          <div
            className="tw-weeks"
            role="grid"
            aria-label={`Days in ${monthName} ${displayedYear}`}
          >
            {calendarWeeks.map((week, wIdx) => {
              const bestDayNet = monthSummary.bestDay?.netPnl || 4115;

              return (
                <React.Fragment key={`week-row-${wIdx}`}>
                  {week.days.map((cell, idx) => {
                    const isSelected =
                      cell.isCurrentMonth && cell.dateNum === selectedDayNum;
                    const pnlRatio =
                      bestDayNet > 0 ? cell.netPnl / bestDayNet : 0;
                    const magWidth = Math.min(
                      100,
                      Math.max(10, Math.round(pnlRatio * 100))
                    );

                    let cellClass = 'tw-cell';
                    if (!cell.isCurrentMonth) {
                      cellClass += ' mu';
                    } else {
                      if (cell.isOpenTradeDay) {
                        cellClass += ' op';
                      } else if (cell.isProfitDay) {
                        if (pnlRatio >= 0.75) cellClass += ' t4';
                        else if (pnlRatio >= 0.5) cellClass += ' t3';
                        else if (pnlRatio >= 0.25) cellClass += ' t2';
                        else cellClass += ' t1';
                      } else if (cell.isLossDay) {
                        cellClass += ' l';
                      }

                      if (isSelected) cellClass += ' sel';
                    }

                    return (
                      <div
                        key={`${cell.dateStr}-${wIdx}-${idx}`}
                        className={cellClass}
                        role={cell.isCurrentMonth ? 'gridcell' : undefined}
                        tabIndex={cell.isCurrentMonth ? 0 : -1}
                        onClick={() => {
                          if (cell.isCurrentMonth) {
                            setSelectedDayNum(cell.dateNum);
                          }
                        }}
                        aria-selected={isSelected}
                        aria-label={
                          cell.isCurrentMonth
                            ? `${cell.formattedTitle}${
                                cell.hasTrades
                                  ? `, net ${cell.netPnl >= 0 ? 'plus' : 'minus'} ${Math.round(
                                      Math.abs(cell.netPnl)
                                    )} dollars, ${cell.tradeCount} trades`
                                  : ', no trades'
                              }`
                            : undefined
                        }
                      >
                        <span className="dn">{cell.dateNum}</span>
                        {cell.isCurrentMonth && cell.hasTrades && (
                          <>
                            <span
                              className={`pl ${
                                cell.isOpenTradeDay ? 'tw-warn' : ''
                              }`}
                            >
                              {cell.isOpenTradeDay
                                ? 'Open'
                                : isPnlHidden
                                ? '+$••••'
                                : formatRoundCur(cell.netPnl)}
                            </span>
                            <span className="ct">
                              {cell.isOpenTradeDay
                                ? `${cell.openCount} open trade`
                                : `${cell.tradeCount} trade${
                                    cell.tradeCount > 1 ? 's' : ''
                                  }, ${cell.winRatePct}% win`}
                            </span>
                            {!cell.isOpenTradeDay && cell.isProfitDay && (
                              <span className="mag">
                                <i style={{ width: `${magWidth}%` }} />
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}

                  {/* 8th Column: Weekly Summary Cell */}
                  <div
                    key={`week-total-${wIdx}`}
                    className={`tw-cell wk ${week.isHit ? 'hit' : ''}`}
                  >
                    <span className="wl">Wk {week.mondayDateNum}</span>
                    <span className="wt">
                      {week.weekTradeCount > 0
                        ? isPnlHidden
                          ? '+••••••'
                          : `${week.weekNetPnl >= 0 ? '+' : '−'}${formatCur(
                              Math.abs(week.weekNetPnl)
                            )}`
                        : 'no trades'}
                    </span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </section>

        {/* ================================================================= */}
        {/* 2. MONTH HERO TILE (Cols 9-12, Row 1)                             */}
        {/* ================================================================= */}
        <section
          className="tw-tile tw-cal-hero"
          aria-label={`${monthName} net P&L summary`}
        >
          <div className="lbl">Net P&amp;L, {monthName}, closed trades</div>
          <div className="big">
            {(() => {
              if (isPnlHidden) return `${monthSummary.netPnl >= 0 ? '+' : '−'}••••••`;
              const [whole, cents = '00'] = formatCur(Math.abs(monthSummary.netPnl)).split('.');
              return (
                <>
                  {monthSummary.netPnl >= 0 ? '+' : '−'}
                  {whole}
                  <small>.{cents}</small>
                </>
              );
            })()}
          </div>
          <div className="delta">
            <span className="pill">
              {monthSummary.returnPct >= 0 ? '+' : ''}
              {monthSummary.returnPct.toFixed(2)}%
            </span>
            on a {isPnlHidden ? '$••••••.••' : formatCur(startingBal)} start
          </div>
          <div
            className="spark"
            role="img"
            aria-label={`Cumulative P&L for ${monthName}: ${formatCur(monthSummary.netPnl)}`}
          >
            <svg
              viewBox="0 0 300 90"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="cal-hg" x1="0" x2="0" y1="0" y2="1">
                  <stop
                    offset="0"
                    style={{
                      stopColor: 'var(--tw-hero-line)',
                      stopOpacity: 0.42,
                    }}
                  />
                  <stop
                    offset="1"
                    style={{
                      stopColor: 'var(--tw-hero-line)',
                      stopOpacity: 0,
                    }}
                  />
                </linearGradient>
              </defs>
              <path
                d={monthSummary.areaPath}
                fill="url(#cal-hg)"
              />
              <path
                d={monthSummary.linePath}
                fill="none"
                style={{
                  stroke: 'var(--tw-hero-line)',
                  strokeWidth: 2.5,
                  strokeLinejoin: 'round',
                  vectorEffect: 'non-scaling-stroke',
                }}
              />
            </svg>
            <div className="axis">
              <span>1 {monthName.slice(0, 3)}</span>
              <span>
                {monthSummary.daysInMonth} {monthName.slice(0, 3)}
              </span>
            </div>
          </div>
        </section>

        {/* ================================================================= */}
        {/* 3. SELECTED DAY DETAIL TILE (Cols 9-12, Row 2)                    */}
        {/* ================================================================= */}
        <section
          className="tw-tile tw-cal-detail"
          aria-label={`Selected day, ${selectedDay.formattedTitle}`}
        >
          <div className="dhead">
            <div>
              <div className="lbl">Selected day</div>
              <h3>
                {selectedDay.weekdayStr || 'Wednesday'} {selectedDay.dateNum} {monthName}
              </h3>
            </div>
            <span
              className="pill"
              style={{
                background:
                  selectedDay.tradeCount > 0
                    ? 'color-mix(in srgb, var(--tw-gain) 14%, transparent)'
                    : 'var(--tw-pill)',
                color:
                  selectedDay.tradeCount > 0
                    ? 'var(--tw-gain)'
                    : 'var(--tw-ink-3)',
              }}
            >
              {selectedDay.tradeCount > 0
                ? `${selectedDay.tradeCount} closed`
                : selectedDay.isOpenTradeDay
                ? `${selectedDay.openCount} open`
                : 'No trades'}
            </span>
          </div>

          <div
            className={`dval ${
              selectedDay.netPnl >= 0 ? 'text-[var(--tw-gain)]' : 'text-[var(--tw-loss)]'
            }`}
          >
            {selectedDay.hasTrades
              ? isPnlHidden
                ? '+$••••.••'
                : (selectedDay.netPnl >= 0 ? '+' : '−') +
                  formatCur(Math.abs(selectedDay.netPnl))
              : '$0.00'}
          </div>

          {/* Trade Executions for Selected Day */}
          <div className="my-1 space-y-0.5">
            {selectedDay.trades.length > 0 ? (
              selectedDay.trades.slice(0, 2).map((t) => {
                const pnl = getTradePnl(t);
                const isWin = pnl >= 0;
                return (
                  <div key={t.id} className="trow">
                    <span>
                      <b>{t.instrumentSymbol}</b> {t.direction.toLowerCase()}
                    </span>
                    <span
                      className={`num ${
                        t.status === 'OPEN'
                          ? 'text-[var(--tw-warn)]'
                          : isWin
                          ? 'text-[var(--tw-gain)]'
                          : 'text-[var(--tw-loss)]'
                      }`}
                    >
                      {t.status === 'OPEN'
                        ? 'Open'
                        : isPnlHidden
                        ? '••••••'
                        : (pnl >= 0 ? '+' : '−') + formatCur(Math.abs(pnl))}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="rp">
                        {t.status === 'OPEN'
                          ? '—'
                          : `${(t.realizedR || 0) >= 0 ? '+' : ''}${(
                              t.realizedR || 0
                            ).toFixed(2)}R`}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTrade(t);
                          setQuickTradeOpen(true);
                        }}
                        title="Edit trade"
                        aria-label={`Edit ${t.instrumentSymbol} trade`}
                        className="p-1 rounded text-[var(--tw-ink-3)] hover:text-[var(--tw-ink)] transition-colors"
                      >
                        <Edit3 size={12} />
                      </button>
                      <DeleteConfirmButton
                        variant="icon"
                        size={12}
                        title="Delete trade"
                        ariaLabel={`Delete ${t.instrumentSymbol} trade`}
                        onConfirm={() => deleteTrade(t.id)}
                      />
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="py-2 text-xs text-[var(--tw-ink-3)] font-mono">
                No executions recorded.
              </div>
            )}
          </div>

          {/* Discipline Scoring Rule Box */}
          {(() => {
            const dayJournal = journalEntries.find((j) => j.entryDate === selectedDay.dateStr);
            if (!dayJournal) {
              return (
                <div className="disc">
                  <b>Discipline score: not scored.</b> No journal entry exists for this day. Scores are never estimated from P&amp;L.
                </div>
              );
            }
            return (
              <div className="disc">
                <b>Discipline score: {dayJournal.disciplineScore}/10</b> · Mood: {dayJournal.emotionalState}.{' '}
                {dayJournal.dailySummary || dayJournal.lessonsLearned || 'Session journal logged.'}
              </div>
            );
          })()}

          {/* Links to Trade Ledger, New Execution & Journal */}
          <div className="flex flex-col gap-2 pt-1 mt-auto">
            <button
              type="button"
              onClick={() => {
                setEditingTrade(null);
                setQuickTradeOpen(true);
              }}
              className="tw-btn full text-center justify-center inline-flex items-center gap-1.5"
            >
              <Plus size={13} />
              <span>Log execution for {selectedDay.dateNum} {monthName}</span>
            </button>
            <Link
              href={`/trades?date=${selectedDay.dateStr}`}
              className="tw-btn full text-center justify-center"
            >
              <span>Filter ledger for {selectedDay.dateNum} {monthName} →</span>
            </Link>
            <Link
              href={`/journal?date=${selectedDay.dateStr}`}
              className="tw-btn dark full text-center justify-center"
            >
              <span>Open / edit journal for {selectedDay.dateNum} {monthName}</span>
            </Link>
          </div>
        </section>

        {/* ================================================================= */}
        {/* 4. BEST DAY ACCENT TILE (Cols 9-10, Row 3)                         */}
        {/* ================================================================= */}
        <section className="tw-tile tw-cal-sunt" aria-label="Best day">
          <div className="lbl">Best day</div>
          <div className="n">
            {isPnlHidden
              ? '+$••••'
              : monthSummary.bestDay && monthSummary.bestDay.tradeCount > 0
              ? `${monthSummary.bestDay.netPnl >= 0 ? '+' : '−'}${formatCur(Math.abs(monthSummary.bestDay.netPnl)).replace(/\.00$/, '')}`
              : '$0'}
          </div>
          <div className="foot">
            {monthSummary.bestDay && monthSummary.bestDay.tradeCount > 0
              ? `${monthSummary.bestDay.dateNum} ${monthName} · ${monthSummary.bestDay.tradeCount} trade${monthSummary.bestDay.tradeCount === 1 ? '' : 's'}`
              : 'No closed trades'}
          </div>
        </section>

        {/* ================================================================= */}
        {/* 5. TRADES IN VIEW MINT TILE (Cols 11-12, Row 3)                   */}
        {/* ================================================================= */}
        <section className="tw-tile tw-cal-mint" aria-label="Trades in view">
          <div className="lbl">Trades in view</div>
          <div className="n">{monthSummary.totalClosed} closed</div>
          <div className="foot">
            {monthSummary.winRate.toFixed(0)}% win · {monthSummary.daysTraded} day{monthSummary.daysTraded === 1 ? '' : 's'} · {monthSummary.totalOpen} open
          </div>
        </section>
      </main>

      <QuickTradeModal
        isOpen={quickTradeOpen}
        editTrade={editingTrade}
        defaultDate={selectedDay.dateStr}
        onClose={() => {
          setQuickTradeOpen(false);
          setEditingTrade(null);
        }}
      />
    </div>
  );
}

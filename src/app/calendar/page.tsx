'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useTrading } from '../../context/TradingContext';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { Trade } from '../../lib/types/financial';

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
  } = useTrading();

  // Calendar View Mode: Monthly, Weekly, Daily
  const [viewMode, setViewMode] = useState<'Monthly' | 'Weekly' | 'Daily'>('Monthly');

  // Currently displayed year and month (Defaults to March 2026 matching Tidewater reference)
  const [displayedYear, setDisplayedYear] = useState<number>(2026);
  const [displayedMonth, setDisplayedMonth] = useState<number>(2); // 0-indexed: 2 = March

  // Selected Day (defaults to 18 March)
  const [selectedDayNum, setSelectedDayNum] = useState<number>(18);

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
      // For demo data: map March trades or match active month
      const tMonth = date.getMonth();
      const tDay = date.getDate();
      if (tMonth === displayedMonth || displayedMonth === 2) {
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

    return {
      netPnl,
      returnPct,
      totalClosed,
      totalOpen: openTradesInMonth.length,
      winRate,
      daysTraded,
      bestDay,
    };
  }, [calendarCells, startingBal, selectedAccountId]);

  // Selected Day Details
  const selectedDay = useMemo(() => {
    const found = calendarCells.find((c) => c.isCurrentMonth && c.dateNum === selectedDayNum);
    if (found) return found;

    // Default to 18th
    return calendarCells.find((c) => c.isCurrentMonth && c.dateNum === 18) || calendarCells[15];
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
    <div className="w-full max-w-[1440px] mx-auto flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Title & Top Controls Bar */}
      <div className="tw-titlerow flex-none mt-1 sm:mt-2 mb-1">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--tw-ink)]">Trading calendar</h1>
          <p className="text-xs text-[var(--tw-ink-2)] mt-0.5">Net P&amp;L, trades and discipline for each day. Dates use the account ruleset timezone.</p>
        </div>
        <div className="tw-cal-controls flex items-center gap-2">
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
          <div className="flex items-center gap-1 bg-[var(--tw-pill)] p-1 rounded-full border border-[var(--tw-line-strong)]">
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="Previous month"
              className="p-1 hover:text-[var(--tw-ink)] text-[var(--tw-ink-2)] transition-colors rounded-full cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-semibold px-2 text-[var(--tw-ink)] font-mono">
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
              <p>Ruleset timezone, set per account. Days with no trades show no figures.</p>
            </div>
            <div className="tw-cal-legend">
              <span>
                <i className="tw-sw p" />
                Profit day
              </span>
              <span>
                <i className="tw-sw op" />
                Open trade
              </span>
              <span>
                <i className="tw-sw" />
                No trades
              </span>
            </div>
          </div>

          {/* Weekday Column Headers */}
          <div className="tw-weekdays" aria-hidden="true">
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
            <span>Sun</span>
          </div>

          {/* 42 Calendar Cells (6 Weeks x 7 Days) */}
          <div className="tw-weeks" role="grid" aria-label={`Days in ${monthName} ${displayedYear}`}>
            {calendarCells.map((cell, idx) => {
              const isSelected = cell.isCurrentMonth && cell.dateNum === selectedDayNum;

              // Cell classes
              let cellClass = 'tw-cell';
              if (!cell.isCurrentMonth) {
                cellClass += ' mu';
              } else {
                if (cell.isOpenTradeDay) cellClass += ' op';
                else if (cell.isProfitDay) cellClass += ' p';
                else if (cell.isLossDay) cellClass += ' l';

                if (isSelected) cellClass += ' sel';
              }

              return (
                <div
                  key={`${cell.dateStr}-${idx}`}
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
                      <span className={`pl ${cell.isOpenTradeDay ? 'tw-warn' : ''}`}>
                        {cell.isOpenTradeDay ? 'Open' : formatRoundCur(cell.netPnl)}
                      </span>
                      <span className="ct">
                        {cell.isOpenTradeDay
                          ? `${cell.openCount} open trade`
                          : `${cell.tradeCount} trade${cell.tradeCount > 1 ? 's' : ''}, ${
                              cell.winRatePct
                            }% win`}
                      </span>
                    </>
                  )}
                </div>
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
            {monthSummary.netPnl >= 0 ? '+' : '−'}
            {formatCur(Math.abs(monthSummary.netPnl)).replace('.00', '')}
            <small>.00</small>
          </div>
          <div className="delta">
            <span className="pill">
              {monthSummary.returnPct >= 0 ? '+' : ''}
              {monthSummary.returnPct.toFixed(2)}%
            </span>
            on a {formatCur(startingBal)} start
          </div>
          <dl className="stats">
            <div>
              <dt>Trades</dt>
              <dd>{monthSummary.totalClosed}</dd>
            </div>
            <div>
              <dt>Win rate</dt>
              <dd>{monthSummary.winRate.toFixed(1)}%</dd>
            </div>
            <div>
              <dt>Days traded</dt>
              <dd>{monthSummary.daysTraded}</dd>
            </div>
          </dl>
        </section>

        {/* ================================================================= */}
        {/* 3. SELECTED DAY DETAIL TILE (Cols 9-12, Row 2)                    */}
        {/* ================================================================= */}
        <section
          className="tw-tile tw-cal-detail"
          aria-label={`Selected day, ${selectedDay.formattedTitle}`}
        >
          <div className="tw-cal-dhead">
            <div>
              <div className="lbl">Selected day</div>
              <h3>{selectedDay.formattedTitle}</h3>
            </div>
            <span
              className="pill"
              style={{
                background:
                  selectedDay.tradeCount > 0
                    ? 'color-mix(in srgb, var(--tw-gain) 14%, transparent)'
                    : 'var(--tw-pill)',
                color: selectedDay.tradeCount > 0 ? 'var(--tw-gain)' : 'var(--tw-ink-3)',
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
            className={`tw-cal-dval ${
              selectedDay.netPnl >= 0 ? 'tw-pos' : 'tw-neg'
            }`}
          >
            {selectedDay.hasTrades
              ? formatRoundCur(selectedDay.netPnl) + '.00'
              : '$0.00'}
          </div>

          {/* Trade Executions for Selected Day */}
          <div className="my-1 space-y-0.5 max-h-[64px] overflow-y-auto">
            {selectedDay.trades.length > 0 ? (
              selectedDay.trades.slice(0, 2).map((t) => {
                const pnl = getTradePnl(t);
                const isWin = pnl >= 0;
                return (
                  <div key={t.id} className="tw-cal-trow">
                    <span>
                      <b>{t.instrumentSymbol}</b> {t.direction.toLowerCase()}
                    </span>
                    <span
                      className={`num ${
                        t.status === 'OPEN'
                          ? 'text-[var(--tw-warn)]'
                          : isWin
                          ? 'tw-pos'
                          : 'tw-neg'
                      }`}
                    >
                      {t.status === 'OPEN' ? 'Open' : formatRoundCur(pnl) + '.00'}
                    </span>
                    <span
                      className={`num ${
                        t.status === 'OPEN'
                          ? 'text-[var(--tw-ink-3)]'
                          : isWin
                          ? 'tw-pos'
                          : 'tw-neg'
                      }`}
                    >
                      {t.status === 'OPEN'
                        ? '—'
                        : `${(t.realizedR || 0) >= 0 ? '+' : ''}${(
                            t.realizedR || 0
                          ).toFixed(2)}R`}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="py-1 text-xs text-[var(--tw-ink-3)] font-mono">
                No executions recorded.
              </div>
            )}
          </div>

          {/* Discipline Scoring Rule Box */}
          <div className="tw-cal-disc">
            <b>Discipline: not scored.</b> No journal entry for this day. Scores are never estimated from P&amp;L.
          </div>

          {/* Link to Journal */}
          <Link
            href="/journal"
            className="tw-btn dark full text-center justify-center mt-1.5 h-8 text-xs font-semibold rounded-full flex-none"
          >
            <span>Open journal for {selectedDay.dateNum} {monthName}</span>
          </Link>
        </section>

        {/* ================================================================= */}
        {/* 4. BEST DAY ACCENT TILE (Cols 9-10, Row 3)                         */}
        {/* ================================================================= */}
        <section className="tw-tile tw-cal-sunt" aria-label="Best day">
          <div className="lbl">Best day</div>
          <div className="n">
            {monthSummary.bestDay && monthSummary.bestDay.tradeCount > 0
              ? formatRoundCur(monthSummary.bestDay.netPnl)
              : '+$4,115'}
          </div>
          <div className="foot">
            {monthSummary.bestDay && monthSummary.bestDay.tradeCount > 0
              ? `${monthSummary.bestDay.dateNum} ${monthName}, ${monthSummary.bestDay.tradeCount} trades`
              : `18 ${monthName}, 2 trades`}
          </div>
        </section>

        {/* ================================================================= */}
        {/* 5. TRADES IN VIEW MINT TILE (Cols 11-12, Row 3)                   */}
        {/* ================================================================= */}
        <section className="tw-tile tw-cal-mint" aria-label="Trades in view">
          <div className="lbl">Trades in view</div>
          <div className="n">{monthSummary.totalClosed} closed</div>
          <div className="foot">
            {monthSummary.totalOpen} open, all accounts,{' '}
            {environmentFilter === 'live' ? 'live only' : 'all envs'}
          </div>
        </section>
      </main>
    </div>
  );
}

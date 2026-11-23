'use client';

import React, { useState, useMemo } from 'react';
import { useTrading } from '../../context/TradingContext';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  BookOpen,
  Award
} from 'lucide-react';
import { Trade } from '../../lib/types/financial';

export default function CalendarPage() {
  const { filteredTrades, journalEntries, accounts, selectedAccountId } = useTrading();

  const [currentDate, setCurrentDate] = useState(new Date(2024, 2, 1)); // March 2024
  const [selectedDayTrades, setSelectedDayTrades] = useState<{
    dateStr: string;
    trades: Trade[];
    journal?: any;
    netPnl: number;
  } | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Days in month
  const daysInMonth = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay(); // 0 is Sunday
    const daysTotal = new Date(year, month + 1, 0).getDate();

    const days = [];
    // Padding for beginning of month
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let d = 1; d <= daysTotal; d++) {
      days.push(d);
    }
    return days;
  }, [year, month]);

  // Aggregate trade and journal data per day
  const dayStatsMap = useMemo(() => {
    const map: {
      [dayKey: string]: {
        netPnl: number;
        tradeCount: number;
        wins: number;
        trades: Trade[];
        journal?: any;
      };
    } = {};

    filteredTrades.forEach((t) => {
      const dateKey = (t.exitTime || t.createdAt).split('T')[0];
      if (!map[dateKey]) {
        map[dateKey] = { netPnl: 0, tradeCount: 0, wins: 0, trades: [] };
      }
      map[dateKey].trades.push(t);
      if (t.status === 'CLOSED') {
        const pnl = selectedAccountId === 'ALL'
          ? t.netPnl
          : (t.allocations.find((a) => a.accountId === selectedAccountId)?.netPnl || 0);

        map[dateKey].netPnl += pnl;
        map[dateKey].tradeCount++;
        if (pnl > 0) map[dateKey].wins++;
      }
    });

    journalEntries.forEach((j) => {
      if (!map[j.entryDate]) {
        map[j.entryDate] = { netPnl: 0, tradeCount: 0, wins: 0, trades: [] };
      }
      map[j.entryDate].journal = j;
    });

    return map;
  }, [filteredTrades, journalEntries, selectedAccountId]);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(val);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-edge-border">
        <div>
          <div className="flex items-center space-x-2">
            <CalendarIcon size={20} className="text-edge-accent" />
            <h1 className="text-xl font-mono font-bold tracking-tight text-white uppercase">
              TRADING EXECUTION CALENDAR
            </h1>
          </div>
          <p className="text-xs text-edge-text-secondary mt-0.5">
            Daily consistency map, daily P&L variance, and psychological discipline audit.
          </p>
        </div>

        {/* Month Selector Controls */}
        <div className="flex items-center space-x-3 font-mono text-xs">
          <button
            onClick={handlePrevMonth}
            className="p-1.5 rounded border border-edge-border bg-edge-surface-secondary hover:bg-edge-surface-secondary/70 text-edge-text-secondary hover:text-white transition-colors"
          >
            <ChevronLeft size={16} />
          </button>

          <span className="font-bold text-white uppercase tracking-wider min-w-[120px] text-center">
            {monthNames[month]} {year}
          </span>

          <button
            onClick={handleNextMonth}
            className="p-1.5 rounded border border-edge-border bg-edge-surface-secondary hover:bg-edge-surface-secondary/70 text-edge-text-secondary hover:text-white transition-colors"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="rounded-lg border border-edge-border bg-edge-surface shadow-terminal overflow-hidden">
        {/* Days of week header */}
        <div className="grid grid-cols-7 border-b border-edge-border bg-edge-surface-secondary/60 text-center font-mono text-[11px] text-edge-text-muted font-bold py-2.5">
          <span>SUN</span>
          <span>MON</span>
          <span>TUE</span>
          <span>WED</span>
          <span>THU</span>
          <span>FRI</span>
          <span>SAT</span>
        </div>

        {/* Month Days Grid */}
        <div className="grid grid-cols-7 divide-x divide-y divide-edge-border/40">
          {daysInMonth.map((day, idx) => {
            if (!day) {
              return (
                <div
                  key={`pad-${idx}`}
                  className="min-h-[100px] p-2 bg-edge-bg/30 text-edge-text-muted/20"
                />
              );
            }

            const monthStr = (month + 1).toString().padStart(2, '0');
            const dayStr = day.toString().padStart(2, '0');
            const dateKey = `${year}-${monthStr}-${dayStr}`;

            const stats = dayStatsMap[dateKey];
            const hasTrades = stats && stats.tradeCount > 0;
            const hasJournal = stats && stats.journal;
            const isProfit = hasTrades && stats.netPnl >= 0;

            return (
              <div
                key={dateKey}
                onClick={() => {
                  if (stats) {
                    setSelectedDayTrades({
                      dateStr: dateKey,
                      trades: stats.trades,
                      journal: stats.journal,
                      netPnl: stats.netPnl,
                    });
                  }
                }}
                className={`min-h-[105px] p-2.5 flex flex-col justify-between font-mono text-xs transition-colors cursor-pointer ${
                  hasTrades
                    ? isProfit
                      ? 'bg-edge-profit/5 hover:bg-edge-profit/15'
                      : 'bg-edge-loss/5 hover:bg-edge-loss/15'
                    : 'hover:bg-edge-surface-secondary/40'
                }`}
              >
                {/* Day Header */}
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold ${hasTrades ? 'text-white' : 'text-edge-text-muted'}`}>
                    {day}
                  </span>

                  {hasJournal && (
                    <span
                      className={`text-[9px] px-1 rounded font-bold ${
                        stats.journal.disciplineScore >= 8
                          ? 'bg-edge-profit/20 text-edge-profit'
                          : 'bg-edge-warning/20 text-edge-warning'
                      }`}
                      title={`Discipline Score: ${stats.journal.disciplineScore}/10`}
                    >
                      D:{stats.journal.disciplineScore}
                    </span>
                  )}
                </div>

                {/* Day P&L & Count */}
                {hasTrades ? (
                  <div className="space-y-0.5 my-auto">
                    <div
                      className={`text-xs font-bold tabular-nums ${
                        isProfit ? 'text-edge-profit' : 'text-edge-loss'
                      }`}
                    >
                      {isProfit ? '+' : ''}{formatCurrency(stats.netPnl)}
                    </div>
                    <div className="text-[10px] text-edge-text-muted">
                      {stats.tradeCount} trade{stats.tradeCount > 1 ? 's' : ''} ({stats.wins}W)
                    </div>
                  </div>
                ) : (
                  <div className="text-[10px] text-edge-text-muted/40 my-auto">No trades</div>
                )}

                <div className="h-1" />
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Day Details Modal */}
      {selectedDayTrades && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-xl max-h-[85vh] overflow-y-auto rounded-lg border border-edge-border bg-edge-surface shadow-terminal p-5 space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-edge-border pb-3">
              <div>
                <span className="text-[10px] text-edge-text-muted uppercase">Execution Day Review</span>
                <h2 className="text-base font-bold text-white uppercase">{selectedDayTrades.dateStr}</h2>
              </div>
              <button
                onClick={() => setSelectedDayTrades(null)}
                className="text-edge-text-secondary hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Daily Net */}
            <div className="flex items-center justify-between p-3 rounded border border-edge-border bg-edge-surface-secondary/40">
              <span className="text-edge-text-muted uppercase">Day Net Realized P&L:</span>
              <span
                className={`text-base font-bold tabular-nums ${
                  selectedDayTrades.netPnl >= 0 ? 'text-edge-profit' : 'text-edge-loss'
                }`}
              >
                {selectedDayTrades.netPnl >= 0 ? '+' : ''}{formatCurrency(selectedDayTrades.netPnl)}
              </span>
            </div>

            {/* Day Trades */}
            {selectedDayTrades.trades.length > 0 && (
              <div className="space-y-2">
                <span className="text-[10px] text-edge-accent uppercase font-bold tracking-wider block">
                  Trades Executed ({selectedDayTrades.trades.length})
                </span>
                {selectedDayTrades.trades.map((t) => (
                  <div
                    key={t.id}
                    className="p-3 rounded border border-edge-border bg-edge-surface-secondary/20 flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-white">
                        {t.instrumentSymbol} {t.direction} • {t.setupType}
                      </div>
                      <div className="text-[10px] text-edge-text-muted">
                        In: {t.entryPrice} • Risk: ${t.plannedRiskUsd} • {t.session} Session
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`font-bold tabular-nums ${
                          t.netPnl >= 0 ? 'text-edge-profit' : 'text-edge-loss'
                        }`}
                      >
                        {t.status === 'CLOSED'
                          ? `${t.netPnl >= 0 ? '+' : ''}${formatCurrency(t.netPnl)}`
                          : 'OPEN'}
                      </div>
                      <div className="text-[10px] text-edge-text-muted">
                        {t.status === 'CLOSED' ? `${t.realizedR}R` : 'Active'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Day Journal */}
            {selectedDayTrades.journal && (
              <div className="p-3 rounded border border-edge-border bg-edge-surface-secondary/20 space-y-2">
                <div className="flex justify-between items-center text-edge-accent">
                  <span className="font-bold uppercase tracking-wider text-[10px]">
                    Session Journal & Score
                  </span>
                  <span>Discipline: {selectedDayTrades.journal.disciplineScore}/10</span>
                </div>
                <p className="font-sans text-edge-text-secondary text-xs">
                  {selectedDayTrades.journal.dailySummary}
                </p>
                {selectedDayTrades.journal.lessonsLearned && (
                  <p className="font-sans text-edge-accent text-xs pt-1 border-t border-edge-border/40">
                    Lesson: {selectedDayTrades.journal.lessonsLearned}
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-edge-border">
              <button
                onClick={() => setSelectedDayTrades(null)}
                className="px-4 py-1.5 rounded bg-edge-surface-secondary border border-edge-border text-white font-mono hover:bg-edge-surface-secondary/70"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

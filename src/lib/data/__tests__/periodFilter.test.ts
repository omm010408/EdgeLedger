import { describe, it, expect } from 'vitest';
import {
  getCurrentWeekDays,
  filterTradesByPeriod,
  getPeriodDateRangeLabel,
} from '../periodFilter';
import { Trade } from '../../types/financial';

describe('Period Filter & Current Week Tests', () => {
  it('generates strictly 7 days of the current week (Monday through Sunday)', () => {
    // Nov 26 2026 is a Thursday.
    // The current week is Monday 23 Nov 2026 to Sunday 29 Nov 2026.
    const fakeTrades: Partial<Trade>[] = [
      {
        id: 't-1',
        entryTime: '2026-11-25T14:30:00Z', // Wednesday
        netPnl: 54,
        status: 'CLOSED',
      },
    ];

    const week = getCurrentWeekDays(fakeTrades as Trade[]);
    expect(week).toHaveLength(7);
    expect(week[0].weekdayShort).toBe('Mon');
    expect(week[0].dateKey).toBe('2026-11-23');
    expect(week[1].weekdayShort).toBe('Tue');
    expect(week[1].dateKey).toBe('2026-11-24');
    expect(week[2].weekdayShort).toBe('Wed');
    expect(week[2].dateKey).toBe('2026-11-25');
    expect(week[3].weekdayShort).toBe('Thu');
    expect(week[3].dateKey).toBe('2026-11-26');
    expect(week[4].weekdayShort).toBe('Fri');
    expect(week[4].dateKey).toBe('2026-11-27');
    expect(week[5].weekdayShort).toBe('Sat');
    expect(week[5].dateKey).toBe('2026-11-28');
    expect(week[6].weekdayShort).toBe('Sun');
    expect(week[6].dateKey).toBe('2026-11-29');
  });

  it('filters trades strictly to current week, excluding previous week trades', () => {
    const trades: Partial<Trade>[] = [
      // Previous week trades (19-22 Nov 2026)
      { id: 't-prev-1', entryTime: '2026-11-19T10:00:00Z', netPnl: -100, status: 'CLOSED' },
      { id: 't-prev-2', entryTime: '2026-11-20T11:00:00Z', netPnl: 200, status: 'CLOSED' },
      { id: 't-prev-3', entryTime: '2026-11-22T12:00:00Z', netPnl: 50, status: 'CLOSED' },
      // Current week trades (23-29 Nov 2026)
      { id: 't-curr-1', entryTime: '2026-11-24T14:00:00Z', netPnl: -32, status: 'CLOSED' },
      { id: 't-curr-2', entryTime: '2026-11-25T15:00:00Z', netPnl: 54, status: 'CLOSED' },
    ];

    const weekFiltered = filterTradesByPeriod(trades as Trade[], 'Week');
    const ids = weekFiltered.map((t) => t.id);

    // Must ONLY include current week trades
    expect(ids).toEqual(['t-curr-1', 't-curr-2']);
    expect(ids).not.toContain('t-prev-1');
    expect(ids).not.toContain('t-prev-2');
    expect(ids).not.toContain('t-prev-3');
  });

  it('formats current week range label correctly as Monday–Sunday', () => {
    const fakeTrades: Partial<Trade>[] = [
      { id: 't-1', entryTime: '2026-11-25T14:30:00Z', netPnl: 54, status: 'CLOSED' },
    ];

    const label = getPeriodDateRangeLabel(fakeTrades as Trade[], 'Week');
    expect(label).toBe('23–29 Nov 2026');
  });
});

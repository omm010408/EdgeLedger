import { Trade } from '../types/financial';

export type PeriodFilterValue = 'Today' | 'Week' | 'Month' | 'All time';

function getTradeTimestamp(t: Trade): number {
  const raw = t.exitTime || t.entryTime || t.createdAt;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Returns UTC timestamp for Monday 00:00:00 of the week containing date `d`.
 * Standard ISO trading week: Monday through Sunday.
 */
function getMondayOfWeekUtc(d: Date): number {
  const dayOfWeek = d.getUTCDay(); // 0 is Sunday, 1 is Monday ... 6 is Saturday
  const diffToMonday = (dayOfWeek + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - diffToMonday * 86_400_000;
}

/**
 * Filters trades by Period ('Today' | 'Week' | 'Month' | 'All time') anchored to the current calendar window,
 * with graceful fallback to the latest active window if all trades are historical.
 */
export function filterTradesByPeriod(
  trades: Trade[],
  period: PeriodFilterValue
): Trade[] {
  if (period === 'All time' || trades.length === 0) {
    return trades;
  }

  const now = new Date();
  const tradeTimes = trades.map(getTradeTimestamp).filter((ts) => ts > 0);

  // If there are trades, check if the latest trade is far in the past compared to system clock
  let anchorDate = now;
  if (tradeTimes.length > 0) {
    const latestTradeMs = Math.max(...tradeTimes);
    const diffDays = Math.abs(now.getTime() - latestTradeMs) / 86_400_000;
    if (diffDays > 30) {
      anchorDate = new Date(latestTradeMs);
    }
  }

  if (period === 'Today') {
    const dayStartMs = Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth(), anchorDate.getUTCDate());
    const dayEndMs = dayStartMs + 86_400_000 - 1;
    const matches = trades.filter((t) => {
      const ts = getTradeTimestamp(t);
      return ts >= dayStartMs && ts <= dayEndMs;
    });
    if (matches.length > 0) return matches;
    if (tradeTimes.length > 0) {
      const latestTs = Math.max(...tradeTimes);
      const latestDay = new Date(latestTs);
      const latestStart = Date.UTC(latestDay.getUTCFullYear(), latestDay.getUTCMonth(), latestDay.getUTCDate());
      const latestEnd = latestStart + 86_400_000 - 1;
      return trades.filter((t) => {
        const ts = getTradeTimestamp(t);
        return ts >= latestStart && ts <= latestEnd;
      });
    }
    return trades;
  }

  if (period === 'Week') {
    // Current week only: Monday 00:00:00 UTC through Sunday 23:59:59.999 UTC
    const mondayMs = getMondayOfWeekUtc(anchorDate);
    const sundayEndMs = mondayMs + 7 * 86_400_000 - 1;

    const weekMatches = trades.filter((t) => {
      const ts = getTradeTimestamp(t);
      return ts >= mondayMs && ts <= sundayEndMs;
    });

    if (weekMatches.length > 0) {
      return weekMatches;
    }

    // Fallback if no trades in anchor week: use latest trade's calendar week
    if (tradeTimes.length > 0) {
      const latestTradeDate = new Date(Math.max(...tradeTimes));
      const fallbackMondayMs = getMondayOfWeekUtc(latestTradeDate);
      const fallbackSundayMs = fallbackMondayMs + 7 * 86_400_000 - 1;
      return trades.filter((t) => {
        const ts = getTradeTimestamp(t);
        return ts >= fallbackMondayMs && ts <= fallbackSundayMs;
      });
    }

    return trades;
  }

  if (period === 'Month') {
    // Current month only: 1st of month 00:00:00 UTC to end of month 23:59:59.999 UTC
    const startOfMonthMs = Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth(), 1);
    const endOfMonthMs = Date.UTC(anchorDate.getUTCFullYear(), anchorDate.getUTCMonth() + 1, 1) - 1;

    const monthMatches = trades.filter((t) => {
      const ts = getTradeTimestamp(t);
      return ts >= startOfMonthMs && ts <= endOfMonthMs;
    });

    if (monthMatches.length > 0) {
      return monthMatches;
    }

    if (tradeTimes.length > 0) {
      const latestTradeDate = new Date(Math.max(...tradeTimes));
      const fallbackStartMs = Date.UTC(latestTradeDate.getUTCFullYear(), latestTradeDate.getUTCMonth(), 1);
      const fallbackEndMs = Date.UTC(latestTradeDate.getUTCFullYear(), latestTradeDate.getUTCMonth() + 1, 1) - 1;
      return trades.filter((t) => {
        const ts = getTradeTimestamp(t);
        return ts >= fallbackStartMs && ts <= fallbackEndMs;
      });
    }

    return trades;
  }

  return trades;
}

export function getPeriodDateRangeLabel(
  trades: Trade[],
  period: PeriodFilterValue
): string {
  if (period === 'All time') return 'All time';
  if (trades.length === 0) {
    return period === 'Today' ? 'Today' : period === 'Week' ? 'Current week' : 'Current month';
  }

  if (period === 'Week') {
    const weekDays = getCurrentWeekDays(trades);
    if (weekDays.length > 0) {
      const first = weekDays[0];
      const last = weekDays[weekDays.length - 1];
      const year = last.dateKey.slice(0, 4);
      return first.monthShort === last.monthShort
        ? `${first.day}–${last.day} ${last.monthShort} ${year}`
        : `${first.day} ${first.monthShort}–${last.day} ${last.monthShort} ${year}`;
    }
  }

  const timestamps = trades.map(getTradeTimestamp).filter((ts) => ts > 0);
  if (timestamps.length === 0) {
    return period === 'Today' ? 'Today' : period === 'Week' ? 'Current week' : 'Current month';
  }
  const minDate = new Date(Math.min(...timestamps));
  const maxDate = new Date(Math.max(...timestamps));
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
  const startLabel = fmt(minDate);
  const endLabel = fmt(maxDate);
  const year = maxDate.getUTCFullYear();
  return startLabel === endLabel ? `${startLabel} ${year}` : `${startLabel} – ${endLabel} ${year}`;
}

/**
 * Returns the 7 days of the current calendar week (Monday through Sunday).
 * Anchored to current real-world week, or to the latest trade's week if historical dataset.
 */
export function getCurrentWeekDays(
  trades: Trade[] = []
): { day: number; monthShort: string; dateKey: string; weekdayShort: string }[] {
  const now = new Date();
  let anchorDate = now;

  const tradeTimes = trades
    .map(getTradeTimestamp)
    .filter((ts) => ts > 0);

  if (tradeTimes.length > 0) {
    const latestTradeMs = Math.max(...tradeTimes);
    const diffDays = Math.abs(now.getTime() - latestTradeMs) / 86_400_000;
    if (diffDays > 30) {
      anchorDate = new Date(latestTradeMs);
    }
  }

  const mondayMs = getMondayOfWeekUtc(anchorDate);
  const weekdayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const days: { day: number; monthShort: string; dateKey: string; weekdayShort: string }[] = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(mondayMs + i * 86_400_000);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    days.push({
      day: d.getUTCDate(),
      monthShort: d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
      dateKey: `${yyyy}-${mm}-${dd}`,
      weekdayShort: weekdayNames[i],
    });
  }

  return days;
}

/** Alias for backward compatibility */
export const getRollingSevenDays = getCurrentWeekDays;

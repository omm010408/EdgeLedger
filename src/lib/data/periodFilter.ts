import { Trade } from '../types/financial';

export type PeriodFilterValue = 'Today' | 'Week' | 'Month' | 'All time';

function getTradeTimestamp(t: Trade): number {
  const raw = t.exitTime || t.entryTime || t.createdAt;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Filters trades by Period ('Week' | 'Month' | 'All time') anchored to today,
 * with graceful fallback to the latest active window if all trades are legacy/historical.
 */
export function filterTradesByPeriod(
  trades: Trade[],
  period: PeriodFilterValue
): Trade[] {
  if (period === 'All time' || trades.length === 0) {
    return trades;
  }

  const now = Date.now();
  const windowMs =
    period === 'Today' ? 86_400_000 : period === 'Week' ? 7 * 86_400_000 : 30 * 86_400_000;
  const recentCutoff = now - windowMs;
  const upperBound = now + 86_400_000;

  const recentMatches = trades.filter((t) => {
    const ts = getTradeTimestamp(t);
    return ts >= recentCutoff && ts <= upperBound;
  });

  if (recentMatches.length > 0) {
    return recentMatches;
  }

  // Fallback for historical/seed datasets whose timestamps predate today
  const latestTs = Math.max(...trades.map(getTradeTimestamp));
  if (!Number.isFinite(latestTs) || latestTs <= 0) return trades;

  const anchoredCutoff = latestTs - windowMs;
  return trades.filter((t) => {
    const ts = getTradeTimestamp(t);
    return ts >= anchoredCutoff && ts <= latestTs + 86_400_000;
  });
}

export function getPeriodDateRangeLabel(
  trades: Trade[],
  period: PeriodFilterValue
): string {
  if (period === 'All time') return 'All time';
  if (trades.length === 0) {
    return period === 'Week' ? 'Last 7 days' : 'Last 30 days';
  }
  const timestamps = trades.map(getTradeTimestamp).filter((ts) => ts > 0);
  if (timestamps.length === 0) {
    return period === 'Week' ? 'Last 7 days' : 'Last 30 days';
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

export function getRollingSevenDays(
  trades: Trade[]
): { day: number; monthShort: string; dateKey: string }[] {
  const now = Date.now();
  const sevenDaysAgo = now - 6 * 86_400_000;
  const hasRecentTrade = trades.some((t) => {
    const ts = Date.parse(t.entryTime || t.createdAt);
    return Number.isFinite(ts) && ts >= sevenDaysAgo - 86_400_000;
  });

  let endMs = now;
  if (!hasRecentTrade && trades.length > 0) {
    const tradeTimes = trades
      .map((t) => Date.parse(t.entryTime || t.createdAt))
      .filter((ts) => Number.isFinite(ts) && ts > 0);
    if (tradeTimes.length > 0) {
      endMs = Math.max(...tradeTimes);
    }
  }

  const endDate = new Date(endMs);
  const endUtcMidnight = Date.UTC(
    endDate.getUTCFullYear(),
    endDate.getUTCMonth(),
    endDate.getUTCDate()
  );

  const days: { day: number; monthShort: string; dateKey: string }[] = [];
  for (let offset = 6; offset >= 0; offset--) {
    const d = new Date(endUtcMidnight - offset * 86_400_000);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    days.push({
      day: d.getUTCDate(),
      monthShort: d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }),
      dateKey: `${yyyy}-${mm}-${dd}`,
    });
  }
  return days;
}

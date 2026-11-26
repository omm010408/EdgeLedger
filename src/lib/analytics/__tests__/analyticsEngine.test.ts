import { describe, it, expect } from 'vitest';
import {
  SEED_ACCOUNTS,
  SEED_TRADES,
  SEED_STRATEGIES,
} from '../../data/seedData';
import {
  computeDeskComparisonStats,
  computeReconciliationConflicts,
  computeSampleGuard,
  buildEquityAndDrawdownSeries,
  computeFirmRuleMonitors,
  computeRDistribution,
  computeEdgeHeatmap,
  computeStrategyAttribution,
  computeStreaksAndClustering,
  computeBreakdownRows,
  detectTradeQualitySupport,
  serializeTableToCsv,
  AnalyticsFilterState,
  filterTradesByAnalyticsControls,
} from '../analyticsEngine';

describe('Analytics Engine — Baseline 4 Closed Trades Hand Calculations & Conflicts', () => {
  const allClosedSeed = SEED_TRADES.filter((t) => t.status === 'CLOSED');
  const defaultFilter: AnalyticsFilterState = {
    selectedAccountIds: [],
    period: 'All time',
    excludeSwingFromSession: true,
    drilldown: null,
  };

  it('filters to the 4 closed baseline trades chronologically', () => {
    const filtered = filterTradesByAnalyticsControls(SEED_TRADES, SEED_ACCOUNTS, defaultFilter);
    expect(filtered).toHaveLength(4);
    expect(filtered.map((t) => t.id)).toEqual(['tr-001', 'tr-002', 'tr-003', 'tr-004']);
  });

  it('enforces sample-size guards (<5 Insufficient sample, <30 Low sample, <30 trading days)', () => {
    const guard = computeSampleGuard(allClosedSeed);
    expect(guard.n).toBe(4);
    expect(guard.isLowSample).toBe(true);
    expect(guard.isInsufficientForRatio).toBe(true);
    expect(guard.hasEnoughTradingDays).toBe(false);
    expect(guard.tradingDaysCount).toBe(2); // 2024-03-18 and 2024-03-19
  });

  it('matches hand-calculated per-desk totals (+$7,011.00) and surfaces the exact $60.00 reconciliation gap vs +$7,071.00', () => {
    const deskStats = computeDeskComparisonStats(SEED_ACCOUNTS, allClosedSeed);
    const apex = deskStats.find((d) => d.id === 'acc-apex-100k')!;
    const ftmo = deskStats.find((d) => d.id === 'acc-ftmo-50k')!;
    const ic = deskStats.find((d) => d.id === 'acc-icmarkets-25k')!;

    // Hand-calculated per-desk closed allocation sums
    expect(apex.netPnl).toBe(6090); // 2820 + 3270
    expect(apex.n).toBe(2);
    expect(apex.winRate).toBe(100);
    expect(apex.hasNoLosses).toBe(true);
    expect(apex.profitFactorDisplay).toBe('No losing trades');

    expect(ftmo.netPnl).toBe(1235);
    expect(ftmo.n).toBe(1);
    expect(ftmo.hasNoLosses).toBe(true);
    expect(ftmo.profitFactorDisplay).toBe('No losing trades');

    expect(ic.netPnl).toBe(-314);
    expect(ic.n).toBe(1);
    expect(ic.winRate).toBe(0);
    expect(ic.profitFactorDisplay).toBe('Insufficient sample');

    const recon = computeReconciliationConflicts({
      allClosedTrades: allClosedSeed,
      deskStats,
      selectedAccountIds: [],
      allAccountsCount: SEED_ACCOUNTS.length,
      reportYear: 2026,
    });

    expect(recon.consolidatedNet).toBe(7071); // 2880 + 1235 - 314 + 3270
    expect(recon.deskAllocationSum).toBe(7011); // 6090 + 1235 - 314
    expect(recon.netGap).toBe(60); // Exact $60.00 discrepancy surfaced, never hidden
    expect(recon.hasDateEraConflict).toBe(true);
    expect(recon.messages.some((m) => m.includes('$60.00'))).toBe(true);
  });

  it('surfaces open account-equity conflicts transparently when equity differs from implied ledger sum', () => {
    const conflictedAccounts = SEED_ACCOUNTS.map((acc) => {
      if (acc.id === 'acc-apex-100k') return { ...acc, currentEquity: 105420 };
      if (acc.id === 'acc-ftmo-50k') return { ...acc, currentEquity: 53280 };
      if (acc.id === 'acc-icmarkets-25k') return { ...acc, currentEquity: 27150 }; // +2150 vs -314 net
      return acc;
    });
    const deskStats = computeDeskComparisonStats(conflictedAccounts, allClosedSeed);
    const recon = computeReconciliationConflicts({
      allClosedTrades: allClosedSeed,
      deskStats,
      selectedAccountIds: [],
      allAccountsCount: conflictedAccounts.length,
      reportYear: 2026,
    });

    expect(recon.messages.some((m) => m.includes('Apex 100K') && m.includes('$105,420.00'))).toBe(true);
    expect(recon.messages.some((m) => m.includes('FTMO 50K') && m.includes('$53,280.00'))).toBe(true);
    expect(recon.messages.some((m) => m.includes('IC Markets') && m.includes('$27,150.00'))).toBe(true);
  });

  it('matches hand-calculated R distribution: Mean +1.83R, Median +2.675R, Expectancy +$1,767.75', () => {
    const rDist = computeRDistribution(allClosedSeed, [], SEED_ACCOUNTS.length);
    // R values: 2.88, 2.47, -1.00, 2.97 => sum = 7.32 => mean = 1.83
    // Sorted: [-1.00, 2.47, 2.88, 2.97] => median = (2.47 + 2.88) / 2 = 2.675
    // Expectancy $: 7071 / 4 = 1767.75
    expect(rDist.n).toBe(4);
    expect(rDist.meanR).toBe(1.83);
    expect(rDist.medianR).toBe(2.675);
    expect(rDist.expectancyUsd).toBe(1767.75);

    const binNeg1To0 = rDist.bins.find((b) => b.id === 'r-neg1-0')!;
    const bin2To3 = rDist.bins.find((b) => b.id === 'r-2-3')!;
    expect(binNeg1To0.count).toBe(1);
    expect(bin2To3.count).toBe(3); // +2.88R, +2.47R, +2.97R
  });

  it('excludes swing trades (HTF Orderflow +$3,270) from Edge Heatmap when excludeSwingFromSession=true and restores when false', () => {
    const excluded = computeEdgeHeatmap(allClosedSeed, true);
    expect(excluded.excludedSwingTrades).toHaveLength(1);
    expect(excluded.excludedSwingTrades[0].id).toBe('tr-004');

    const tueNyExcluded = excluded.cells.find((c) => c.weekday === 'Tue' && c.session === 'New York')!;
    expect(tueNyExcluded.n).toBe(0);
    expect(tueNyExcluded.expectancyR).toBeNull(); // Empty cells must be null ("no trades"), never 0

    const monLon = excluded.cells.find((c) => c.weekday === 'Mon' && c.session === 'London')!;
    expect(monLon.n).toBe(1);
    expect(monLon.expectancyR).toBe(2.88);
    expect(monLon.netPnl).toBe(2880);

    const included = computeEdgeHeatmap(allClosedSeed, false);
    const tueNyIncluded = included.cells.find((c) => c.weekday === 'Tue' && c.session === 'New York')!;
    expect(tueNyIncluded.n).toBe(1);
    expect(tueNyIncluded.expectancyR).toBe(2.97);
    expect(tueNyIncluded.netPnl).toBe(3270);
  });

  it('computes Strategy Attribution, Streaks & Clustering, Long vs Short, Equity/Drawdown, Firm Rules, and Trade Quality gate', () => {
    const stratRows = computeStrategyAttribution(SEED_STRATEGIES, allClosedSeed, [], SEED_ACCOUNTS.length);
    const htf = stratRows.find((r) => r.strategyId === 'strat-htf-orderflow')!;
    expect(htf.n).toBe(1);
    expect(htf.netPnl).toBe(3270);
    expect(htf.winRate).toBe(100);
    expect(htf.expectancyR).toBe(2.97);

    const streaks = computeStreaksAndClustering(allClosedSeed, [], SEED_ACCOUNTS.length);
    // Sequence: W (+2880), W (+1235), L (-314), W (+3270)
    expect(streaks.currentStreakCount).toBe(1);
    expect(streaks.currentStreakType).toBe('WIN');
    expect(streaks.longestWinStreak).toBe(2);
    expect(streaks.longestLossStreak).toBe(1);
    expect(streaks.tradesPerDayDistribution).toHaveLength(1);
    expect(streaks.tradesPerDayDistribution[0].tradesCount).toBe(2);
    expect(streaks.tradesPerDayDistribution[0].daysCount).toBe(2);

    const dirRows = computeBreakdownRows(
      allClosedSeed,
      (t) => ({ key: t.direction, label: t.direction === 'BUY' ? 'Long (BUY)' : 'Short (SELL)' }),
      [],
      SEED_ACCOUNTS.length
    );
    const longs = dirRows.find((d) => d.key === 'BUY')!;
    expect(longs.n).toBe(3);
    expect(longs.netPnl).toBe(5836); // 2880 - 314 + 3270
    expect(longs.winRate).toBe(66.7);

    const curves = buildEquityAndDrawdownSeries(SEED_ACCOUNTS, allClosedSeed, []);
    expect(curves.combined.points).toHaveLength(5);
    expect(curves.combined.maxDrawdownDollars).toBe(314); // Dip from tr-003 (-314)
    expect(curves.combined.recoveryDate).toBe('2024-03-19'); // Recovered same day via tr-004

    const ruleMonitors = computeFirmRuleMonitors(SEED_ACCOUNTS, allClosedSeed);
    expect(ruleMonitors).toHaveLength(3);

    const tq = detectTradeQualitySupport(allClosedSeed);
    expect(tq.supported).toBe(false);
    expect(tq.missingFields).toEqual(['trade.maeUsd', 'trade.mfeUsd']);

    const csv = serializeTableToCsv(['Desk', 'Net'], [['Apex 100K', 6090]]);
    expect(csv).toBe('Desk,Net\nApex 100K,6090');
  });

  it('filters closed trades accurately across all interactive chart/table drilldowns', () => {
    const bySymbol = filterTradesByAnalyticsControls(SEED_TRADES, SEED_ACCOUNTS, {
      selectedAccountIds: [],
      period: 'All time',
      excludeSwingFromSession: true,
      drilldown: { type: 'symbol', value: 'BTCUSD', label: 'Symbol: BTCUSD' },
    });
    expect(bySymbol.map((t) => t.id)).toEqual(['tr-004']);

    const bySessionExcl = filterTradesByAnalyticsControls(SEED_TRADES, SEED_ACCOUNTS, {
      selectedAccountIds: [],
      period: 'All time',
      excludeSwingFromSession: true,
      drilldown: { type: 'session', value: 'London', label: 'Session: London' },
    });
    expect(bySessionExcl.map((t) => t.id)).toEqual(['tr-001', 'tr-003']);

    const byRBinNeg = filterTradesByAnalyticsControls(SEED_TRADES, SEED_ACCOUNTS, {
      selectedAccountIds: [],
      period: 'All time',
      excludeSwingFromSession: true,
      drilldown: { type: 'rbin', value: 'r-neg1-0', label: 'R-multiple -1R to 0R' },
    });
    expect(byRBinNeg.map((t) => t.id)).toEqual(['tr-003']);
  });
});

import { describe, it, expect } from 'vitest';
import { Trade } from '../../types/financial';

// Helper function duplicating the deterministic reporting calculations for pure unit testing
function calculateReportMetrics(trades: Partial<Trade>[]) {
  const closed = trades.filter((t) => t.status === 'CLOSED');
  const total = closed.length;

  if (total === 0) {
    return {
      total,
      winRate: 0,
      profitFactor: 0,
      netProfit: 0,
      grossProfit: 0,
      grossLoss: 0,
      avgR: 0,
      expectancy: 0,
      largestWin: 0,
      largestLoss: 0,
    };
  }

  const wins = closed.filter((t) => (t.netPnl || 0) > 0);
  const losses = closed.filter((t) => (t.netPnl || 0) < 0);

  const grossProfit = wins.reduce((sum, t) => sum + (t.netPnl || 0), 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + (t.netPnl || 0), 0));
  const netProfit = grossProfit - grossLoss;

  const winRate = (wins.length / total) * 100;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99.9 : 0;
  const avgR = closed.reduce((sum, t) => sum + (t.realizedR || 0), 0) / total;

  const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;

  const winRateDec = winRate / 100;
  const expectancy = winRateDec * avgWin - (1 - winRateDec) * avgLoss;

  const largestWin = wins.length > 0 ? Math.max(...wins.map((t) => t.netPnl || 0)) : 0;
  const largestLoss = losses.length > 0 ? Math.min(...losses.map((t) => t.netPnl || 0)) : 0;

  return {
    total,
    winRate,
    profitFactor,
    netProfit,
    grossProfit,
    grossLoss,
    avgR,
    expectancy,
    largestWin,
    largestLoss,
  };
}

function calculateConsistencyScore(trades: Partial<Trade>[]) {
  const dayProfits: Record<string, number> = {};
  trades.forEach((t) => {
    if ((t.netPnl || 0) > 0) {
      const d = (t.createdAt || '').split('T')[0];
      dayProfits[d] = (dayProfits[d] || 0) + (t.netPnl || 0);
    }
  });

  const total = Object.values(dayProfits).reduce((a, b) => a + b, 0);
  const maxDay = Object.values(dayProfits).length > 0 ? Math.max(...Object.values(dayProfits)) : 0;
  const maxDayPct = total > 0 ? (maxDay / total) * 100 : 0;

  return {
    maxDayPct,
    isCompliant: maxDayPct <= 35.0,
  };
}

describe('Institutional Performance Report Engine', () => {
  const sampleTrades: Partial<Trade>[] = [
    {
      id: 't1',
      status: 'CLOSED',
      netPnl: 2880,
      realizedR: 2.88,
      setupType: 'Asian Low Sweep + FVG',
      direction: 'BUY',
      createdAt: '2026-03-18T10:00:00Z',
    },
    {
      id: 't2',
      status: 'CLOSED',
      netPnl: 1235,
      realizedR: 2.47,
      setupType: '4H Orderblock Tap',
      direction: 'BUY',
      createdAt: '2026-03-18T14:00:00Z',
    },
    {
      id: 't3',
      status: 'CLOSED',
      netPnl: -1000,
      realizedR: -1.0,
      setupType: 'Discretionary',
      direction: 'SELL',
      createdAt: '2026-03-19T09:00:00Z',
    },
    {
      id: 't4',
      status: 'CLOSED',
      netPnl: 3270,
      realizedR: 2.97,
      setupType: '4H Orderblock Tap',
      direction: 'BUY',
      createdAt: '2026-03-19T15:00:00Z',
    },
  ];

  it('calculates correct executive tear sheet statistics', () => {
    const stats = calculateReportMetrics(sampleTrades);

    expect(stats.total).toBe(4);
    expect(stats.grossProfit).toBe(7385);
    expect(stats.grossLoss).toBe(1000);
    expect(stats.netProfit).toBe(6385);
    expect(stats.winRate).toBe(75); // 3 wins out of 4
    expect(stats.profitFactor).toBeCloseTo(7.385, 2);
    expect(stats.avgR).toBeCloseTo((2.88 + 2.47 - 1.0 + 2.97) / 4, 2);
    expect(stats.largestWin).toBe(3270);
    expect(stats.largestLoss).toBe(-1000);
    expect(stats.expectancy).toBeGreaterThan(0);
  });

  it('handles empty trades gracefully with zero metrics', () => {
    const stats = calculateReportMetrics([]);
    expect(stats.total).toBe(0);
    expect(stats.netProfit).toBe(0);
    expect(stats.winRate).toBe(0);
    expect(stats.profitFactor).toBe(0);
  });

  it('handles 100% win rate without infinite profit factor blowup', () => {
    const winsOnly: Partial<Trade>[] = [
      { id: 't1', status: 'CLOSED', netPnl: 1000, realizedR: 2.0 },
      { id: 't2', status: 'CLOSED', netPnl: 1500, realizedR: 3.0 },
    ];
    const stats = calculateReportMetrics(winsOnly);
    expect(stats.winRate).toBe(100);
    expect(stats.profitFactor).toBe(99.9);
    expect(stats.grossLoss).toBe(0);
  });

  it('evaluates prop-firm consistency rule accurately', () => {
    // Total profit: 7385. Max day is 2026-03-18 with 4115 profit (55.7% -> breaches 35% cap)
    const consistency1 = calculateConsistencyScore(sampleTrades);
    expect(consistency1.maxDayPct).toBeCloseTo((4115 / 7385) * 100, 1);
    expect(consistency1.isCompliant).toBe(false);

    // Balanced trading history across 4 distinct days
    const balancedTrades: Partial<Trade>[] = [
      { id: 'b1', netPnl: 1000, createdAt: '2026-03-10T10:00:00Z' },
      { id: 'b2', netPnl: 1000, createdAt: '2026-03-11T10:00:00Z' },
      { id: 'b3', netPnl: 1000, createdAt: '2026-03-12T10:00:00Z' },
      { id: 'b4', netPnl: 1000, createdAt: '2026-03-13T10:00:00Z' },
    ];
    const consistency2 = calculateConsistencyScore(balancedTrades);
    expect(consistency2.maxDayPct).toBe(25.0); // 1000 / 4000 = 25%
    expect(consistency2.isCompliant).toBe(true);
  });
});

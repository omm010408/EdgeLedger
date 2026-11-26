import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Trade } from '../../types/financial';

const upsertCalls: Array<{ table: string; payload: any }> = [];
const deleteCalls: Array<{ table: string; ids: string[] }> = [];
let allocUpsertError: { message: string } | null = null;
let existingAllocIds: string[] = [];
let mockSessionUserId: string | null = null;

vi.mock('../client', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: async () => ({
        data: {
          session: mockSessionUserId ? { user: { id: mockSessionUserId } } : null,
        },
      }),
    },
    from: (table: string) => ({
      upsert: async (payload: any) => {
        upsertCalls.push({ table, payload });
        if (table === 'trade_allocations' && allocUpsertError) {
          return { error: allocUpsertError };
        }
        return { error: null };
      },
      select: () => ({
        eq: async () => ({
          data: existingAllocIds.map((id) => ({ id })),
          error: null,
        }),
      }),
      delete: () => ({
        eq: async () => ({ error: null }),
        in: async (_col: string, ids: string[]) => {
          deleteCalls.push({ table, ids });
          return { error: null };
        },
      }),
    }),
  },
}));

import { SupabaseService, mapSupabaseToTrade } from '../service';

const baseTrade: Trade = {
  id: 'tr-sync-1',
  userId: 'user-default',
  instrumentSymbol: 'XAUUSD',
  strategyId: 'strat-london-sweep',
  strategyName: 'London Liquidity Sweep & Reversal',
  strategyVersion: 1,
  direction: 'BUY',
  status: 'CLOSED',
  environment: 'live',
  timeframe: '15M',
  session: 'Other' as unknown as Trade['session'],
  setupType: 'Sweep',
  entryPrice: 2300,
  stopLoss: 2290,
  takeProfit: 2320,
  plannedRiskUsd: 500,
  plannedRiskPct: 1,
  plannedRr: 2,
  realizedPnl: 1000,
  netPnl: 993,
  realizedR: 1.99,
  totalCommission: 7,
  totalSwap: 0,
  totalFees: 0,
  entryTime: '2026-11-26T08:00:00.000Z',
  exitTime: '2026-11-26T10:00:00.000Z',
  tradeThesis: 'Sweep of Asia low',
  technicalBias: 'Bullish',
  macroBias: 'Neutral',
  screenshots: [],
  tags: ['XAUUSD', 'London'],
  checklistAnswers: { biasConfirmed: true },
  isRuleCompliant: true,
  createdAt: '2026-11-26T08:00:00.000Z',
  updatedAt: '2026-11-26T10:00:00.000Z',
  allocations: [
    {
      id: 'alloc-1',
      tradeId: 'tr-sync-1',
      accountId: 'acc-apex-100k',
      allocatedPositionSize: 1.0,
      allocatedRiskUsd: 500,
      allocatedRiskPct: 1.0,
      entryPrice: 2300,
      stopLoss: 2290,
      takeProfit: 2320,
      exitPrice: 2320,
      realizedPnl: 1000,
      netPnl: 993,
      commission: 7,
      swap: 0,
      fees: 0,
      status: 'CLOSED',
      executions: [],
    },
  ],
};

describe('SupabaseService Trade Sync Integrity', () => {
  beforeEach(() => {
    upsertCalls.length = 0;
    deleteCalls.length = 0;
    allocUpsertError = null;
    existingAllocIds = [];
    mockSessionUserId = null;
  });

  it('normalizes legacy "user-default" userId to anonymous UUID, sanitizes invalid session, and cleans up removed allocations', async () => {
    existingAllocIds = ['alloc-1', 'alloc-removed-2'];
    const ok = await SupabaseService.saveTrade(baseTrade);

    expect(ok).toBe(true);
    const tradeUpsert = upsertCalls.find((c) => c.table === 'trades');
    expect(tradeUpsert?.payload.user_id).toBe('00000000-0000-0000-0000-000000000000');
    expect(tradeUpsert?.payload.session).toBe('London');
    expect(tradeUpsert?.payload.checklist_answers).toEqual({ biasConfirmed: true });

    expect(deleteCalls).toEqual([
      { table: 'trade_allocations', ids: ['alloc-removed-2'] },
    ]);
  });

  it('uses active Supabase authenticated user ID when signed in', async () => {
    mockSessionUserId = '11111111-2222-3333-4444-555555555555';
    await SupabaseService.saveTrade(baseTrade);

    const tradeUpsert = upsertCalls.find((c) => c.table === 'trades');
    expect(tradeUpsert?.payload.user_id).toBe('11111111-2222-3333-4444-555555555555');
  });

  it('returns false when trade_allocations upsert fails instead of silently succeeding with empty allocations', async () => {
    allocUpsertError = { message: 'violates row-level security policy' };
    const ok = await SupabaseService.saveTrade(baseTrade);
    expect(ok).toBe(false);
  });

  it('syncs strategies before trades in syncLocalToCloud to avoid strategy_id FK rejections', async () => {
    await SupabaseService.syncLocalToCloud([], [baseTrade], [
      {
        id: 'strat-london-sweep',
        name: 'London Sweep',
        description: '',
        marketType: 'Metals',
        primaryTimeframes: ['15M'],
        marketRegime: 'reversal',
        entryConditions: '',
        exitConditions: '',
        stopLossMethodology: '',
        targetMethodology: '',
        riskRules: '',
        checklistItems: [],
        currentVersion: 1,
        isActive: true,
        createdAt: '2026-11-26T00:00:00.000Z',
        updatedAt: '2026-11-26T00:00:00.000Z',
      },
    ]);

    const order = upsertCalls.map((c) => c.table);
    expect(order.indexOf('strategies')).toBeLessThan(order.indexOf('trades'));
  });

  it('round-trips extended fields via mapSupabaseToTrade', () => {
    const mapped = mapSupabaseToTrade({
      id: 'tr-1',
      instrument_symbol: 'BTCUSD',
      strategy_name: 'HTF Orderflow',
      technical_bias: 'Bullish',
      checklist_answers: { noFomo: true },
      entry_price: 60000,
      stop_loss: 59000,
      created_at: '2026-11-26T00:00:00.000Z',
    });
    expect(mapped.strategyName).toBe('HTF Orderflow');
    expect(mapped.technicalBias).toBe('Bullish');
    expect(mapped.checklistAnswers).toEqual({ noFomo: true });
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Trade } from '../../types/financial';

const upsertCalls: Array<{ table: string; payload: any; options?: any }> = [];
const deleteCalls: Array<{ table: string; ids: string[] }> = [];
let allocUpsertError: { message: string } | null = null;
let strategyOptionalColError = false;
let journalSchemaSnakeFallback = false;
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
      upsert: async (payload: any, options?: any) => {
        upsertCalls.push({ table, payload, options });
        if (table === 'trade_allocations' && allocUpsertError) {
          return { error: allocUpsertError };
        }
        if (
          table === 'strategies' &&
          strategyOptionalColError &&
          payload &&
          'stop_loss_methodology' in payload
        ) {
          return { error: { message: 'column "stop_loss_methodology" does not exist' } };
        }
        if (
          table === 'journal_entries' &&
          journalSchemaSnakeFallback &&
          payload &&
          'lessonslearned' in payload
        ) {
          return { error: { message: 'Could not find the "lessonslearned" column in schema cache' } };
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

import {
  SupabaseService,
  mapSupabaseToJournalEntry,
  mapSupabaseToStrategy,
  mapSupabaseToTrade,
} from '../service';

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
    strategyOptionalColError = false;
    journalSchemaSnakeFallback = false;
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

  it('syncs full Strategy playbook fields and falls back gracefully if optional columns are absent', async () => {
    strategyOptionalColError = true;
    const ok = await SupabaseService.saveStrategy({
      id: 'strat-1',
      name: 'London Sweep',
      description: 'Sweep Asia range',
      marketType: 'Metals',
      primaryTimeframes: ['15M', '1H'],
      marketRegime: 'Reversal' as any,
      entryConditions: 'MSS + FVG',
      exitConditions: '2.5R',
      stopLossMethodology: 'Below swing low',
      targetMethodology: 'Opposing liquidity',
      riskRules: 'Max 1% risk',
      checklistItems: ['Asia swept', '5M MSS'],
      currentVersion: 2,
      isActive: true,
      createdAt: '2026-11-26T00:00:00.000Z',
      updatedAt: '2026-11-27T00:00:00.000Z',
    });

    expect(ok).toBe(true);
    expect(upsertCalls.filter((c) => c.table === 'strategies')).toHaveLength(2);
    expect(upsertCalls[1].payload.market_regime).toBe('reversal');
    expect(upsertCalls[1].payload.current_version).toBe(2);

    const mapped = mapSupabaseToStrategy({
      id: 'strat-1',
      name: 'London Sweep',
      primary_timeframes: '{15M,1H}',
      checklist_items: '["Asia swept","5M MSS"]',
      market_regime: 'reversal',
      stop_loss_methodology: 'Below swing low',
      target_methodology: 'Opposing liquidity',
      risk_rules: 'Max 1% risk',
    });
    expect(mapped.primaryTimeframes).toEqual(['15M', '1H']);
    expect(mapped.checklistItems).toEqual(['Asia swept', '5M MSS']);
    expect(mapped.riskRules).toBe('Max 1% risk');
  });

  it('syncs full JournalEntry including behavioral pitfalls, scores, onConflict (user_id,entry_date), and lessons_learned fallback', async () => {
    journalSchemaSnakeFallback = true;
    const ok = await SupabaseService.saveJournalEntry({
      id: 'j-2026-11-27-1234',
      entryDate: '2026-11-27T09:00:00.000Z',
      marketConditions: 'Trending',
      macroEnvironment: 'Soft USD',
      higherTimeframeBias: 'Bullish',
      technicalBias: 'Sweep',
      tradingPlan: 'Wait for London',
      importantEconomicEvents: 'CPI',
      emotionalState: 'Disciplined',
      dailySummary: 'Executed plan',
      lessonsLearned: 'Patience paid off',
      disciplineScore: 11 as any,
      preparationScore: 9,
      executionScore: 8,
      fomoDetected: true,
      revengeTrading: false,
      overtrading: true,
      movedStopLoss: false,
      prematureExit: false,
      ignoredRules: true,
      isLocked: false,
      updatedAt: '2026-11-27T10:00:00.000Z',
    });

    expect(ok).toBe(true);
    const journalCall = upsertCalls.filter((c) => c.table === 'journal_entries').at(-1);
    expect(journalCall?.options).toEqual({ onConflict: 'user_id,entry_date' });
    expect(journalCall?.payload.entry_date).toBe('2026-11-27');
    expect(journalCall?.payload.discipline_score).toBe(10);
    expect(journalCall?.payload.lessons_learned).toBe('Patience paid off');
    expect(journalCall?.payload.fomo_detected).toBe(true);
    expect(journalCall?.payload.overtrading).toBe(true);
    expect(journalCall?.payload.ignored_rules).toBe(true);

    const mapped = mapSupabaseToJournalEntry({
      id: 'j-1',
      entry_date: '2026-11-27',
      lessons_learned: 'Wait for sweep',
      fomo_detected: true,
      ignored_rules: true,
      discipline_score: 9,
      preparation_score: 8,
      execution_score: 9,
    });
    expect(mapped.lessonsLearned).toBe('Wait for sweep');
    expect(mapped.fomoDetected).toBe(true);
    expect(mapped.ignoredRules).toBe(true);
  });
});

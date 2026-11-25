import { describe, it, expect, beforeEach } from 'vitest';
import {
  mergeAccount,
  mergeTrade,
  reconcileEntityLists,
  SyncTombstone,
} from '../syncEngine';
import { Trade, TradingAccount } from '../../types/financial';

function makeAccount(overrides: Partial<TradingAccount> = {}): TradingAccount {
  return {
    id: 'acc-1',
    userId: 'user-default',
    name: 'Apex Desk',
    brokerOrFirm: 'Apex Trader Funding',
    accountType: 'funded',
    currency: 'USD',
    accountSize: 100000,
    startingBalance: 100000,
    currentBalance: 100000,
    currentEquity: 100000,
    highWaterMark: 100000,
    challengePhase: 'Funded Live',
    status: 'active',
    rules: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 'tr-1',
    userId: 'user-default',
    instrumentSymbol: 'XAUUSD',
    direction: 'BUY',
    status: 'OPEN',
    timeframe: '15M',
    session: 'London',
    setupType: 'Breakout',
    entryPrice: 2700,
    stopLoss: 2690,
    plannedRiskUsd: 500,
    plannedRiskPct: 0.5,
    plannedRr: 2,
    realizedPnl: 0,
    netPnl: 0,
    realizedR: 0,
    totalCommission: 0,
    totalSwap: 0,
    totalFees: 0,
    entryTime: '2026-01-01T08:00:00.000Z',
    screenshots: [],
    tags: [],
    allocations: [],
    isRuleCompliant: true,
    createdAt: '2026-01-01T08:00:00.000Z',
    updatedAt: '2026-01-01T08:00:00.000Z',
    ...overrides,
  };
}

describe('Non-Overriding Sync Engine', () => {
  beforeEach(() => {
    // Keep tests pure and deterministic
  });

  it('preserves local-only records and pulls remote-only records without overwriting', () => {
    const localAcc = makeAccount({ id: 'acc-local', name: 'Offline Local Desk' });
    const remoteAcc = makeAccount({ id: 'acc-remote', name: 'Cloud Desk' });

    const res = reconcileEntityLists<TradingAccount>({
      local: [localAcc],
      remote: [remoteAcc],
      entityType: 'account',
      getId: (a) => a.id,
      getUpdatedAt: (a) => a.updatedAt,
      mergeItem: mergeAccount,
    });

    expect(res.merged.map((a) => a.id)).toEqual(['acc-local', 'acc-remote']);
    expect(res.toPushToCloud.map((a) => a.id)).toEqual(['acc-local']);
    expect(res.pulledCount).toBe(1);
    expect(res.toDeleteFromCloud).toEqual([]);
  });

  it('never overwrites newer local edits with older cloud data', () => {
    const newerLocal = makeAccount({
      id: 'acc-1',
      currentBalance: 102500,
      updatedAt: '2026-02-02T12:00:00.000Z',
    });
    const olderRemote = makeAccount({
      id: 'acc-1',
      currentBalance: 100000,
      updatedAt: '2026-02-01T12:00:00.000Z',
    });

    const res = reconcileEntityLists<TradingAccount>({
      local: [newerLocal],
      remote: [olderRemote],
      entityType: 'account',
      getId: (a) => a.id,
      getUpdatedAt: (a) => a.updatedAt,
      mergeItem: mergeAccount,
    });

    expect(res.merged).toHaveLength(1);
    expect(res.merged[0].currentBalance).toBe(102500);
    expect(res.toPushToCloud).toHaveLength(1);
    expect(res.conflictResolutions).toBe(1);
  });

  it('pulls newer remote edits when remote timestamp is strictly newer', () => {
    const olderLocal = makeAccount({
      id: 'acc-1',
      currentBalance: 100000,
      updatedAt: '2026-02-01T12:00:00.000Z',
    });
    const newerRemote = makeAccount({
      id: 'acc-1',
      currentBalance: 104200,
      updatedAt: '2026-02-03T12:00:00.000Z',
    });

    const res = reconcileEntityLists<TradingAccount>({
      local: [olderLocal],
      remote: [newerRemote],
      entityType: 'account',
      getId: (a) => a.id,
      getUpdatedAt: (a) => a.updatedAt,
      mergeItem: mergeAccount,
    });

    expect(res.merged[0].currentBalance).toBe(104200);
    expect(res.pulledCount).toBe(1);
    expect(res.toPushToCloud).toHaveLength(0);
  });

  it('prevents deleted records from resurrecting via delete tombstones', () => {
    const remoteOld = makeTrade({
      id: 'tr-deleted',
      updatedAt: '2026-02-01T10:00:00.000Z',
    });
    const tombstones: SyncTombstone[] = [
      {
        id: 'tr-deleted',
        entityType: 'trade',
        deletedAt: '2026-02-02T10:00:00.000Z',
      },
    ];

    const res = reconcileEntityLists<Trade>({
      local: [],
      remote: [remoteOld],
      tombstones,
      entityType: 'trade',
      getId: (t) => t.id,
      getUpdatedAt: (t) => t.updatedAt,
      mergeItem: mergeTrade,
    });

    expect(res.merged).toHaveLength(0);
    expect(res.toDeleteFromCloud).toEqual(['tr-deleted']);
  });

  it('merges nested trade executions and allocations without dropping offline fills', () => {
    const localTrade = makeTrade({
      id: 'tr-nested',
      updatedAt: '2026-02-01T10:00:00.000Z',
      tags: ['LocalTag'],
      allocations: [
        {
          id: 'alloc-1',
          tradeId: 'tr-nested',
          accountId: 'acc-1',
          allocatedPositionSize: 0.5,
          allocatedRiskUsd: 500,
          allocatedRiskPct: 0.5,
          entryPrice: 2700,
          stopLoss: 2690,
          realizedPnl: 600,
          netPnl: 590,
          commission: 10,
          swap: 0,
          fees: 0,
          status: 'PARTIALLY_CLOSED',
          executions: [
            {
              id: 'exec-partial-local',
              tradeId: 'tr-nested',
              allocationId: 'alloc-1',
              accountId: 'acc-1',
              executionType: 'PARTIAL_CLOSE',
              price: 2712,
              size: 0.5,
              commission: 5,
              swap: 0,
              realizedPnl: 590,
              executionTime: '2026-02-01T09:30:00.000Z',
            },
          ],
        },
      ],
    });

    const remoteTrade = makeTrade({
      id: 'tr-nested',
      updatedAt: '2026-02-01T11:00:00.000Z',
      tags: ['CloudTag'],
      allocations: [
        {
          id: 'alloc-1',
          tradeId: 'tr-nested',
          accountId: 'acc-1',
          allocatedPositionSize: 1.0,
          allocatedRiskUsd: 500,
          allocatedRiskPct: 0.5,
          entryPrice: 2700,
          stopLoss: 2690,
          realizedPnl: 0,
          netPnl: 0,
          commission: 5,
          swap: 0,
          fees: 0,
          status: 'OPEN',
          executions: [
            {
              id: 'exec-entry-remote',
              tradeId: 'tr-nested',
              allocationId: 'alloc-1',
              accountId: 'acc-1',
              executionType: 'ENTRY',
              price: 2700,
              size: 1.0,
              commission: 5,
              swap: 0,
              realizedPnl: 0,
              executionTime: '2026-02-01T08:00:00.000Z',
            },
          ],
        },
      ],
    });

    const res = reconcileEntityLists<Trade>({
      local: [localTrade],
      remote: [remoteTrade],
      entityType: 'trade',
      getId: (t) => t.id,
      getUpdatedAt: (t) => t.updatedAt,
      mergeItem: mergeTrade,
    });

    expect(res.merged).toHaveLength(1);
    expect(res.merged[0].tags).toEqual(['LocalTag', 'CloudTag']);
    expect(res.merged[0].allocations[0].executions.map((e) => e.id)).toEqual([
      'exec-entry-remote',
      'exec-partial-local',
    ]);
    // Because localTrade had an execution missing in remote, sync marks it to push back
    expect(res.toPushToCloud).toHaveLength(1);
  });
});

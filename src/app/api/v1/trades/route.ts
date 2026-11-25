import { NextRequest, NextResponse } from 'next/server';
import { SupabaseService } from '@/lib/supabase/service';
import { problemResponse } from '@/lib/api/problemDetails';
import { Trade } from '@/lib/types/financial';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const accountId = searchParams.get('accountId');

  const trades = await SupabaseService.fetchTrades();
  if (trades === null) {
    // If Supabase is not configured, return informative response
    return NextResponse.json({
      trades: [],
      source: 'local_storage',
      message: 'Supabase cloud not connected; trades are stored client-side in localStorage.',
    });
  }

  let filtered = trades;
  if (status) {
    filtered = filtered.filter((t) => t.status === status.toUpperCase());
  }
  if (accountId) {
    filtered = filtered.filter((t) => t.allocations.some((a) => a.accountId === accountId));
  }

  return NextResponse.json({
    trades: filtered,
    total: filtered.length,
    source: 'supabase_cloud',
  });
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return problemResponse(
      400,
      'Invalid JSON Payload',
      'The request body could not be parsed as valid JSON.'
    );
  }

  const {
    instrumentSymbol,
    direction,
    entryPrice,
    stopLoss,
    takeProfit,
    plannedRiskUsd = 500,
    plannedRiskPct = 1.0,
    plannedRr = 2.0,
    accountId,
    setupType = 'Discretionary',
    timeframe = '15M',
    session = 'London',
    tradeThesis = '',
  } = body;

  if (!instrumentSymbol || !direction || !entryPrice || !stopLoss) {
    return problemResponse(
      422,
      'Validation Error',
      'Missing required trade parameters (instrumentSymbol, direction, entryPrice, stopLoss).',
      [
        !instrumentSymbol && { name: 'instrumentSymbol', reason: 'instrumentSymbol is required.' },
        !direction && { name: 'direction', reason: 'direction (BUY/SELL) is required.' },
        !entryPrice && { name: 'entryPrice', reason: 'entryPrice is required.' },
        !stopLoss && { name: 'stopLoss', reason: 'stopLoss is required.' },
      ].filter(Boolean) as any
    );
  }

  const tradeId = `tr-${Date.now()}`;
  const now = new Date().toISOString();

  const newTrade: Trade = {
    id: tradeId,
    userId: 'user-default',
    instrumentSymbol: instrumentSymbol.toUpperCase(),
    direction: direction.toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
    status: 'OPEN',
    environment: 'live',
    timeframe,
    session,
    setupType,
    entryPrice: Number(entryPrice),
    stopLoss: Number(stopLoss),
    takeProfit: takeProfit ? Number(takeProfit) : undefined,
    plannedRiskUsd: Number(plannedRiskUsd),
    plannedRiskPct: Number(plannedRiskPct),
    plannedRr: Number(plannedRr),
    realizedPnl: 0,
    netPnl: 0,
    realizedR: 0,
    totalCommission: 7.0,
    totalSwap: 0,
    totalFees: 0,
    entryTime: now,
    tradeThesis,
    screenshots: [],
    tags: [],
    isRuleCompliant: true,
    createdAt: now,
    updatedAt: now,
    allocations: accountId
      ? [
          {
            id: `alloc-${tradeId}`,
            tradeId,
            accountId,
            allocatedPositionSize: 1.0,
            allocatedRiskUsd: Number(plannedRiskUsd),
            allocatedRiskPct: Number(plannedRiskPct),
            entryPrice: Number(entryPrice),
            stopLoss: Number(stopLoss),
            takeProfit: takeProfit ? Number(takeProfit) : undefined,
            realizedPnl: 0,
            netPnl: 0,
            commission: 7.0,
            swap: 0,
            fees: 0,
            status: 'OPEN',
            executions: [],
          },
        ]
      : [],
  };

  const saved = await SupabaseService.saveTrade(newTrade);

  return NextResponse.json(
    {
      trade: newTrade,
      persistedToCloud: saved,
    },
    { status: 201 }
  );
}

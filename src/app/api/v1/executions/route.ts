import { NextRequest, NextResponse } from 'next/server';
import { AccountRepository } from '@/lib/data/accountRepository';
import { problemResponse } from '@/lib/api/problemDetails';

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
    account_id,
    price,
    size,
    realized_pnl = 0,
    execution_time,
  } = body;

  if (!account_id) {
    return problemResponse(
      422,
      'Validation Error',
      'One or more required fields are missing.',
      [{ name: 'account_id', reason: 'account_id is required.' }]
    );
  }

  if (price === undefined || size === undefined) {
    return problemResponse(
      422,
      'Validation Error',
      'One or more required execution fields are missing.',
      [
        { name: 'price', reason: 'Execution price is required.' },
        { name: 'size', reason: 'Execution position size is required.' },
      ]
    );
  }

  const result = AccountRepository.recordExecution(account_id, {
    price: Number(price),
    size: Number(size),
    realizedPnl: Number(realized_pnl),
    executionTime: execution_time,
  });

  if (!result.allowed) {
    if (result.status === 423 && result.problemDetails) {
      return new NextResponse(JSON.stringify(result.problemDetails), {
        status: 423,
        headers: { 'Content-Type': 'application/problem+json' },
      });
    }
    return problemResponse(
      result.status,
      'Execution Write Blocked',
      result.error || 'Execution was rejected by the gate engine.'
    );
  }

  return NextResponse.json(
    {
      executionId: result.executionId,
      gateState: result.gateState,
    },
    { status: 201 }
  );
}

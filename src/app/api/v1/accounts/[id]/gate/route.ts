import { NextRequest, NextResponse } from 'next/server';
import { AccountRepository } from '@/lib/data/accountRepository';
import { problemResponse } from '@/lib/api/problemDetails';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const gateState = AccountRepository.getGateState(id);
  if (!gateState) {
    return problemResponse(
      404,
      'Gate State Not Found',
      `Trading account with id "${id}" does not exist or has no active ruleset.`
    );
  }

  return NextResponse.json(gateState, {
    headers: {
      'Cache-Control': 'max-age=5, public',
    },
  });
}

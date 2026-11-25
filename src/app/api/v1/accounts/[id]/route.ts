import { NextRequest, NextResponse } from 'next/server';
import { AccountRepository } from '@/lib/data/accountRepository';
import { problemResponse } from '@/lib/api/problemDetails';
import { SupabaseService } from '@/lib/supabase/service';
import { isSupabaseConfigured } from '@/lib/supabase/client';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const account = AccountRepository.getAccount(id);
  if (!account) {
    return problemResponse(
      404,
      'Account Not Found',
      `Trading account with id "${id}" does not exist.`
    );
  }

  const ruleSet = AccountRepository.getActiveRuleSet(id);
  const gateState = AccountRepository.getGateState(id);

  return NextResponse.json({
    account,
    ruleSet,
    gateState,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ifMatchHeader = req.headers.get('If-Match');
  if (!ifMatchHeader) {
    return problemResponse(
      428,
      'Precondition Required',
      'The "If-Match" header is required for optimistic locking (must contain expected version number).'
    );
  }

  const expectedVersion = parseInt(ifMatchHeader.replace(/["']/g, ''), 10);
  if (isNaN(expectedVersion)) {
    return problemResponse(
      400,
      'Invalid If-Match Header',
      'The "If-Match" header must contain a valid integer version number.'
    );
  }

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

  // Reject changes to starting_balance
  if (body.starting_balance !== undefined || body.startingBalance !== undefined) {
    return problemResponse(
      409,
      'Conflict: Starting Balance Immutable',
      'Starting balance cannot be altered on an existing account with recorded history.'
    );
  }

  const updates: any = {};
  if (body.label !== undefined) updates.label = String(body.label).trim();
  if (body.phase !== undefined) updates.phase = body.phase !== null ? Number(body.phase) : null;
  if (body.phase_status !== undefined) updates.phaseStatus = body.phase_status;
  if (body.notes !== undefined) updates.notes = String(body.notes);

  const result = AccountRepository.updateAccount(id, expectedVersion, updates);

  if (!result.success) {
    return problemResponse(
      result.status || 400,
      result.status === 412 ? 'Precondition Failed' : 'Update Failed',
      result.error || 'Failed to update account.'
    );
  }

  const gateState = AccountRepository.getGateState(id, true);

  return NextResponse.json({
    account: result.account,
    gateState,
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const deletedLocal = AccountRepository.deleteAccount(id);
  const deletedFromCloud = isSupabaseConfigured ? await SupabaseService.deleteAccount(id) : false;

  if (!deletedLocal && !deletedFromCloud) {
    return problemResponse(
      404,
      'Account Not Found',
      `Trading account with id "${id}" does not exist.`
    );
  }

  return NextResponse.json({
    success: true,
    deletedId: id,
    deletedFromCloud,
  });
}

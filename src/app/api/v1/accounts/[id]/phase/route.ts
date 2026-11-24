import { NextRequest, NextResponse } from 'next/server';
import { AccountRepository } from '@/lib/data/accountRepository';
import { problemResponse } from '@/lib/api/problemDetails';

export async function POST(
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

  const { phase, phase_status, reason = 'Phase status transition' } = body;

  const validStatuses = ['active', 'passed', 'failed', 'paused'];
  if (phase_status && !validStatuses.includes(phase_status)) {
    return problemResponse(
      422,
      'Validation Error',
      'Invalid phase_status provided.',
      [{ name: 'phase_status', reason: `Must be one of: ${validStatuses.join(', ')}` }]
    );
  }

  const updates: any = {};
  if (phase !== undefined) updates.phase = phase !== null ? Number(phase) : null;
  if (phase_status !== undefined) updates.phaseStatus = phase_status;

  const updateResult = AccountRepository.updateAccount(
    id,
    account.version,
    updates,
    'trader'
  );

  if (!updateResult.success) {
    return problemResponse(
      updateResult.status || 400,
      'Phase Update Failed',
      updateResult.error || 'Failed to update phase status.'
    );
  }

  AccountRepository.recordAuditEvent({
    accountId: id,
    actor: 'trader',
    eventType: 'account.phase_advanced',
    beforeState: { phase: account.phase, phaseStatus: account.phaseStatus },
    afterState: { phase: updateResult.account?.phase, phaseStatus: updateResult.account?.phaseStatus },
    reason,
  });

  const gateState = AccountRepository.getGateState(id, true);

  return NextResponse.json({
    account: updateResult.account,
    gateState,
  });
}

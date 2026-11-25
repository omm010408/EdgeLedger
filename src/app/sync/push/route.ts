import { NextRequest, NextResponse } from 'next/server';
import {
  requireAuthenticatedClaims,
  serverPushItems,
  SyncPushItemRequest,
} from '@/lib/auth/serverAuth';

export async function POST(req: NextRequest) {
  const claims = requireAuthenticatedClaims(req);
  if (!claims) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.items)) {
    return NextResponse.json(
      { error: 'Expected JSON body with { items: [...] }.' },
      { status: 400 }
    );
  }

  const items = body.items as SyncPushItemRequest[];
  const result = serverPushItems(claims.sub, items);
  return NextResponse.json(result, { status: 200 });
}

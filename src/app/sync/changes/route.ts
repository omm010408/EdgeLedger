import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedClaims, serverPullChanges } from '@/lib/auth/serverAuth';

export async function GET(req: NextRequest) {
  const claims = requireAuthenticatedClaims(req);
  if (!claims) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cursor = req.nextUrl.searchParams.get('cursor');
  const result = serverPullChanges(claims.sub, cursor);
  return NextResponse.json(result, { status: 200 });
}

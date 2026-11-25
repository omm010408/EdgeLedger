import { NextRequest, NextResponse } from 'next/server';
import {
  clearSessionCookies,
  REFRESH_COOKIE_NAME,
  revokeRefreshToken,
} from '@/lib/auth/serverAuth';

export async function POST(req: NextRequest) {
  const refreshCookie = req.cookies.get(REFRESH_COOKIE_NAME)?.value;
  revokeRefreshToken(refreshCookie);

  const res = NextResponse.json({ signedOut: true }, { status: 200 });
  return clearSessionCookies(res, req);
}

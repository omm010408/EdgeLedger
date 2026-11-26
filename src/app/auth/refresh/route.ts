import { NextRequest, NextResponse } from 'next/server';
import {
  ACCESS_TTL_SECONDS,
  attachSessionCookies,
  clearSessionCookies,
  issueSessionTokens,
  REFRESH_COOKIE_NAME,
  revokeRefreshToken,
  verifySessionToken,
} from '@/lib/auth/serverAuth';

export async function POST(req: NextRequest) {
  const refreshCookie = req.cookies.get(REFRESH_COOKIE_NAME)?.value;
  const claims = verifySessionToken(refreshCookie, 'refresh');

  if (!claims) {
    const res = NextResponse.json({ error: 'Refresh token missing or expired.' }, { status: 401 });
    return clearSessionCookies(res, req);
  }

  // Rotate refresh token on use
  revokeRefreshToken(refreshCookie);
  const issued = issueSessionTokens(claims.sub, claims.email, claims.deviceId);
  const res = NextResponse.json(
    {
      session: issued.session,
      tokenType: 'Bearer',
      expiresInSeconds: ACCESS_TTL_SECONDS,
    },
    { status: 200 }
  );
  return attachSessionCookies(res, issued.accessToken, issued.refreshToken, req);
}

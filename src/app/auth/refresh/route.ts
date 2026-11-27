import { NextRequest, NextResponse } from 'next/server';
import {
  ACCESS_TTL_SECONDS,
  attachSessionCookies,
  clearSessionCookies,
  extractBrowserSessionHeader,
  issueSessionTokens,
  REFRESH_COOKIE_NAME,
  revokeRefreshToken,
  verifyBrowserSessionBinding,
  verifySessionToken,
} from '@/lib/auth/serverAuth';

export async function POST(req: NextRequest) {
  const refreshCookie = req.cookies.get(REFRESH_COOKIE_NAME)?.value;
  const rawClaims = verifySessionToken(refreshCookie, 'refresh');
  const claims = verifyBrowserSessionBinding(rawClaims, req);

  if (!claims) {
    if (rawClaims) {
      revokeRefreshToken(refreshCookie);
    }
    const headerSid = extractBrowserSessionHeader(req);
    const errorMsg =
      rawClaims?.sid && headerSid && headerSid !== rawClaims.sid
        ? 'Token is valid only in its original browser session.'
        : 'Refresh token missing or expired.';
    const res = NextResponse.json({ error: errorMsg }, { status: 401 });
    return clearSessionCookies(res, req);
  }

  // Rotate refresh token on use, keeping binding to the same browser session
  revokeRefreshToken(refreshCookie);
  const issued = issueSessionTokens(claims.sub, claims.email, claims.deviceId, claims.sid);
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

import { NextRequest, NextResponse } from 'next/server';
import {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  verifySessionToken,
} from '@/lib/auth/serverAuth';

export async function GET(req: NextRequest) {
  const accessCookie = req.cookies.get(ACCESS_COOKIE_NAME)?.value;
  const accessClaims = verifySessionToken(accessCookie, 'access');

  if (!accessClaims) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const refreshCookie = req.cookies.get(REFRESH_COOKIE_NAME)?.value;
  const refreshClaims = verifySessionToken(refreshCookie, 'refresh');

  return NextResponse.json(
    {
      authenticated: true,
      session: {
        userId: accessClaims.sub,
        email: accessClaims.email,
        deviceId: accessClaims.deviceId,
        accessExpiresAt: new Date(accessClaims.exp).toISOString(),
        refreshExpiresAt: new Date(refreshClaims?.exp ?? accessClaims.exp).toISOString(),
        state: 'signedIn',
      },
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}

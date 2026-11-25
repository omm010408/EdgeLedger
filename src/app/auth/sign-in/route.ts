import { NextRequest, NextResponse } from 'next/server';
import {
  attachSessionCookies,
  authenticateUserCredentials,
  issueSessionTokens,
} from '@/lib/auth/serverAuth';
import { safeLog } from '@/lib/auth/redact';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email, password, method = 'password', credentialId, deviceId } = body;

    const auth = authenticateUserCredentials({
      email,
      password,
      method,
      credentialId,
    });

    if (!auth.ok || !auth.userId || !auth.email) {
      return NextResponse.json(
        { error: auth.error || 'Invalid credentials.' },
        { status: 401 }
      );
    }

    const issued = issueSessionTokens(auth.userId, auth.email, deviceId);
    const res = NextResponse.json({ session: issued.session }, { status: 200 });
    return attachSessionCookies(res, issued.accessToken, issued.refreshToken, req);
  } catch (err) {
    safeLog('error', 'POST /auth/sign-in unexpected error', { error: err });
    return NextResponse.json({ error: 'Authentication service error.' }, { status: 500 });
  }
}

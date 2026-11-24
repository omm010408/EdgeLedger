import { NextResponse } from 'next/server';

export interface InvalidParam {
  name: string;
  reason: string;
}

export function problemResponse(
  status: number,
  title: string,
  detail: string,
  invalidParams?: InvalidParam[],
  extra?: Record<string, unknown>
): NextResponse {
  const typeSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const body = {
    type: `https://edgeledger.com/errors/${typeSlug}`,
    title,
    status,
    detail,
    ...(invalidParams && invalidParams.length > 0 ? { invalid_params: invalidParams } : {}),
    ...(extra || {}),
  };

  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/problem+json',
    },
  });
}

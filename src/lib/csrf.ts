/**
 * CSRF protection via Origin / Referer header validation.
 *
 * All state-changing requests (POST, PUT, PATCH, DELETE) must originate
 * from the same origin as the application (NEXTAUTH_URL).
 * Requests from curl/Postman in development are allowed by omitting the header.
 *
 * Usage — in route handlers that do NOT go through apiHandler:
 *   const csrfError = validateCsrf(request);
 *   if (csrfError) return csrfError;
 *
 * apiHandler() calls this automatically for all wrapped routes.
 */

import { NextResponse } from 'next/server';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function validateCsrf(request: Request): NextResponse | null {
  if (SAFE_METHODS.has(request.method)) return null;

  const appUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  let appOrigin: string;
  try {
    appOrigin = new URL(appUrl).origin;
  } catch {
    // Misconfigured NEXTAUTH_URL — fail open in dev, closed in prod
    if (process.env.NODE_ENV !== 'production') return null;
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
  }

  const origin = request.headers.get('origin');
  if (origin) {
    if (origin === appOrigin) return null;
    return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
  }

  const referer = request.headers.get('referer');
  if (referer) {
    try {
      if (new URL(referer).origin === appOrigin) return null;
    } catch {
      // Malformed referer — treat as failed
    }
    return NextResponse.json({ error: 'CSRF validation failed' }, { status: 403 });
  }

  // No Origin or Referer header at all
  if (process.env.NODE_ENV !== 'production') {
    // Allow tools (curl, Postman) during development
    return null;
  }

  return NextResponse.json(
    { error: 'CSRF validation failed — Origin header required' },
    { status: 403 },
  );
}

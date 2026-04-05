/**
 * Client IP resolution for rate-limiting.
 *
 * Uses `@vercel/functions`'s `ipAddress()` which reads the trusted
 * `x-real-ip` / `x-vercel-forwarded-for` headers set by Vercel's edge.
 * These headers are stripped from inbound requests and re-set by the
 * platform, so they cannot be spoofed by clients.
 *
 * When running outside Vercel (local dev), `ipAddress()` returns
 * undefined and we fall back to a fixed key so rate limits still apply.
 */

import { ipAddress } from '@vercel/functions';

export function getClientIp(request: Request): string {
  return ipAddress(request) ?? 'unknown';
}

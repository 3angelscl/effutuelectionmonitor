import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import { createRateLimiter } from '@/lib/rate-limit';
import { encrypt, decrypt } from '@/lib/crypto';
import { logger } from '@/lib/logger';

// 5 verification attempts per 5 minutes per email/user — prevents brute-force of 6-digit TOTP
const twoFaLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 5 });

/**
 * Exponential TOTP backoff schedule.
 * Attempts are cumulative (never reset to 0 after a lock expiry, so escalation persists).
 *
 *   attempts 1–2  → no lock
 *   attempts 3–5  → lock  1 min
 *   attempts 6–8  → lock  5 min
 *   attempts 9–11 → lock 15 min
 *   attempts 12+  → lock  1 hour
 */
function totpLockDurationMs(totalAttempts: number): number {
  if (totalAttempts < 3)  return 0;
  if (totalAttempts < 6)  return 1  * 60 * 1000;
  if (totalAttempts < 9)  return 5  * 60 * 1000;
  if (totalAttempts < 12) return 15 * 60 * 1000;
  return 60 * 60 * 1000;
}

function lockedUntilDate(totalAttempts: number): Date | null {
  const ms = totpLockDurationMs(totalAttempts);
  return ms > 0 ? new Date(Date.now() + ms) : null;
}

// GET - Generate 2FA secret and QR code
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.twoFactorEnabled) {
      return NextResponse.json({ enabled: true });
    }

    // Reuse an existing pending secret so that refreshing the page does not
    // invalidate a QR code the user has already scanned but not yet verified.
    // Decrypt the stored secret (may be plaintext for legacy rows).
    const existingSecret = user.twoFactorSecret ? decrypt(user.twoFactorSecret) : null;
    const secret = existingSecret ?? generateSecret();

    if (!existingSecret) {
      await prisma.user.update({
        where: { id: userId },
        data: { twoFactorSecret: encrypt(secret) },
      });
    }

    const otpAuthUrl = generateURI({ label: user.email, issuer: 'Effutu Election Monitor', secret });
    const qrCode = await QRCode.toDataURL(otpAuthUrl);

    return NextResponse.json({ secret, qrCode, enabled: false });
  } catch (error) {
    logger.error('2FA setup error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to setup 2FA' }, { status: 500 });
  }
}

// POST - Verify and enable/disable 2FA, or verify during login
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, code, email } = body;

    if (action === 'verify-login') {
      if (!email || !code) {
        return NextResponse.json({ error: 'Email and code required' }, { status: 400 });
      }

      // Rate limit by email to prevent brute-force
      const { success: rateLimitOk } = await twoFaLimiter.check(email.toLowerCase());
      if (!rateLimitOk) {
        return NextResponse.json(
          { error: 'Too many verification attempts. Try again in 5 minutes.' },
          { status: 429 },
        );
      }

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.twoFactorSecret) {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
      }

      // Hard lockout check
      if (user.totpLockUntil && user.totpLockUntil > new Date()) {
        const secondsLeft = Math.ceil((user.totpLockUntil.getTime() - Date.now()) / 1000);
        return NextResponse.json(
          { error: `2FA locked due to too many failed attempts. Try again in ${secondsLeft}s.` },
          { status: 429 },
        );
      }

      const secret = decrypt(user.twoFactorSecret);
      const result = verifySync({ token: code, secret });

      if (!result.valid) {
        const newAttempts = user.totpAttempts + 1;
        const lockUntil = lockedUntilDate(newAttempts);
        await prisma.user.update({
          where: { id: user.id },
          data: { totpAttempts: newAttempts, totpLockUntil: lockUntil },
        });
        return NextResponse.json({ error: 'Invalid 2FA code' }, { status: 400 });
      }

      // Success: reset attempts
      await prisma.user.update({
        where: { id: user.id },
        data: { totpAttempts: 0, totpLockUntil: null },
      });

      return NextResponse.json({ valid: true });
    }

    // All other actions require a session
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.twoFactorSecret) {
      return NextResponse.json({ error: 'Setup 2FA first' }, { status: 400 });
    }

    // Hard lockout check (shared for enable/disable actions)
    if (user.totpLockUntil && user.totpLockUntil > new Date()) {
      const secondsLeft = Math.ceil((user.totpLockUntil.getTime() - Date.now()) / 1000);
      return NextResponse.json(
        { error: `Too many failed attempts. Try again in ${secondsLeft}s.` },
        { status: 429 },
      );
    }

    if (action === 'enable') {
      const { success: rateLimitOk } = await twoFaLimiter.check(`setup:${userId}`);
      if (!rateLimitOk) {
        return NextResponse.json({ error: 'Too many attempts. Try again in 5 minutes.' }, { status: 429 });
      }

      const secret = decrypt(user.twoFactorSecret);
      const result = verifySync({ token: code, secret });

      if (!result.valid) {
        const newAttempts = user.totpAttempts + 1;
        const lockUntil = lockedUntilDate(newAttempts);
        await prisma.user.update({
          where: { id: userId },
          data: { totpAttempts: newAttempts, totpLockUntil: lockUntil },
        });
        return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 });
      }

      await prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: true, totpAttempts: 0, totpLockUntil: null },
      });

      return NextResponse.json({ enabled: true });
    }

    if (action === 'disable') {
      const { success: rateLimitOk } = await twoFaLimiter.check(`disable:${userId}`);
      if (!rateLimitOk) {
        return NextResponse.json({ error: 'Too many attempts. Try again in 5 minutes.' }, { status: 429 });
      }

      const secret = decrypt(user.twoFactorSecret);
      const result = verifySync({ token: code, secret });

      if (!result.valid) {
        const newAttempts = user.totpAttempts + 1;
        const lockUntil = lockedUntilDate(newAttempts);
        await prisma.user.update({
          where: { id: userId },
          data: { totpAttempts: newAttempts, totpLockUntil: lockUntil },
        });
        return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 });
      }

      await prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: false, twoFactorSecret: null, totpAttempts: 0, totpLockUntil: null },
      });

      return NextResponse.json({ enabled: false });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    logger.error('2FA verify error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to verify 2FA' }, { status: 500 });
  }
}

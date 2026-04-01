import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { generateSecret, generateURI, verifySync } from 'otplib';
import QRCode from 'qrcode';
import { createRateLimiter } from '@/lib/rate-limit';

// 5 verification attempts per 5 minutes per email/user — prevents brute-force of 6-digit TOTP
const twoFaLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 5 });

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
    const secret = user.twoFactorSecret ?? generateSecret();

    if (!user.twoFactorSecret) {
      await prisma.user.update({
        where: { id: userId },
        data: { twoFactorSecret: secret },
      });
    }

    const otpAuthUrl = generateURI({ label: user.email, issuer: 'Effutu Election Monitor', secret });
    const qrCode = await QRCode.toDataURL(otpAuthUrl);

    return NextResponse.json({ secret, qrCode, enabled: false });
  } catch (error) {
    console.error('2FA setup error:', error);
    return NextResponse.json({ error: 'Failed to setup 2FA' }, { status: 500 });
  }
}

// POST - Verify and enable 2FA, or verify during login
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

      const result = verifySync({ token: code, secret: user.twoFactorSecret });
      if (!result.valid) {
        return NextResponse.json({ error: 'Invalid 2FA code' }, { status: 400 });
      }

      return NextResponse.json({ valid: true });
    }

    // Enable 2FA (requires session)
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.twoFactorSecret) {
      return NextResponse.json({ error: 'Setup 2FA first' }, { status: 400 });
    }

    if (action === 'enable') {
      // Rate limit by userId
      const { success: rateLimitOk } = await twoFaLimiter.check(`setup:${userId}`);
      if (!rateLimitOk) {
        return NextResponse.json({ error: 'Too many attempts. Try again in 5 minutes.' }, { status: 429 });
      }

      const result = verifySync({ token: code, secret: user.twoFactorSecret });
      if (!result.valid) {
        return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 });
      }

      await prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: true },
      });

      return NextResponse.json({ enabled: true });
    }

    if (action === 'disable') {
      const result = verifySync({ token: code, secret: user.twoFactorSecret });
      if (!result.valid) {
        return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 });
      }

      await prisma.user.update({
        where: { id: userId },
        data: { twoFactorEnabled: false, twoFactorSecret: null },
      });

      return NextResponse.json({ enabled: false });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('2FA verify error:', error);
    return NextResponse.json({ error: 'Failed to verify 2FA' }, { status: 500 });
  }
}

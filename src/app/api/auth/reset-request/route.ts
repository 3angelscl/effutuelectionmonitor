import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import crypto from 'crypto';
import { createRateLimiter } from '@/lib/rate-limit';

// 5 reset requests per 15 minutes per IP
const resetRequestLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });

export async function POST(request: NextRequest) {
  try {
    // Rate limit by IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { success } = resetRequestLimiter.check(ip);
    if (!success) {
      return NextResponse.json(
        { error: 'Too many reset requests. Please try again later.' },
        { status: 429 },
      );
    }

    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Always return success to prevent email enumeration
    if (!user) {
      return NextResponse.json({ success: true, message: 'If the email exists, a reset link has been generated.' });
    }

    // Invalidate existing tokens
    await prisma.passwordReset.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true },
    });

    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordReset.create({
      data: { userId: user.id, token, expiresAt },
    });

    // In production, send email here. For now, log the reset link.
    const resetUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
    console.log(`[Password Reset] Reset link for ${email}: ${resetUrl}`);

    return NextResponse.json({
      success: true,
      message: 'If the email exists, a reset link has been generated.',
      // Include token in dev mode for testing
      ...(process.env.NODE_ENV !== 'production' && { resetToken: token, resetUrl }),
    });
  } catch (error) {
    console.error('Reset request error:', error);
    return NextResponse.json({ error: 'Failed to process reset request' }, { status: 500 });
  }
}

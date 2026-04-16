import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { createRateLimiter } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { resetPasswordSchema, parseData, ValidationError } from '@/lib/validations';
import { getClientIp } from '@/lib/client-ip';

// 10 reset attempts per 15 minutes per IP (prevents brute-force token guessing)
const resetLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 10 });

export async function POST(request: NextRequest) {
  try {
    // Rate limit by the Vercel-verified client IP — these headers are set
    // by the platform edge and cannot be spoofed by clients.
    const ip = getClientIp(request);
    const { success } = await resetLimiter.check(ip);
    if (!success) {
      return NextResponse.json(
        { error: 'Too many attempts. Please try again later.' },
        { status: 429 },
      );
    }

    let data;
    try {
      data = parseData(await request.json(), resetPasswordSchema);
    } catch (error) {
      if (error instanceof ValidationError) return error.toResponse();
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { token, password } = data;

    const resetRecord = await prisma.passwordReset.findUnique({
      where: { token },
      include: { user: { select: { id: true, email: true } } },
    });

    if (!resetRecord) {
      return NextResponse.json({ error: 'Invalid reset token' }, { status: 400 });
    }

    if (resetRecord.used || resetRecord.attempts >= 5 || resetRecord.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Invalid or expired reset token' }, { status: 400 });
    }

    // Increment attempts immediately to prevent replay/brute-force
    await prisma.passwordReset.update({
      where: { id: resetRecord.id },
      data: { attempts: { increment: 1 } },
    });

    const hashedPassword = await bcrypt.hash(password, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetRecord.userId },
        data: {
          password: hashedPassword,
          sessionVersion: { increment: 1 },
        },
      }),
      prisma.passwordReset.update({
        where: { id: resetRecord.id },
        data: { used: true },
      }),
    ]);

    await logAudit({
      userId: resetRecord.userId,
      action: 'UPDATE',
      entity: 'User',
      entityId: resetRecord.userId,
      detail: `Password reset successfully via token for ${resetRecord.user.email}`,
      metadata: { tokenPreview: token.substring(0, 8) + '...' },
    });

    return NextResponse.json({ success: true, message: 'Password has been reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 });
  }
}

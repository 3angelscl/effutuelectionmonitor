import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import crypto from 'crypto';
import { createRateLimiter } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/client-ip';
import { sendPasswordResetEmail } from '@/lib/email';
import { apiHandler } from '@/lib/api-auth';
import { parseBody, resetRequestSchema } from '@/lib/validations';

// 5 reset requests per 15 minutes per IP
const resetRequestLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });

export const POST = apiHandler(async (request: NextRequest) => {
  // Rate limit by the Vercel-verified client IP (unspoofable at the edge).
  const ip = getClientIp(request);
  const { success } = await resetRequestLimiter.check(ip);
  if (!success) {
    return NextResponse.json(
      { error: 'Too many reset requests. Please try again later.' },
      { status: 429 },
    );
  }

  const { email } = await parseBody(request, resetRequestSchema);

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

  const resetUrl = `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
  try {
    await sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl });
  } catch (error) {
    // Preserve the endpoint's anti-enumeration contract: callers should
    // receive the same success response whether the email exists or SMTP is
    // temporarily unavailable.
    console.error('Password reset email delivery failed:', error);
  }

  return NextResponse.json({
    success: true,
    message: 'If the email exists, a reset link has been generated.',
    // Include token in dev mode for testing
    ...(process.env.NODE_ENV !== 'production' && { resetToken: token, resetUrl }),
  });
});

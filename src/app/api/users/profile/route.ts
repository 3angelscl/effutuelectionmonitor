import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';

const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/;

export async function GET() {
  try {
    const { user } = await requireAuth();
    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, name: true, email: true, phone: true, photo: true },
    });
    if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    return NextResponse.json(profile);
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireAuth();

    const body = await request.json();
    const { name, phone, currentPassword, newPassword } = body;

    // Password change flow
    if (currentPassword && newPassword) {
      if (newPassword.length < 8) {
        return NextResponse.json(
          { error: 'New password must be at least 8 characters' },
          { status: 400 },
        );
      }
      if (!passwordRegex.test(newPassword)) {
        return NextResponse.json(
          { error: 'New password must contain at least 1 uppercase letter, 1 number, and 1 special character' },
          { status: 400 },
        );
      }

      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      if (!dbUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const isValid = await bcrypt.compare(currentPassword, dbUser.password);
      if (!isValid) {
        return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
      }

      const hashed = await bcrypt.hash(newPassword, 12);
      // Increment sessionVersion to invalidate all other active sessions
      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashed, sessionVersion: { increment: 1 } },
      });

      return NextResponse.json({ success: true });
    }

    // Profile update flow
    const data: Record<string, string | null> = {};
    if (name !== undefined) data.name = name;
    if (phone !== undefined) data.phone = phone || null;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data,
      select: { id: true, name: true, email: true, phone: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Profile update error:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}

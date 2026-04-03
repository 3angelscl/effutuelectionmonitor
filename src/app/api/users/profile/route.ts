import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { logAudit } from '@/lib/audit';
import { parseData, ValidationError, passwordComplexityMsg, passwordRegex } from '@/lib/validations';
import { z } from 'zod';

// Local schema for profile updates
const profileUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  phone: z.string().max(20).optional().nullable(),
  photo: z.string()
    .refine(
      (v) => !v || v.startsWith('/') || URL.canParse(v),
      'Photo must be a valid URL or upload path',
    )
    .transform((v) => v || null)
    .optional()
    .nullable(),
  currentPassword: z.string().optional(),
  newPassword: z.string()
    .min(8, 'New password must be at least 8 characters')
    .regex(passwordRegex, passwordComplexityMsg)
    .optional(),
});

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
    const data = parseData(body, profileUpdateSchema);
    const { name, phone, currentPassword, newPassword } = data;

    // Password change flow
    if (currentPassword && newPassword) {
      const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
      if (!dbUser) {
        throw new ApiError(404, 'User not found');
      }

      const isValid = await bcrypt.compare(currentPassword, dbUser.password);
      if (!isValid) {
        throw new ApiError(400, 'Current password is incorrect');
      }

      const hashed = await bcrypt.hash(newPassword, 12);
      // Increment sessionVersion to invalidate all other active sessions
      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashed, sessionVersion: { increment: 1 } },
      });

      await logAudit({
        userId: user.id,
        action: 'UPDATE',
        entity: 'User',
        entityId: user.id,
        detail: 'User changed their own password',
        metadata: { passwordChanged: true },
      });

      return NextResponse.json({ success: true });
    }

    // Profile update flow
    const updateData: Record<string, string | null> = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone || null;
    if (data.photo !== undefined) updateData.photo = data.photo;

    if (Object.keys(updateData).length === 0) {
      throw new ApiError(400, 'No fields to update');
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
      select: { id: true, name: true, email: true, phone: true },
    });

    await logAudit({
      userId: user.id,
      action: 'UPDATE',
      entity: 'User',
      entityId: user.id,
      detail: 'User updated their profile details',
      metadata: { updatedFields: Object.keys(updateData) },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Profile update error:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}

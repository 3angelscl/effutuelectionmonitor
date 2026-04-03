import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import bcrypt from 'bcryptjs';
import { parseBody, userUpdateSchema } from '@/lib/validations';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: authUser } = await requireRole('ADMIN');

    const { id } = await params;

    const targetUser = await prisma.user.findUnique({
      where: { id },
      select: { name: true, email: true, role: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await logAudit({
      userId: authUser.id,
      action: 'DELETE',
      entity: 'User',
      entityId: id,
      detail: `Soft-deleted user "${targetUser.name}" (${targetUser.role})`,
      metadata: { email: targetUser.email, role: targetUser.role },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Delete user error:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user: authUser } = await requireRole('ADMIN');

    const { id } = await params;
    const body = await parseBody(request, userUpdateSchema);
    const { password, ...data } = body;

    const updateData: Record<string, any> = { ...data };
    
    if (password) {
      updateData.password = await bcrypt.hash(password, 12);
      // Bump sessionVersion to invalidate existing sessions for this user
      const current = await prisma.user.findUnique({ where: { id }, select: { sessionVersion: true } });
      updateData.sessionVersion = (current?.sessionVersion ?? 1) + 1;
    }

    if (Object.keys(updateData).length === 0) {
      throw new ApiError(400, 'No fields to update');
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        photo: true,
      },
    });

    await logAudit({
      userId: authUser.id,
      action: 'UPDATE',
      entity: 'User',
      entityId: id,
      detail: `Updated user "${user.name}"${password ? ' (password reset)' : ''}`,
      metadata: { updatedFields: Object.keys(data) },
    });

    return NextResponse.json(user);
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Update user error:', error);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}

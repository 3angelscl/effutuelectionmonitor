import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { logAudit } from '@/lib/audit';
import { requireRole, ApiError, apiHandler } from '@/lib/api-auth';
import { invalidateLiveSummary } from '@/lib/live-summary';
import { parseBody, userCreateSchema, ValidationError } from '@/lib/validations';
import { encryptField, decryptField } from '@/lib/crypto';

export const GET = apiHandler(async () => {
  await requireRole(['ADMIN', 'OFFICER']);

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      phone: true,
      photo: true,
      createdAt: true,
      assignedStations: { select: { psCode: true, name: true } },
    },
    orderBy: { name: 'asc' },
  });

  // Decrypt phone numbers before returning
  const decrypted = users.map((u) => ({ ...u, phone: decryptField(u.phone) }));
  return NextResponse.json(decrypted);
});

export const POST = apiHandler(async (request: Request) => {
  const { user: admin } = await requireRole('ADMIN');

  let data;
  try {
    data = await parseBody(request, userCreateSchema);
  } catch (error) {
    if (error instanceof ValidationError) return error.toResponse();
    throw error;
  }

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw new ApiError(409, 'Email already exists');
  }

  const hashedPassword = await bcrypt.hash(data.password, 12);

  const user = await prisma.user.create({
    data: {
      email: data.email,
      password: hashedPassword,
      name: data.name,
      role: data.role,
      phone: encryptField(data.phone || null),
      photo: data.photo || null,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      phone: true,
      photo: true,
    },
  });

  // Assign to polling station if agent
  if (data.role === 'AGENT' && data.stationId) {
    await prisma.pollingStation.update({
      where: { id: data.stationId },
      data: { agentId: user.id },
    });
  }

  await logAudit({
    userId: admin.id,
    action: 'CREATE',
    entity: 'User',
    entityId: user.id,
    detail: `Created user "${data.name}" (${data.role})`,
    metadata: { email: data.email, role: data.role },
  });

  if (data.role === 'AGENT' && data.stationId) {
    await invalidateLiveSummary();
  }

  return NextResponse.json(user, { status: 201 });
});

export async function DELETE(request: NextRequest) {
  try {
    const { user: admin } = await requireRole('ADMIN');

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

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
      userId: admin.id,
      action: 'DELETE',
      entity: 'User',
      entityId: id,
      detail: `Soft-deleted user "${targetUser?.name}" (${targetUser?.role})`,
      metadata: { email: targetUser?.email, role: targetUser?.role },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Delete user error:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }
}

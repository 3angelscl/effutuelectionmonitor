import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRole('ADMIN');

    const body = await request.json();
    const { agentId, stationId } = body;

    if (!agentId || !stationId) {
      return NextResponse.json({ error: 'agentId and stationId are required' }, { status: 400 });
    }

    // Verify the user being assigned is an active AGENT
    const targetUser = await prisma.user.findUnique({
      where: { id: agentId },
      select: { role: true, deletedAt: true },
    });
    if (!targetUser || targetUser.deletedAt !== null) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (targetUser.role !== 'AGENT') {
      return NextResponse.json({ error: 'Only users with the AGENT role can be assigned to a station' }, { status: 400 });
    }

    // Unassign agent from any current station and assign to new station atomically
    await prisma.$transaction([
      prisma.pollingStation.updateMany({ where: { agentId }, data: { agentId: null } }),
      prisma.pollingStation.update({ where: { id: stationId }, data: { agentId } }),
    ]);

    await logAudit({
      userId: user.id,
      action: 'ASSIGN',
      entity: 'PollingStation',
      entityId: stationId,
      detail: `Assigned agent ${agentId} to station ${stationId}`,
      metadata: { agentId, stationId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Assign station error:', error);
    return NextResponse.json({ error: 'Failed to assign station' }, { status: 500 });
  }
}

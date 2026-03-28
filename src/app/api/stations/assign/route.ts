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

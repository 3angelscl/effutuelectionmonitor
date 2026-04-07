import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { invalidateLiveSummary } from '@/lib/live-summary';

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRole('ADMIN');

    const body = await request.json();
    const { agentId } = body as { agentId?: string };

    if (!agentId) {
      return NextResponse.json({ error: 'agentId is required' }, { status: 400 });
    }

    const agent = await prisma.user.findUnique({
      where: { id: agentId },
      select: { id: true, role: true, deletedAt: true, name: true },
    });

    if (!agent || agent.deletedAt !== null) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    if (agent.role !== 'AGENT') {
      return NextResponse.json({ error: 'Only AGENT users can be unassigned from stations' }, { status: 400 });
    }

    const assignedStations = await prisma.pollingStation.findMany({
      where: { agentId },
      select: { id: true, psCode: true, name: true },
    });

    if (assignedStations.length === 0) {
      return NextResponse.json({ success: true, unassigned: 0 });
    }

    await prisma.pollingStation.updateMany({
      where: { agentId },
      data: { agentId: null },
    });

    await logAudit({
      userId: user.id,
      action: 'UNASSIGN',
      entity: 'PollingStation',
      entityId: agentId,
      detail: `Unassigned agent ${agent.name} from ${assignedStations.length} station${assignedStations.length !== 1 ? 's' : ''}`,
      metadata: {
        agentId,
        stations: assignedStations,
      },
    });

    await invalidateLiveSummary();

    return NextResponse.json({ success: true, unassigned: assignedStations.length });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Unassign station error:', error);
    return NextResponse.json({ error: 'Failed to unassign agent' }, { status: 500 });
  }
}

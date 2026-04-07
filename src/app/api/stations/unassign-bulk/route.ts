import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { invalidateLiveSummary } from '@/lib/live-summary';

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRole('ADMIN');

    const { agentIds } = (await request.json()) as { agentIds?: string[] };

    if (!agentIds || !Array.isArray(agentIds) || agentIds.length === 0) {
      return NextResponse.json({ error: 'agentIds array is required' }, { status: 400 });
    }

    const uniqueAgentIds = [...new Set(agentIds.filter(Boolean))];

    const agents = await prisma.user.findMany({
      where: {
        id: { in: uniqueAgentIds },
        role: 'AGENT',
        deletedAt: null,
      },
      select: { id: true, name: true },
    });

    if (agents.length === 0) {
      return NextResponse.json({ error: 'No valid agents found to unassign' }, { status: 400 });
    }

    const validAgentIds = agents.map((agent) => agent.id);
    const assignedStations = await prisma.pollingStation.findMany({
      where: { agentId: { in: validAgentIds } },
      select: { id: true, psCode: true, name: true, agentId: true },
    });

    if (assignedStations.length === 0) {
      return NextResponse.json({ success: true, unassignedAgents: 0, affectedStations: 0 });
    }

    await prisma.pollingStation.updateMany({
      where: { agentId: { in: validAgentIds } },
      data: { agentId: null },
    });

    await logAudit({
      userId: user.id,
      action: 'BULK_UNASSIGN',
      entity: 'PollingStation',
      entityId: 'bulk',
      detail: `Bulk unassigned ${validAgentIds.length} agent${validAgentIds.length !== 1 ? 's' : ''} from ${assignedStations.length} station${assignedStations.length !== 1 ? 's' : ''}`,
      metadata: {
        agentIds: validAgentIds,
        affectedStations: assignedStations,
      },
    });

    await invalidateLiveSummary();

    return NextResponse.json({
      success: true,
      unassignedAgents: validAgentIds.length,
      affectedStations: assignedStations.length,
    });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Bulk unassign error:', error);
    return NextResponse.json({ error: 'Failed to bulk unassign agents' }, { status: 500 });
  }
}

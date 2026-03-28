import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRole('ADMIN');

    const { assignments } = (await request.json()) as {
      assignments: { agentId: string; stationId: string }[];
    };

    if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
      return NextResponse.json({ error: 'Assignments array is required' }, { status: 400 });
    }

    // Validate all agents exist and are AGENT role
    const agentIds = [...new Set(assignments.map((a) => a.agentId))];
    const agents = await prisma.user.findMany({
      where: { id: { in: agentIds }, role: 'AGENT' },
      select: { id: true },
    });
    const validAgentIds = new Set(agents.map((a) => a.id));

    // Validate all stations exist
    const stationIds = [...new Set(assignments.map((a) => a.stationId))];
    const stationsFound = await prisma.pollingStation.findMany({
      where: { id: { in: stationIds } },
      select: { id: true },
    });
    const validStationIds = new Set(stationsFound.map((s) => s.id));

    const errors: string[] = [];
    const validAssignments: { agentId: string; stationId: string }[] = [];

    assignments.forEach((a, i) => {
      if (!validAgentIds.has(a.agentId)) {
        errors.push(`Row ${i + 1}: Invalid agent ID`);
      } else if (!validStationIds.has(a.stationId)) {
        errors.push(`Row ${i + 1}: Invalid station ID`);
      } else {
        validAssignments.push(a);
      }
    });

    if (validAssignments.length === 0) {
      return NextResponse.json({ error: 'No valid assignments', errors }, { status: 400 });
    }

    // Unassign agents from current stations, then assign to new ones
    const unassignOps = validAssignments.map((a) =>
      prisma.pollingStation.updateMany({
        where: { agentId: a.agentId },
        data: { agentId: null },
      })
    );
    const assignOps = validAssignments.map((a) =>
      prisma.pollingStation.update({
        where: { id: a.stationId },
        data: { agentId: a.agentId },
      })
    );

    await prisma.$transaction([...unassignOps, ...assignOps]);

    await logAudit({
      userId: user.id,
      action: 'BULK_ASSIGN',
      entity: 'PollingStation',
      entityId: 'bulk',
      detail: `Bulk assigned ${validAssignments.length} agents to stations`,
      metadata: { assignments: validAssignments },
    });

    return NextResponse.json({
      success: true,
      assigned: validAssignments.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Bulk assign error:', error);
    return NextResponse.json({ error: 'Failed to process bulk assignment' }, { status: 500 });
  }
}

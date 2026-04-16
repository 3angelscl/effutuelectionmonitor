import { NextRequest, NextResponse } from 'next/server';
import { requireRole, apiHandler } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { invalidateLiveSummary } from '@/lib/live-summary';
import { parseBody, stationAssignSchema } from '@/lib/validations';

export const POST = apiHandler(async (request: NextRequest) => {
  const { user } = await requireRole('ADMIN');
  const { agentId, stationId } = await parseBody(request, stationAssignSchema);

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

  const station = await prisma.pollingStation.findUnique({
    where: { id: stationId },
    select: { id: true },
  });
  if (!station) {
    return NextResponse.json({ error: 'Station not found' }, { status: 404 });
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

  await invalidateLiveSummary();

  return NextResponse.json({ success: true });
});

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole, ApiError, apiHandler } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';
import { broadcastEvent } from '@/lib/events';

export const POST = apiHandler(async (request: Request) => {
  const { user } = await requireRole(['ADMIN', 'OFFICER']);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, 'Invalid JSON body');
  }

  const { stationId, electionId, action } = body as {
    stationId?: string;
    electionId?: string;
    action?: string;
  };

  if (!stationId || typeof stationId !== 'string') {
    throw new ApiError(400, 'stationId is required');
  }
  if (!electionId || typeof electionId !== 'string') {
    throw new ApiError(400, 'electionId is required');
  }
  if (action !== 'APPROVED' && action !== 'REJECTED') {
    throw new ApiError(400, 'action must be APPROVED or REJECTED');
  }

  const station = await prisma.pollingStation.findUnique({ where: { id: stationId } });
  if (!station) {
    throw new ApiError(404, 'Polling station not found');
  }

  const now = new Date();

  const updateData: {
    approvalStatus: string;
    approvedById: string;
    approvedAt: Date;
    resultType?: string;
  } = {
    approvalStatus: action,
    approvedById: user.id,
    approvedAt: now,
  };

  if (action === 'APPROVED') {
    updateData.resultType = 'FINAL';
  }

  const result = await prisma.electionResult.updateMany({
    where: {
      stationId,
      electionId,
      approvalStatus: 'PENDING',
    },
    data: updateData,
  });

  await logAudit({
    userId: user.id,
    action: 'APPROVE',
    entity: 'ElectionResult',
    entityId: stationId,
    detail: `${action} ElectionResult for station ${station.psCode} (${result.count} records)`,
    metadata: {
      stationId,
      electionId,
      action,
      updatedCount: result.count,
    },
  });

  broadcastEvent('results:approved', {
    stationId,
    stationCode: station.psCode,
    electionId,
    action,
  });

  return NextResponse.json({ success: true, updated: result.count });
});

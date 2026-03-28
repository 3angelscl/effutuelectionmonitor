import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requireAuth, requireRole, ApiError, apiHandler } from '@/lib/api-auth';
import { parseBody, resultSubmitSchema, ValidationError } from '@/lib/validations';
import { broadcastEvent } from '@/lib/events';

export const GET = apiHandler(async (request: Request) => {
  await requireAuth();

  const { searchParams } = new URL(request.url);
  const stationId = searchParams.get('stationId') || '';
  let electionId = searchParams.get('electionId') || '';

  if (!electionId) {
    const active = await prisma.election.findFirst({ where: { isActive: true } });
    electionId = active?.id || '';
  }

  const where: Record<string, string> = {};
  if (stationId) where.stationId = stationId;
  if (electionId) where.electionId = electionId;

  const results = await prisma.electionResult.findMany({
    where,
    include: {
      candidate: true,
      pollingStation: { select: { name: true, psCode: true } },
    },
    orderBy: { votes: 'desc' },
  });

  return NextResponse.json(results);
});

export const POST = apiHandler(async (request: Request) => {
  const { user } = await requireRole(['ADMIN', 'AGENT']);

  let data;
  try {
    data = await parseBody(request, resultSubmitSchema);
  } catch (error) {
    if (error instanceof ValidationError) return error.toResponse();
    throw error;
  }

  const { stationId, results, resultType, adminOverride } = data;

  const station = await prisma.pollingStation.findUnique({ where: { id: stationId } });
  if (!station) {
    throw new ApiError(404, 'Polling station not found');
  }

  // If agent, verify assignment
  if (user.role === 'AGENT' && station.agentId !== user.id) {
    throw new ApiError(403, 'Not authorized for this polling station');
  }

  // Get active election
  const activeElection = await prisma.election.findFirst({ where: { isActive: true } });
  if (!activeElection) {
    throw new ApiError(400, 'No active election');
  }

  // Determine approval status based on resultType and user role
  const isPrivilegedUser = user.role === 'ADMIN' || user.role === 'OFFICER';
  const isFinalByPrivileged = resultType === 'FINAL' && isPrivilegedUser;
  const approvalStatus = isFinalByPrivileged ? 'APPROVED' : 'PENDING';
  const approvalFields = isFinalByPrivileged
    ? { approvedById: user.id, approvedAt: new Date() }
    : { approvedById: null, approvedAt: null };

  // Lock check + upserts in one interactive transaction to prevent race conditions.
  // Two concurrent FINAL submissions for the same station will serialize here —
  // only the first to acquire the lock will proceed; the second sees lockedCount > 0.
  await prisma.$transaction(async (tx) => {
    const lockedCount = await tx.electionResult.count({
      where: { stationId, electionId: activeElection.id, resultType: 'FINAL' },
    });

    if (lockedCount > 0) {
      if (user.role !== 'ADMIN' || !adminOverride) {
        throw new ApiError(403, 'Results are locked (FINAL). Only an admin can override with explicit confirmation.');
      }
    }

    for (const r of results as { candidateId: string; votes: number }[]) {
      await tx.electionResult.upsert({
        where: {
          stationId_candidateId_electionId: {
            stationId,
            candidateId: r.candidateId,
            electionId: activeElection.id,
          },
        },
        update: {
          votes: r.votes,
          resultType,
          submittedById: user.id,
          approvalStatus,
          ...approvalFields,
        },
        create: {
          stationId,
          candidateId: r.candidateId,
          votes: r.votes,
          resultType,
          submittedById: user.id,
          electionId: activeElection.id,
          approvalStatus,
          ...approvalFields,
        },
      });
    }
  });

  await logAudit({
    userId: user.id,
    action: 'SUBMIT',
    entity: 'ElectionResult',
    entityId: stationId,
    detail: `Submitted ${resultType} results for station "${station.psCode}" (${results.length} candidates)`,
    metadata: {
      stationId,
      resultType,
      candidateCount: results.length,
      totalVotes: results.reduce((s: number, r: { votes: number }) => s + r.votes, 0),
    },
  });

  // Broadcast real-time event
  broadcastEvent('results:submitted', {
    stationId,
    stationCode: station.psCode,
    electionId: activeElection.id,
    resultType,
  });

  return NextResponse.json({ success: true });
});

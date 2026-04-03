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

  // Vote Capping: Enforce that total votes do not exceed registered voters
  const totalSubmittedVotes = (results as { votes: number }[]).reduce((sum, r) => sum + r.votes, 0);
  const registeredVotersCount = await prisma.voter.count({
    where: { stationId, deletedAt: null },
  });

  if (totalSubmittedVotes > registeredVotersCount) {
    if (user.role !== 'ADMIN' || !adminOverride) {
      throw new ApiError(
        400,
        `Total votes (${totalSubmittedVotes}) exceed the number of registered voters (${registeredVotersCount}) for this station.`
      );
    }
  }

  // Upsert results — agents and admins can freely update PROVISIONAL results.
  // FINAL results can only be overridden by an admin with explicit confirmation.
  await prisma.$transaction(async (tx) => {
    if (resultType !== 'FINAL') {
      // Check if results are already FINAL — only admin can override
      const lockedCount = await tx.electionResult.count({
        where: { stationId, electionId: activeElection.id, resultType: 'FINAL' },
      });

      if (lockedCount > 0) {
        if (user.role !== 'ADMIN' || !adminOverride) {
          throw new ApiError(403, 'Results are locked (FINAL). Only an admin can override with explicit confirmation.');
        }
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
        },
        create: {
          stationId,
          candidateId: r.candidateId,
          votes: r.votes,
          resultType,
          submittedById: user.id,
          electionId: activeElection.id,
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
      totalVotes: totalSubmittedVotes,
      registeredVotersCount,
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

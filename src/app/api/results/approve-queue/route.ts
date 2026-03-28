import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireRole, apiHandler } from '@/lib/api-auth';

export const GET = apiHandler(async () => {
  await requireRole(['ADMIN', 'OFFICER']);

  const activeElection = await prisma.election.findFirst({ where: { isActive: true } });
  if (!activeElection) {
    return NextResponse.json([]);
  }

  // Find all pending results for the active election, grouped by station
  const pendingResults = await prisma.electionResult.findMany({
    where: {
      electionId: activeElection.id,
      approvalStatus: 'PENDING',
    },
    include: {
      candidate: {
        select: { name: true, party: true },
      },
      pollingStation: {
        select: { id: true, psCode: true, name: true },
      },
      submittedBy: {
        select: { name: true, email: true },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  // Group by stationId
  const stationMap = new Map<
    string,
    {
      stationId: string;
      stationCode: string;
      stationName: string;
      electionId: string;
      submittedBy: { name: string | null; email: string };
      submittedAt: Date;
      totalVotes: number;
      candidateResults: { candidateName: string; party: string; votes: number }[];
    }
  >();

  for (const result of pendingResults) {
    const stationId = result.pollingStation.id;

    if (!stationMap.has(stationId)) {
      stationMap.set(stationId, {
        stationId,
        stationCode: result.pollingStation.psCode,
        stationName: result.pollingStation.name,
        electionId: result.electionId,
        submittedBy: {
          name: result.submittedBy?.name ?? null,
          email: result.submittedBy?.email ?? '',
        },
        submittedAt: result.updatedAt,
        totalVotes: 0,
        candidateResults: [],
      });
    }

    const entry = stationMap.get(stationId)!;
    entry.totalVotes += result.votes;
    entry.candidateResults.push({
      candidateName: result.candidate.name,
      party: result.candidate.party,
      votes: result.votes,
    });

    // Use the most recent updatedAt as submittedAt
    if (result.updatedAt > entry.submittedAt) {
      entry.submittedAt = result.updatedAt;
    }
  }

  return NextResponse.json(Array.from(stationMap.values()));
});

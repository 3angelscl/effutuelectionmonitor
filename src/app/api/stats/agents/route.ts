import { NextResponse } from 'next/server';
import { requireRole, ApiError, apiHandler } from '@/lib/api-auth';
import prisma from '@/lib/prisma';

export const GET = apiHandler(async () => {
  await requireRole(['ADMIN', 'OFFICER']);

  // Get active election
  const activeElection = await prisma.election.findFirst({ where: { isActive: true } });

  // Get all agents with assigned stations
  const agents = await prisma.user.findMany({
    where: {
      role: 'AGENT',
      deletedAt: null,
      assignedStations: { some: {} },
    },
    select: {
      id: true,
      name: true,
      email: true,
      photo: true,
      assignedStations: {
        select: {
          id: true,
          psCode: true,
          name: true,
        },
      },
      checkIns: {
        orderBy: { createdAt: 'desc' },
        take: 2,
        select: {
          type: true,
          createdAt: true,
        },
      },
    },
  });

  // Batch query: get all station IDs that have results for the active election (eliminates N+1)
  const stationIdsWithResults = new Set<string>();
  if (activeElection) {
    const stationIds = agents
      .map((a) => a.assignedStations[0]?.id)
      .filter((id): id is string => !!id);

    if (stationIds.length > 0) {
      const resultCounts = await prisma.electionResult.groupBy({
        by: ['stationId'],
        where: {
          stationId: { in: stationIds },
          electionId: activeElection.id,
        },
      });
      for (const r of resultCounts) {
        stationIdsWithResults.add(r.stationId);
      }
    }
  }

  const result = agents.map((agent) => {
    const station = agent.assignedStations[0];

    // Determine check-in status from latest check-in record
    const latestCheckIn = agent.checkIns.find((c) => c.type === 'CHECK_IN') || null;
    const latestCheckOut = agent.checkIns.find((c) => c.type === 'CHECK_OUT') || null;

    // The very latest record determines current status
    const mostRecent = agent.checkIns[0] || null;
    let status: 'CHECKED_IN' | 'CHECKED_OUT' | 'NOT_CHECKED_IN';
    if (!mostRecent) {
      status = 'NOT_CHECKED_IN';
    } else if (mostRecent.type === 'CHECK_IN') {
      status = 'CHECKED_IN';
    } else {
      status = 'CHECKED_OUT';
    }

    const hasSubmittedResults = station ? stationIdsWithResults.has(station.id) : false;

    return {
      id: agent.id,
      name: agent.name,
      email: agent.email,
      photo: agent.photo,
      stationId: station?.id ?? null,
      stationCode: station?.psCode ?? null,
      stationName: station?.name ?? null,
      status,
      lastCheckIn: latestCheckIn ? latestCheckIn.createdAt : null,
      lastCheckOut: latestCheckOut ? latestCheckOut.createdAt : null,
      hasSubmittedResults,
    };
  });

  return NextResponse.json(result);
});

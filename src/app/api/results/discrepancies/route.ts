import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ApiError, apiHandler } from '@/lib/api-auth';
import prisma from '@/lib/prisma';

export const GET = apiHandler(async (request: Request) => {
  await requireRole(['ADMIN', 'OFFICER']);

  const { searchParams } = new URL(request.url);
  const electionIdParam = searchParams.get('electionId');

  // Resolve election
  let electionId = electionIdParam;
  if (!electionId) {
    const active = await prisma.election.findFirst({ where: { isActive: true } });
    if (!active) {
      return NextResponse.json([]);
    }
    electionId = active.id;
  }

  // Get all polling stations that have at least one result for this election
  const stationsWithResults = await prisma.pollingStation.findMany({
    where: {
      results: {
        some: { electionId },
      },
    },
    select: {
      id: true,
      psCode: true,
      name: true,
      results: {
        where: { electionId },
        select: { votes: true },
      },
    },
  });

  if (stationsWithResults.length === 0) {
    return NextResponse.json([]);
  }

  const stationIds = stationsWithResults.map((s) => s.id);

  // Count registered voters per station
  const registeredCounts = await prisma.voter.groupBy({
    by: ['stationId'],
    where: { stationId: { in: stationIds }, deletedAt: null },
    _count: { id: true },
  });
  const registeredMap = new Map(registeredCounts.map((r) => [r.stationId, r._count.id]));

  // Count voters with hasVoted=true per station (via VoterTurnout)
  // We need to join through voters to get stationId
  const turnoutRecords = await prisma.voterTurnout.findMany({
    where: {
      electionId,
      hasVoted: true,
      voter: { stationId: { in: stationIds } },
    },
    select: {
      voter: { select: { stationId: true } },
    },
  });

  const turnoutByStation = new Map<string, number>();
  for (const t of turnoutRecords) {
    const sid = t.voter.stationId;
    turnoutByStation.set(sid, (turnoutByStation.get(sid) || 0) + 1);
  }

  type DiscrepancyFlag = 'OVERVOTE' | 'RESULT_TURNOUT_MISMATCH';

  const discrepancies: {
    stationId: string;
    stationCode: string;
    stationName: string;
    registeredVoters: number;
    totalVotes: number;
    voterTurnout: number;
    flags: DiscrepancyFlag[];
  }[] = [];

  for (const station of stationsWithResults) {
    const registeredVoters = registeredMap.get(station.id) || 0;
    const totalVotes = station.results.reduce((sum, r) => sum + r.votes, 0);
    const voterTurnout = turnoutByStation.get(station.id) || 0;

    const flags: DiscrepancyFlag[] = [];

    // Overvote: total votes cast exceeds registered voters
    if (registeredVoters > 0 && totalVotes > registeredVoters) {
      flags.push('OVERVOTE');
    }

    // Result/Turnout mismatch: difference > 5 between votes cast and turnout count
    if (Math.abs(totalVotes - voterTurnout) > 5) {
      flags.push('RESULT_TURNOUT_MISMATCH');
    }

    if (flags.length > 0) {
      discrepancies.push({
        stationId: station.id,
        stationCode: station.psCode,
        stationName: station.name,
        registeredVoters,
        totalVotes,
        voterTurnout,
        flags,
      });
    }
  }

  return NextResponse.json(discrepancies);
});

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const electionIdParam = searchParams.get('electionId');

    const election = electionIdParam
      ? await prisma.election.findUnique({ where: { id: electionIdParam } })
      : await prisma.election.findFirst({ where: { isActive: true } });

    if (!election) {
      return NextResponse.json([]);
    }

    // Use aggregate queries instead of loading all voter records inline
    const stations = await prisma.pollingStation.findMany({
      select: {
        id: true,
        ward: true,
        results: {
          where: { electionId: election.id },
          select: { id: true },
        },
      },
    });

    const stationIds = stations.map((s) => s.id);

    // Registered voters per station
    const registeredCounts = await prisma.voter.groupBy({
      by: ['stationId'],
      where: { stationId: { in: stationIds }, deletedAt: null },
      _count: { id: true },
    });
    const registeredMap = new Map(registeredCounts.map((r) => [r.stationId, r._count.id]));

    // Voted voters per station
    const votedCounts = await prisma.voterTurnout.groupBy({
      by: ['voterId'],
      where: { electionId: election.id, hasVoted: true },
      _count: { voterId: true },
    });

    // Map voterId → stationId via a batched Voter lookup
    const votedVoterIds = votedCounts.map((v) => v.voterId);
    const votedByStation = new Map<string, number>();

    const BATCH = 1000;
    for (let i = 0; i < votedVoterIds.length; i += BATCH) {
      const batch = votedVoterIds.slice(i, i + BATCH);
      const voters = await prisma.voter.findMany({
        where: { id: { in: batch } },
        select: { stationId: true },
      });
      for (const v of voters) {
        votedByStation.set(v.stationId, (votedByStation.get(v.stationId) || 0) + 1);
      }
    }

    // Aggregate by ward
    const wardMap = new Map<string, {
      ward: string;
      stationCount: number;
      registeredVoters: number;
      votedVoters: number;
      stationsReported: number;
    }>();

    for (const station of stations) {
      const wardName = station.ward || 'Unassigned';
      if (!wardMap.has(wardName)) {
        wardMap.set(wardName, { ward: wardName, stationCount: 0, registeredVoters: 0, votedVoters: 0, stationsReported: 0 });
      }
      const entry = wardMap.get(wardName)!;
      entry.stationCount += 1;
      entry.registeredVoters += registeredMap.get(station.id) || 0;
      entry.votedVoters += votedByStation.get(station.id) || 0;
      if (station.results.length > 0) entry.stationsReported += 1;
    }

    const result = Array.from(wardMap.values())
      .map((w) => ({
        ward: w.ward,
        stationCount: w.stationCount,
        registeredVoters: w.registeredVoters,
        votedVoters: w.votedVoters,
        turnoutPct: w.registeredVoters > 0
          ? Math.round((w.votedVoters / w.registeredVoters) * 1000) / 10
          : 0,
        stationsReported: w.stationsReported,
      }))
      .sort((a, b) => b.turnoutPct - a.turnoutPct);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Ward stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch ward stats' }, { status: 500 });
  }
}

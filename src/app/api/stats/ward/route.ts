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
      return NextResponse.json([], { status: 200 });
    }

    const stations = await prisma.pollingStation.findMany({
      include: {
        voters: {
          include: {
            turnout: {
              where: { electionId: election.id },
            },
          },
        },
        results: {
          where: { electionId: election.id },
        },
      },
    });

    const wardMap = new Map<
      string,
      {
        ward: string;
        stationCount: number;
        registeredVoters: number;
        votedVoters: number;
        stationsReported: number;
      }
    >();

    for (const station of stations) {
      const wardName = station.ward || 'Unassigned';

      if (!wardMap.has(wardName)) {
        wardMap.set(wardName, {
          ward: wardName,
          stationCount: 0,
          registeredVoters: 0,
          votedVoters: 0,
          stationsReported: 0,
        });
      }

      const entry = wardMap.get(wardName)!;
      entry.stationCount += 1;
      entry.registeredVoters += station.voters.length;
      entry.votedVoters += station.voters.filter((v) =>
        v.turnout.some((t) => t.hasVoted)
      ).length;

      if (station.results.length > 0) {
        entry.stationsReported += 1;
      }
    }

    const result = Array.from(wardMap.values()).map((w) => ({
      ward: w.ward,
      stationCount: w.stationCount,
      registeredVoters: w.registeredVoters,
      votedVoters: w.votedVoters,
      turnoutPct:
        w.registeredVoters > 0
          ? Math.round((w.votedVoters / w.registeredVoters) * 1000) / 10
          : 0,
      stationsReported: w.stationsReported,
    }));

    result.sort((a, b) => b.turnoutPct - a.turnoutPct);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Ward stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch ward stats' }, { status: 500 });
  }
}

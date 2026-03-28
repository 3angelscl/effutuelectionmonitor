import { NextResponse } from 'next/server';
import { requireAuth, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    await requireAuth();

    const activeElection = await prisma.election.findFirst({ where: { isActive: true } });
    if (!activeElection) {
      return NextResponse.json([], { status: 200 });
    }

    // Get all stations with voters, turnout, and results
    const stations = await prisma.pollingStation.findMany({
      include: {
        voters: {
          include: {
            turnout: {
              where: { electionId: activeElection.id },
            },
          },
        },
        results: {
          where: { electionId: activeElection.id },
          include: {
            candidate: true,
          },
        },
      },
    });

    // Group by ward
    const wardMap: Map<string, {
      ward: string;
      totalRegistered: number;
      totalVoted: number;
      stationCount: number;
      stationsReporting: number;
      candidateVotes: Map<string, { candidateId: string; candidateName: string; party: string; color: string; votes: number }>;
    }> = new Map();

    for (const station of stations) {
      const wardName = station.ward || 'Unassigned';

      if (!wardMap.has(wardName)) {
        wardMap.set(wardName, {
          ward: wardName,
          totalRegistered: 0,
          totalVoted: 0,
          stationCount: 0,
          stationsReporting: 0,
          candidateVotes: new Map(),
        });
      }

      const wardData = wardMap.get(wardName)!;
      wardData.stationCount++;

      const stationRegistered = station.voters.length;
      const stationVoted = station.voters.filter(
        (v) => v.turnout.some((t) => t.hasVoted)
      ).length;

      wardData.totalRegistered += stationRegistered;
      wardData.totalVoted += stationVoted;

      if (station.results.length > 0) {
        wardData.stationsReporting++;
      }

      // Aggregate candidate results
      for (const result of station.results) {
        const key = result.candidateId;
        const existing = wardData.candidateVotes.get(key);
        if (existing) {
          existing.votes += result.votes;
        } else {
          wardData.candidateVotes.set(key, {
            candidateId: result.candidateId,
            candidateName: result.candidate.name,
            party: result.candidate.party,
            color: result.candidate.color || '#3B82F6',
            votes: result.votes,
          });
        }
      }
    }

    // Convert to array
    const result = Array.from(wardMap.values()).map((w) => {
      const candidates = Array.from(w.candidateVotes.values())
        .sort((a, b) => b.votes - a.votes);
      const totalVotesInWard = candidates.reduce((sum, c) => sum + c.votes, 0);

      return {
        ward: w.ward,
        totalRegistered: w.totalRegistered,
        totalVoted: w.totalVoted,
        turnoutPercentage: w.totalRegistered > 0
          ? Math.round((w.totalVoted / w.totalRegistered) * 10000) / 100
          : 0,
        stationCount: w.stationCount,
        stationsReporting: w.stationsReporting,
        candidates: candidates.map((c) => ({
          ...c,
          percentage: totalVotesInWard > 0
            ? Math.round((c.votes / totalVotesInWard) * 10000) / 100
            : 0,
        })),
      };
    });

    // Sort by ward name, with Unassigned last
    result.sort((a, b) => {
      if (a.ward === 'Unassigned') return 1;
      if (b.ward === 'Unassigned') return -1;
      return a.ward.localeCompare(b.ward);
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Regional stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch regional stats' }, { status: 500 });
  }
}

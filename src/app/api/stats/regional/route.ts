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

    // Group by electoral area
    const areaMap: Map<string, {
      electoralArea: string;
      totalRegistered: number;
      totalVoted: number;
      stationCount: number;
      stationsReporting: number;
      candidateVotes: Map<string, { candidateId: string; candidateName: string; party: string; color: string; votes: number }>;
    }> = new Map();

    for (const station of stations) {
      const areaName = station.electoralArea || 'Unassigned';

      if (!areaMap.has(areaName)) {
        areaMap.set(areaName, {
          electoralArea: areaName,
          totalRegistered: 0,
          totalVoted: 0,
          stationCount: 0,
          stationsReporting: 0,
          candidateVotes: new Map(),
        });
      }

      const areaData = areaMap.get(areaName)!;
      areaData.stationCount++;

      const stationRegistered = station.voters.length;
      const stationVoted = station.voters.filter(
        (v) => v.turnout.some((t) => t.hasVoted)
      ).length;

      areaData.totalRegistered += stationRegistered;
      areaData.totalVoted += stationVoted;

      if (station.results.length > 0) {
        areaData.stationsReporting++;
      }

      // Aggregate candidate results
      for (const result of station.results) {
        const key = result.candidateId;
        const existing = areaData.candidateVotes.get(key);
        if (existing) {
          existing.votes += result.votes;
        } else {
          areaData.candidateVotes.set(key, {
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
    const result = Array.from(areaMap.values()).map((a) => {
      const candidates = Array.from(a.candidateVotes.values())
        .sort((a, b) => b.votes - a.votes);
      const totalVotesInArea = candidates.reduce((sum, c) => sum + c.votes, 0);

      return {
        electoralArea: a.electoralArea,
        totalRegistered: a.totalRegistered,
        totalVoted: a.totalVoted,
        turnoutPercentage: a.totalRegistered > 0
          ? Math.round((a.totalVoted / a.totalRegistered) * 10000) / 100
          : 0,
        stationCount: a.stationCount,
        stationsReporting: a.stationsReporting,
        candidates: candidates.map((c) => ({
          ...c,
          percentage: totalVotesInArea > 0
            ? Math.round((c.votes / totalVotesInArea) * 10000) / 100
            : 0,
        })),
      };
    });

    // Sort by electoral area name, with Unassigned last
    result.sort((a, b) => {
      if (a.electoralArea === 'Unassigned') return 1;
      if (b.electoralArea === 'Unassigned') return -1;
      return a.electoralArea.localeCompare(b.electoralArea);
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Regional stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch regional stats' }, { status: 500 });
  }
}

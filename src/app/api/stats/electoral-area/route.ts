import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';

/**
 * GET /api/stats/electoral-area
 *
 * Returns per-electoral-area stats with candidate breakdown for the active
 * (or specified) election. Used by the Analytics page trends section.
 *
 * Query params:
 *   electionId  (optional) – specific election; defaults to active election
 */
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

    // Load stations with their electoral area, voter counts (via aggregate), and results
    const stations = await prisma.pollingStation.findMany({
      select: {
        id: true,
        electoralArea: true,
        results: {
          where: { electionId: election.id },
          select: {
            votes: true,
            candidateId: true,
            candidate: { select: { name: true, party: true, color: true } },
          },
        },
      },
    });

    const stationIds = stations.map((s) => s.id);

    // Aggregate registered voters per station
    const registeredCounts = await prisma.voter.groupBy({
      by: ['stationId'],
      where: { stationId: { in: stationIds }, deletedAt: null },
      _count: { id: true },
    });
    const registeredMap = new Map(registeredCounts.map((r) => [r.stationId, r._count.id]));

    // Aggregate voted voters per station via VoterTurnout → Voter
    const votedVoterIds = (
      await prisma.voterTurnout.findMany({
        where: { electionId: election.id, hasVoted: true },
        select: { voterId: true },
      })
    ).map((v) => v.voterId);

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

    // Aggregate by electoral area
    const areaMap = new Map<string, {
      electoralArea: string;
      stationCount: number;
      stationsReporting: number;
      registeredVoters: number;
      votedVoters: number;
      candidateVotes: Map<string, { candidateId: string; candidateName: string; party: string; color: string; votes: number }>;
    }>();

    for (const station of stations) {
      const areaName = station.electoralArea || 'Unassigned';
      if (!areaMap.has(areaName)) {
        areaMap.set(areaName, {
          electoralArea: areaName,
          stationCount: 0,
          stationsReporting: 0,
          registeredVoters: 0,
          votedVoters: 0,
          candidateVotes: new Map(),
        });
      }
      const area = areaMap.get(areaName)!;
      area.stationCount++;
      area.registeredVoters += registeredMap.get(station.id) || 0;
      area.votedVoters += votedByStation.get(station.id) || 0;

      if (station.results.length > 0) {
        area.stationsReporting++;
        for (const result of station.results) {
          const existing = area.candidateVotes.get(result.candidateId);
          if (existing) {
            existing.votes += result.votes;
          } else {
            area.candidateVotes.set(result.candidateId, {
              candidateId: result.candidateId,
              candidateName: result.candidate.name,
              party: result.candidate.party,
              color: result.candidate.color || '#3B82F6',
              votes: result.votes,
            });
          }
        }
      }
    }

    // Serialize
    const result = Array.from(areaMap.values()).map((a) => {
      const candidates = Array.from(a.candidateVotes.values()).sort((x, y) => y.votes - x.votes);
      const totalVotes = candidates.reduce((s, c) => s + c.votes, 0);
      return {
        electoralArea: a.electoralArea,
        stationCount: a.stationCount,
        stationsReporting: a.stationsReporting,
        registeredVoters: a.registeredVoters,
        votedVoters: a.votedVoters,
        turnoutPct: a.registeredVoters > 0
          ? Math.round((a.votedVoters / a.registeredVoters) * 1000) / 10
          : 0,
        candidates: candidates.map((c) => ({
          ...c,
          percentage: totalVotes > 0 ? Math.round((c.votes / totalVotes) * 1000) / 10 : 0,
        })),
      };
    });

    // Sort alphabetically; Unassigned last
    result.sort((a, b) => {
      if (a.electoralArea === 'Unassigned') return 1;
      if (b.electoralArea === 'Unassigned') return -1;
      return a.electoralArea.localeCompare(b.electoralArea);
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Electoral area stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch electoral area stats' }, { status: 500 });
  }
}

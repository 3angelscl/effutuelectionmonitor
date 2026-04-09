import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, ApiError } from '@/lib/api-auth';

export async function GET() {
  try {
    await requireAuth();

    // Get all elections with their candidates + results
    const elections = await prisma.election.findMany({
      where: { status: { in: ['COMPLETED', 'ONGOING'] } },
      orderBy: { date: 'asc' },
      include: {
        candidates: {
          include: {
            results: {
              // Include all result types (PROVISIONAL and FINAL)
              select: { votes: true, stationId: true },
            },
          },
        },
      },
    });

    // Aggregate voter counts once (registered voters don't change per election)
    const totalRegistered = await prisma.voter.count({ where: { deletedAt: null } });

    // Aggregate voted counts per election using groupBy
    const electionIds = elections.map((e) => e.id);
    const votedCounts = await prisma.voterTurnout.groupBy({
      by: ['electionId'],
      where: { electionId: { in: electionIds }, hasVoted: true },
      _count: { voterId: true },
    });
    const votedByElection = new Map(votedCounts.map((v) => [v.electionId, v._count.voterId]));

    const trends = elections.map((election) => {
      const totalVoted = votedByElection.get(election.id) ?? 0;
      const turnoutPct = totalRegistered > 0
        ? Math.round((totalVoted / totalRegistered) * 1000) / 10
        : 0;

      const candidateVotes = election.candidates.map((c) => {
        const votes = c.results.reduce((s, r) => s + r.votes, 0);
        return { id: c.id, name: c.name, party: c.party, color: c.color, votes };
      });

      const totalVotes = candidateVotes.reduce((s, c) => s + c.votes, 0);

      return {
        id: election.id,
        name: election.name,
        date: election.date,
        status: election.status,
        turnoutPct,
        totalVoted,
        totalRegistered,
        totalVotes,
        candidateVotes: candidateVotes
          .map((c) => ({
            ...c,
            votePct: totalVotes > 0 ? Math.round((c.votes / totalVotes) * 1000) / 10 : 0,
          }))
          .sort((a, b) => b.votes - a.votes),
      };
    });

    // Build party cross-election trend
    const partyMap: Record<string, { name: string; color: string; elections: { electionId: string; electionName: string; votes: number; votePct: number }[] }> = {};

    for (const election of trends) {
      for (const cv of election.candidateVotes) {
        if (!partyMap[cv.party]) {
          partyMap[cv.party] = { name: cv.party, color: cv.color || '#3B82F6', elections: [] };
        }
        partyMap[cv.party].elections.push({
          electionId: election.id,
          electionName: election.name,
          votes: cv.votes,
          votePct: cv.votePct,
        });
      }
    }

    const partyTrends = Object.values(partyMap).filter((p) => p.elections.length > 0);

    return NextResponse.json({ elections: trends, partyTrends });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Trends error:', error);
    return NextResponse.json({ error: 'Failed to fetch trends' }, { status: 500 });
  }
}

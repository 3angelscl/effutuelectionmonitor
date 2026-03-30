import { NextResponse } from 'next/server';
import { requireAuth, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    await requireAuth();

    // Fetch all elections
    const elections = await prisma.election.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    if (elections.length === 0) {
      return NextResponse.json({ elections: [] });
    }

    // For each election, compute turnout stats
    const electionStats = await Promise.all(
      elections.map(async (election) => {
        // Count total turnout for this election
        const [turnoutCount, totalVoters] = await Promise.all([
          prisma.voterTurnout.count({
            where: { electionId: election.id, hasVoted: true },
          }),
          prisma.voterTurnout.count({
            where: { electionId: election.id },
          }),
        ]);

        // Count results
        const resultAgg = await prisma.electionResult.aggregate({
          where: { electionId: election.id },
          _sum: { votes: true },
        });

        // Count stations with results
        const stationsReporting = await prisma.electionResult.findMany({
          where: { electionId: election.id },
          select: { stationId: true },
          distinct: ['stationId'],
        });

        // Count candidates
        const candidateCount = await prisma.candidate.count({
          where: { electionId: election.id },
        });

        // Get total registered voters (excluding soft-deleted)
        const totalRegistered = await prisma.voter.count({
          where: { deletedAt: null },
        });

        const turnoutPct = totalRegistered > 0
          ? Math.round((turnoutCount / totalRegistered) * 10000) / 100
          : 0;

        return {
          id: election.id,
          name: election.name,
          date: election.date,
          status: election.status,
          isActive: election.isActive,
          totalRegistered,
          totalVoted: turnoutCount,
          totalVotesRecorded: totalVoters,
          totalVotesCast: resultAgg._sum.votes || 0,
          turnoutPercentage: turnoutPct,
          stationsReporting: stationsReporting.length,
          candidateCount,
        };
      })
    );

    return NextResponse.json({ elections: electionStats });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Election compare error:', error);
    return NextResponse.json({ error: 'Failed to compare elections' }, { status: 500 });
  }
}

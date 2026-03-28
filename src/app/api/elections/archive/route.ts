import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, ApiError } from '@/lib/api-auth';

export async function GET() {
  try {
    await requireAuth();

    const elections = await prisma.election.findMany({
      where: { status: 'COMPLETED' },
      orderBy: { date: 'desc' },
      include: {
        candidates: {
          include: {
            results: {
              select: { votes: true, resultType: true },
            },
          },
        },
        _count: {
          select: { results: true, turnout: true },
        },
        turnout: {
          select: { hasVoted: true },
        },
      },
    });

    const data = elections.map((election) => {
      const totalVoted = election.turnout.filter((t) => t.hasVoted).length;
      const totalRegistered = election.turnout.length;
      const turnoutPct = totalRegistered > 0
        ? Math.round((totalVoted / totalRegistered) * 1000) / 10
        : 0;

      // Aggregate votes per candidate (prefer FINAL over PROVISIONAL)
      const candidateResults = election.candidates.map((c) => {
        const finalResult = c.results.find((r) => r.resultType === 'FINAL');
        const provisionalResult = c.results.find((r) => r.resultType === 'PROVISIONAL');
        const votes = finalResult?.votes ?? provisionalResult?.votes ?? 0;
        return { id: c.id, name: c.name, party: c.party, color: c.color, photo: c.photo, votes };
      });

      // Sort by votes descending
      candidateResults.sort((a, b) => b.votes - a.votes);
      const totalVotes = candidateResults.reduce((s, c) => s + c.votes, 0);

      return {
        id: election.id,
        name: election.name,
        description: election.description,
        date: election.date,
        status: election.status,
        createdAt: election.createdAt,
        totalVoted,
        totalRegistered,
        turnoutPct,
        totalVotes,
        candidateResults: candidateResults.map((c) => ({
          ...c,
          votePct: totalVotes > 0 ? Math.round((c.votes / totalVotes) * 1000) / 10 : 0,
        })),
        winner: candidateResults[0] || null,
      };
    });

    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Archive error:', error);
    return NextResponse.json({ error: 'Failed to fetch archives' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';

interface AgeBucket {
  label: string;
  minAge: number;
  maxAge: number;
}

const AGE_BUCKETS: AgeBucket[] = [
  { label: '18-25', minAge: 18, maxAge: 25 },
  { label: '26-35', minAge: 26, maxAge: 35 },
  { label: '36-50', minAge: 36, maxAge: 50 },
  { label: '51-65', minAge: 51, maxAge: 65 },
  { label: '65+', minAge: 66, maxAge: Infinity },
];

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const electionIdParam = searchParams.get('electionId');

    const election = electionIdParam
      ? await prisma.election.findUnique({ where: { id: electionIdParam } })
      : await prisma.election.findFirst({ where: { isActive: true } });

    if (!election) {
      return NextResponse.json(
        {
          ageBuckets: [],
          totalVoters: 0,
          totalVoted: 0,
        },
        { status: 200 }
      );
    }

    const voters = await prisma.voter.findMany({
      select: {
        age: true,
        turnout: {
          where: { electionId: election.id },
          select: { hasVoted: true },
        },
      },
    });

    const bucketCounts = AGE_BUCKETS.map((b) => ({
      label: b.label,
      total: 0,
      voted: 0,
    }));

    let totalVoters = 0;
    let totalVoted = 0;

    for (const voter of voters) {
      totalVoters += 1;
      const hasVoted = voter.turnout.some((t) => t.hasVoted);
      if (hasVoted) totalVoted += 1;

      const age = voter.age;
      for (let i = 0; i < AGE_BUCKETS.length; i++) {
        const bucket = AGE_BUCKETS[i];
        if (age >= bucket.minAge && age <= bucket.maxAge) {
          bucketCounts[i].total += 1;
          if (hasVoted) bucketCounts[i].voted += 1;
          break;
        }
      }
    }

    const ageBuckets = bucketCounts.map((b) => ({
      label: b.label,
      total: b.total,
      voted: b.voted,
      turnoutPct:
        b.total > 0 ? Math.round((b.voted / b.total) * 1000) / 10 : 0,
    }));

    return NextResponse.json({
      ageBuckets,
      totalVoters,
      totalVoted,
    });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Demographics stats error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch demographic stats' },
      { status: 500 }
    );
  }
}

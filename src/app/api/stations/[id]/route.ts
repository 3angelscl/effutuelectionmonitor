import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();

    const { id } = await params;

    // Get active election
    const activeElection = await prisma.election.findFirst({ where: { isActive: true } });

    const station = await prisma.pollingStation.findUnique({
      where: { id },
      include: {
        agent: { select: { id: true, name: true, email: true, phone: true, photo: true } },
        voters: {
          select: {
            id: true,
            voterId: true,
            firstName: true,
            lastName: true,
            age: true,
            photo: true,
            turnout: activeElection
              ? { where: { electionId: activeElection.id }, select: { hasVoted: true, votedAt: true } }
              : undefined,
          },
        },
        results: activeElection
          ? {
              where: { electionId: activeElection.id },
              include: { candidate: true },
            }
          : { include: { candidate: true } },
      },
    });

    if (!station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    // Paginate voters
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const voterSearch = searchParams.get('search') || '';

    let filteredVoters = station.voters;
    if (voterSearch) {
      const q = voterSearch.toLowerCase();
      filteredVoters = filteredVoters.filter(
        (v) =>
          v.voterId.toLowerCase().includes(q) ||
          v.firstName.toLowerCase().includes(q) ||
          v.lastName.toLowerCase().includes(q)
      );
    }

    const totalVoters = filteredVoters.length;
    const totalVoted = station.voters.filter((v) => v.turnout?.some((t) => t.hasVoted)).length;
    const paginatedVoters = filteredVoters.slice((page - 1) * limit, page * limit);

    const totalResults = station.results.reduce((sum, r) => sum + r.votes, 0);

    // Last activity - check activity logs for this station's agent
    let lastActivity = null;
    if (station.agent) {
      const lastLog = await prisma.activityLog.findFirst({
        where: { userId: station.agent.id },
        orderBy: { createdAt: 'desc' },
      });
      if (lastLog) {
        lastActivity = lastLog.createdAt;
      }
    }

    // Determine results status and type
    const resultsStatus = station.results.length > 0 ? 'SUBMITTED' : 'PENDING';
    const resultType = station.results.length > 0
      ? (station.results.every((r) => r.resultType === 'FINAL') ? 'FINAL' : 'PROVISIONAL')
      : null;

    return NextResponse.json({
      station: {
        id: station.id,
        psCode: station.psCode,
        name: station.name,
        location: station.location,
        latitude: station.latitude,
        longitude: station.longitude,
      },
      agent: station.agent,
      stats: {
        totalRegistered: station.voters.length,
        totalVoted,
        turnoutPercentage: station.voters.length > 0
          ? Math.round((totalVoted / station.voters.length) * 1000) / 10
          : 0,
        lastActivity,
        resultsStatus,
        resultType,
      },
      voters: paginatedVoters.map((v) => ({
        id: v.id,
        voterId: v.voterId,
        firstName: v.firstName,
        lastName: v.lastName,
        age: v.age,
        photo: v.photo,
        hasVoted: v.turnout?.some((t) => t.hasVoted) || false,
      })),
      totalVoters,
      voterPage: page,
      voterTotalPages: Math.ceil(totalVoters / limit),
      results: station.results
        .map((r) => ({
          candidateId: r.candidateId,
          candidateName: r.candidate.name,
          party: r.candidate.party,
          partyFull: r.candidate.partyFull,
          color: r.candidate.color,
          votes: r.votes,
          percentage: totalResults > 0 ? Math.round((r.votes / totalResults) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.votes - a.votes),
      totalVotes: totalResults,
    });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Station detail error:', error);
    return NextResponse.json({ error: 'Failed to fetch station details' }, { status: 500 });
  }
}

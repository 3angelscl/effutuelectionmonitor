import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const electionId = searchParams.get('electionId');

    // If no electionId provided, use the active election
    let activeElectionId = electionId;
    if (!activeElectionId) {
      const active = await prisma.election.findFirst({ where: { isActive: true } });
      if (!active) {
        return NextResponse.json({
          totalRegisteredVoters: 0,
          totalVoted: 0,
          turnoutPercentage: 0,
          totalStations: 0,
          stationsReporting: 0,
          stationsCompleted: 0,
          candidateResults: [],
          stations: [],
          election: null,
        });
      }
      activeElectionId = active.id;
    }

    const election = await prisma.election.findUnique({ where: { id: activeElectionId } });

    // Fetch stations with agent info only (not all voters)
    const stations = await prisma.pollingStation.findMany({
      include: {
        agent: { select: { name: true } },
        results: {
          where: { electionId: activeElectionId },
          include: { candidate: true },
        },
      },
      orderBy: { psCode: 'asc' },
    });

    // Use aggregate counts instead of loading all voter records
    const stationIds = stations.map((s) => s.id);

    // Count registered voters per station — exclude soft-deleted records
    const registeredCounts = await prisma.voter.groupBy({
      by: ['stationId'],
      where: { stationId: { in: stationIds }, deletedAt: null },
      _count: { id: true },
    });
    const registeredMap = new Map(registeredCounts.map((r) => [r.stationId, r._count.id]));

    // Count voted per station (via turnout)
    const votedCounts = await prisma.voterTurnout.groupBy({
      by: ['voterId'],
      where: {
        electionId: activeElectionId,
        hasVoted: true,
        voter: { stationId: { in: stationIds } },
      },
    });

    // We need voter->station mapping for turnout counts
    // Get unique voterIds that voted, then group by station
    const votedVoterIds = votedCounts.map((v) => v.voterId);
    let votedByStation = new Map<string, number>();

    if (votedVoterIds.length > 0) {
      // Process in batches to avoid oversized IN clauses
      const batchSize = 1000;
      for (let i = 0; i < votedVoterIds.length; i += batchSize) {
        const batch = votedVoterIds.slice(i, i + batchSize);
        const voterStations = await prisma.voter.findMany({
          where: { id: { in: batch } },
          select: { stationId: true },
        });
        for (const vs of voterStations) {
          votedByStation.set(vs.stationId, (votedByStation.get(vs.stationId) || 0) + 1);
        }
      }
    }

    const candidates = await prisma.candidate.findMany({
      where: { electionId: activeElectionId },
      orderBy: { party: 'asc' },
    });

    let totalRegistered = 0;
    let totalVoted = 0;
    let stationsReporting = 0;
    let stationsCompleted = 0;

    const stationStats = stations.map((station) => {
      const registered = registeredMap.get(station.id) || 0;
      const voted = votedByStation.get(station.id) || 0;
      totalRegistered += registered;
      totalVoted += voted;

      const hasResults = station.results.length > 0;
      const hasVotes = voted > 0;
      const resultType = hasResults
        ? (station.results.every((r) => r.resultType === 'FINAL') ? 'FINAL' : 'PROVISIONAL')
        : null;

      if (hasResults) {
        stationsReporting++;
        stationsCompleted++;
      } else if (hasVotes) {
        stationsReporting++;
      }

      return {
        psCode: station.psCode,
        name: station.name,
        location: station.location,
        latitude: station.latitude,
        longitude: station.longitude,
        status: hasResults ? 'COMPLETED' : hasVotes ? 'ACTIVE' : 'PENDING',
        resultType,
        totalRegistered: registered,
        totalVoted: voted,
        turnoutPercentage: registered > 0 ? Math.round((voted / registered) * 1000) / 10 : 0,
        agentName: station.agent?.name || null,
      };
    });

    // Build vote totals map from all station results
    const voteTotalsMap = new Map<string, number>();
    stations.forEach((station) => {
      station.results.forEach((r) => {
        voteTotalsMap.set(r.candidateId, (voteTotalsMap.get(r.candidateId) || 0) + r.votes);
      });
    });

    // Total valid votes = sum of all votes from submitted election results
    const totalValidVotes = Array.from(voteTotalsMap.values()).reduce((sum, v) => sum + v, 0);

    const candidateResults = candidates.map((candidate) => {
      const totalVotes = voteTotalsMap.get(candidate.id) || 0;
      return {
        candidateId: candidate.id,
        candidateName: candidate.name,
        party: candidate.party,
        partyFull: candidate.partyFull,
        color: candidate.color || '#3B82F6',
        totalVotes,
        percentage: totalValidVotes > 0 ? Math.round((totalVotes / totalValidVotes) * 1000) / 10 : 0,
      };
    });

    // Vote discrepancy detection
    const discrepancies: {
      psCode: string;
      stationName: string;
      type: string;
      severity: 'HIGH' | 'MEDIUM' | 'LOW';
      message: string;
      details: Record<string, number>;
    }[] = [];

    stations.forEach((station) => {
      const registered = registeredMap.get(station.id) || 0;
      const voted = votedByStation.get(station.id) || 0;
      const totalVotesCast = station.results.reduce((sum, r) => sum + r.votes, 0);
      const hasResults = station.results.length > 0;
      const turnoutPct = registered > 0 ? (voted / registered) * 100 : 0;

      // Total votes from results exceed registered voters
      if (hasResults && totalVotesCast > registered && registered > 0) {
        discrepancies.push({
          psCode: station.psCode,
          stationName: station.name,
          type: 'VOTES_EXCEED_REGISTERED',
          severity: 'HIGH',
          message: `Total votes cast (${totalVotesCast}) exceeds registered voters (${registered})`,
          details: { totalVotesCast, registered, difference: totalVotesCast - registered },
        });
      }

      // Total votes from results exceed turnout count
      if (hasResults && totalVotesCast > voted && voted > 0) {
        discrepancies.push({
          psCode: station.psCode,
          stationName: station.name,
          type: 'VOTES_EXCEED_TURNOUT',
          severity: 'HIGH',
          message: `Total votes cast (${totalVotesCast}) exceeds checked-in voters (${voted})`,
          details: { totalVotesCast, turnoutCount: voted, difference: totalVotesCast - voted },
        });
      }

      // Suspiciously high turnout (>95%)
      if (registered >= 10 && turnoutPct > 95) {
        discrepancies.push({
          psCode: station.psCode,
          stationName: station.name,
          type: 'HIGH_TURNOUT',
          severity: 'MEDIUM',
          message: `Unusually high turnout: ${turnoutPct.toFixed(1)}% (${voted}/${registered})`,
          details: { turnoutPercentage: Math.round(turnoutPct * 10) / 10, voted, registered },
        });
      }

      // Suspiciously low turnout when station has results
      if (hasResults && registered >= 10 && turnoutPct < 5) {
        discrepancies.push({
          psCode: station.psCode,
          stationName: station.name,
          type: 'LOW_TURNOUT',
          severity: 'MEDIUM',
          message: `Unusually low turnout: ${turnoutPct.toFixed(1)}% (${voted}/${registered}) despite having results`,
          details: { turnoutPercentage: Math.round(turnoutPct * 10) / 10, voted, registered },
        });
      }
    });

    // Determine overall result type
    const stationsWithResults = stationStats.filter((s) => s.resultType !== null);
    const allFinal = stationsWithResults.length > 0 && stationsWithResults.every((s) => s.resultType === 'FINAL');
    const overallResultType = stationsWithResults.length === 0
      ? null
      : allFinal && stationsCompleted === stations.length
        ? 'FINAL'
        : 'PROVISIONAL';

    return NextResponse.json({
      totalRegisteredVoters: totalRegistered,
      totalVoted,
      totalValidVotes,
      turnoutPercentage: totalRegistered > 0 ? Math.round((totalVoted / totalRegistered) * 1000) / 10 : 0,
      totalStations: stations.length,
      stationsReporting,
      stationsCompleted,
      candidateResults: candidateResults.sort((a, b) => b.totalVotes - a.totalVotes),
      stations: stationStats,
      election,
      overallResultType,
      discrepancies,
      favCandidate1: candidateResults.find(c => c.candidateId === election?.favCandidate1Id) || null,
      favCandidate2: candidateResults.find(c => c.candidateId === election?.favCandidate2Id) || null,
    });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}

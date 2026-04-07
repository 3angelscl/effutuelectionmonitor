import prisma from '@/lib/prisma';

interface LiveSummaryPayload {
  totalRegisteredVoters: number;
  totalVoted: number;
  totalValidVotes: number;
  turnoutPercentage: number;
  totalStations: number;
  stationsReporting: number;
  stationsCompleted: number;
  stations: Array<{
    psCode: string;
    name: string;
    location: string | null;
    latitude: number | null;
    longitude: number | null;
    status: string;
    resultType: string | null;
    totalRegistered: number;
    totalVoted: number;
    turnoutPercentage: number;
    agentName: string | null;
  }>;
  election: {
    id: string;
    name: string;
    description: string | null;
    date: Date | null;
    isActive: boolean;
    status: string;
  } | null;
}

interface CacheEntry {
  expiresAt: number;
  value: LiveSummaryPayload;
}

const CACHE_TTL_MS = 10_000;

const globalForLiveSummary = globalThis as unknown as {
  liveSummaryCache: Map<string, CacheEntry> | undefined;
  liveSummaryInflight: Map<string, Promise<LiveSummaryPayload>> | undefined;
};

if (!globalForLiveSummary.liveSummaryCache) {
  globalForLiveSummary.liveSummaryCache = new Map();
}

if (!globalForLiveSummary.liveSummaryInflight) {
  globalForLiveSummary.liveSummaryInflight = new Map();
}

const liveSummaryCache = globalForLiveSummary.liveSummaryCache;
const liveSummaryInflight = globalForLiveSummary.liveSummaryInflight;

function getCacheKey(electionId: string | null) {
  return electionId ?? '__active__';
}

async function resolveElectionId(explicitElectionId?: string | null) {
  if (explicitElectionId) return explicitElectionId;

  const active = await prisma.election.findFirst({
    where: { isActive: true },
    select: { id: true },
  });

  return active?.id ?? null;
}

async function computeLiveSummary(electionId: string): Promise<LiveSummaryPayload> {
  const [election, stations, validVoteAggregate] = await Promise.all([
    prisma.election.findUnique({
      where: { id: electionId },
      select: {
        id: true,
        name: true,
        description: true,
        date: true,
        isActive: true,
        status: true,
      },
    }),
    prisma.pollingStation.findMany({
      include: {
        agent: { select: { name: true } },
        results: {
          where: { electionId },
          select: { resultType: true },
        },
      },
      orderBy: { psCode: 'asc' },
    }),
    prisma.electionResult.aggregate({
      where: { electionId },
      _sum: { votes: true },
    }),
  ]);

  const stationIds = stations.map((station) => station.id);

  const [registeredCounts, votedCounts] = await Promise.all([
    prisma.voter.groupBy({
      by: ['stationId'],
      where: {
        stationId: { in: stationIds },
        deletedAt: null,
      },
      _count: { id: true },
    }),
    prisma.voter.groupBy({
      by: ['stationId'],
      where: {
        stationId: { in: stationIds },
        deletedAt: null,
        turnout: {
          some: {
            electionId,
            hasVoted: true,
          },
        },
      },
      _count: { id: true },
    }),
  ]);

  const registeredMap = new Map(registeredCounts.map((row) => [row.stationId, row._count.id]));
  const votedMap = new Map(votedCounts.map((row) => [row.stationId, row._count.id]));

  let totalRegistered = 0;
  let totalVoted = 0;
  let stationsReporting = 0;
  let stationsCompleted = 0;

  const stationStats = stations.map((station) => {
    const registered = registeredMap.get(station.id) || 0;
    const voted = votedMap.get(station.id) || 0;
    totalRegistered += registered;
    totalVoted += voted;

    const hasResults = station.results.length > 0;
    const hasVotes = voted > 0;
    const resultType = hasResults
      ? (station.results.every((result) => result.resultType === 'FINAL') ? 'FINAL' : 'PROVISIONAL')
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

  return {
    totalRegisteredVoters: totalRegistered,
    totalVoted,
    totalValidVotes: validVoteAggregate._sum.votes || 0,
    turnoutPercentage: totalRegistered > 0 ? Math.round((totalVoted / totalRegistered) * 1000) / 10 : 0,
    totalStations: stations.length,
    stationsReporting,
    stationsCompleted,
    stations: stationStats,
    election,
  };
}

export async function getLiveSummary(electionId?: string | null): Promise<LiveSummaryPayload> {
  const resolvedElectionId = await resolveElectionId(electionId);

  if (!resolvedElectionId) {
    return {
      totalRegisteredVoters: 0,
      totalVoted: 0,
      totalValidVotes: 0,
      turnoutPercentage: 0,
      totalStations: 0,
      stationsReporting: 0,
      stationsCompleted: 0,
      stations: [],
      election: null,
    };
  }

  const key = getCacheKey(resolvedElectionId);
  const now = Date.now();
  const cached = liveSummaryCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const inflight = liveSummaryInflight.get(key);
  if (inflight) {
    return inflight;
  }

  const request = computeLiveSummary(resolvedElectionId)
    .then((value) => {
      liveSummaryCache.set(key, {
        value,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return value;
    })
    .finally(() => {
      liveSummaryInflight.delete(key);
    });

  liveSummaryInflight.set(key, request);
  return request;
}

export async function invalidateLiveSummary(electionId?: string | null) {
  if (!electionId) {
    liveSummaryCache.clear();
    liveSummaryInflight.clear();
    return;
  }

  const resolvedElectionId = await resolveElectionId(electionId);
  const key = getCacheKey(resolvedElectionId);
  liveSummaryCache.delete(key);
  liveSummaryInflight.delete(key);
}

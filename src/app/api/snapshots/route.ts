import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';

export async function POST() {
  try {
    await requireRole(['ADMIN', 'OFFICER']);

    const activeElection = await prisma.election.findFirst({ where: { isActive: true } });
    if (!activeElection) {
      return NextResponse.json({ error: 'No active election' }, { status: 400 });
    }

    // Use aggregate queries — never loads individual voter records into memory
    const [registeredByStation, votedByStation, allStations] = await Promise.all([
      // Registered voters per station (excluding soft-deleted)
      prisma.voter.groupBy({
        by: ['stationId'],
        where: { deletedAt: null },
        _count: { id: true },
      }),
      // Voted voters per station via turnout join
      prisma.voterTurnout.groupBy({
        by: ['electionId'],
        where: { electionId: activeElection.id, hasVoted: true },
        _count: { voterId: true },
      }),
      // All station IDs
      prisma.pollingStation.findMany({ select: { id: true } }),
    ]);

    // Build per-station voted counts by querying through voters
    const votedVotersByStation = await prisma.voter.groupBy({
      by: ['stationId'],
      where: {
        deletedAt: null,
        turnout: { some: { electionId: activeElection.id, hasVoted: true } },
      },
      _count: { id: true },
    });

    const registeredMap = new Map(registeredByStation.map((r) => [r.stationId, r._count.id]));
    const votedMap = new Map(votedVotersByStation.map((v) => [v.stationId, v._count.id]));

    const snapshots = [];
    let overallVoted = 0;
    let overallRegistered = 0;

    for (const station of allStations) {
      const totalRegistered = registeredMap.get(station.id) ?? 0;
      const totalVoted = votedMap.get(station.id) ?? 0;

      overallRegistered += totalRegistered;
      overallVoted += totalVoted;

      snapshots.push({
        electionId: activeElection.id,
        stationId: station.id,
        totalVoted,
        totalRegistered,
      });
    }

    // Overall snapshot (stationId = null)
    snapshots.push({
      electionId: activeElection.id,
      stationId: null,
      totalVoted: overallVoted,
      totalRegistered: overallRegistered,
    });

    // Create all snapshots in a transaction
    await prisma.$transaction(
      snapshots.map((s) => prisma.turnoutSnapshot.create({ data: s }))
    );

    return NextResponse.json({
      message: 'Snapshot recorded',
      totalStations: allStations.length,
      overallVoted,
      overallRegistered,
    });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Snapshot POST error:', error);
    return NextResponse.json({ error: 'Failed to record snapshot' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const activeElection = await prisma.election.findFirst({ where: { isActive: true } });
    if (!activeElection) {
      return NextResponse.json([], { status: 200 });
    }

    const { searchParams } = new URL(request.url);
    const hours = parseInt(searchParams.get('hours') || '24', 10);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Fetch overall snapshots (stationId = null) within the time range
    const snapshots = await prisma.turnoutSnapshot.findMany({
      where: {
        electionId: activeElection.id,
        stationId: null,
        timestamp: { gte: since },
      },
      orderBy: { timestamp: 'asc' },
    });

    if (snapshots.length === 0) {
      return NextResponse.json([]);
    }

    // Group by ~15 minute intervals
    const grouped: Map<string, { totalVoted: number; totalRegistered: number; timestamp: Date; count: number }> = new Map();

    for (const snap of snapshots) {
      const t = snap.timestamp.getTime();
      // Round down to nearest 15-minute interval
      const intervalMs = 15 * 60 * 1000;
      const intervalStart = new Date(Math.floor(t / intervalMs) * intervalMs);
      const key = intervalStart.toISOString();

      const existing = grouped.get(key);
      if (existing) {
        // Use the latest snapshot in each interval
        if (snap.timestamp > existing.timestamp) {
          existing.totalVoted = snap.totalVoted;
          existing.totalRegistered = snap.totalRegistered;
          existing.timestamp = snap.timestamp;
        }
        existing.count++;
      } else {
        grouped.set(key, {
          totalVoted: snap.totalVoted,
          totalRegistered: snap.totalRegistered,
          timestamp: snap.timestamp,
          count: 1,
        });
      }
    }

    const result = Array.from(grouped.values()).map((g) => ({
      timestamp: g.timestamp.toISOString(),
      totalVoted: g.totalVoted,
      totalRegistered: g.totalRegistered,
      turnoutPercentage: g.totalRegistered > 0
        ? Math.round((g.totalVoted / g.totalRegistered) * 10000) / 100
        : 0,
    }));

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Snapshot GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch snapshots' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import { broadcastEventThrottled } from '@/lib/events';
import { parseBody, turnoutMarkSchema, ValidationError } from '@/lib/validations';

// In-memory throttle for snapshot creation — prevents duplicate snapshots
// from concurrent turnout requests (survives hot-reloads via globalThis).
const globalForSnapshot = globalThis as unknown as { snapshotThrottleTimers: Map<string, number> | undefined };
if (!globalForSnapshot.snapshotThrottleTimers) {
  globalForSnapshot.snapshotThrottleTimers = new Map();
}
const snapshotThrottleTimers = globalForSnapshot.snapshotThrottleTimers;

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireRole(['ADMIN', 'AGENT']);

    let body: { voterId: string; hasVoted: boolean; stationId?: string; notes?: string };
    try {
      body = await parseBody(request, turnoutMarkSchema);
    } catch (err) {
      if (err instanceof ValidationError) return err.toResponse();
      throw err;
    }

    const { voterId, hasVoted, stationId } = body;

    // Get active election
    const activeElection = await prisma.election.findFirst({ where: { isActive: true } });
    if (!activeElection) {
      return NextResponse.json({ error: 'No active election' }, { status: 400 });
    }

    // Find the voter
    let voter;
    if (stationId) {
      voter = await prisma.voter.findFirst({
        where: { voterId, stationId },
        include: { pollingStation: true },
      });
    } else {
      voter = await prisma.voter.findFirst({
        where: { voterId },
        include: { pollingStation: true },
      });
    }

    if (!voter) {
      return NextResponse.json({ error: 'Voter not found' }, { status: 404 });
    }

    // If agent, verify they are assigned to this polling station
    if (user.role === 'AGENT') {
      if (voter.pollingStation.agentId !== user.id) {
        return NextResponse.json({ error: 'Not authorized for this polling station' }, { status: 403 });
      }
    }

    // Upsert VoterTurnout record for this election
    const turnout = await prisma.voterTurnout.upsert({
      where: {
        voterId_electionId: {
          voterId: voter.id,
          electionId: activeElection.id,
        },
      },
      update: {
        hasVoted,
        votedAt: hasVoted ? new Date() : null,
        markedById: hasVoted ? user.id : null,
      },
      create: {
        voterId: voter.id,
        electionId: activeElection.id,
        hasVoted,
        votedAt: hasVoted ? new Date() : null,
        markedById: hasVoted ? user.id : null,
      },
    });

    // Broadcast turnout update — throttled to once per 5 s per election to
    // prevent O(votes × viewers) server fan-out under concurrent agent load.
    broadcastEventThrottled('turnout:updated', {
      stationId: voter.stationId,
      electionId: activeElection.id,
    }, { intervalMs: 5000, key: activeElection.id });

    // Take turnout snapshot (throttled in-memory to every 15 min per election
    // to avoid duplicate snapshots from concurrent requests)
    const snapshotKey = `snapshot:${activeElection.id}`;
    const SNAPSHOT_INTERVAL = 15 * 60 * 1000;
    const lastSnapshotTime = snapshotThrottleTimers.get(snapshotKey) ?? 0;
    if (Date.now() - lastSnapshotTime > SNAPSHOT_INTERVAL) {
      snapshotThrottleTimers.set(snapshotKey, Date.now());
      const [votedCount, registeredCount] = await Promise.all([
        prisma.voterTurnout.count({ where: { electionId: activeElection.id, hasVoted: true } }),
        // Exclude soft-deleted voters so snapshot counts are accurate
        prisma.voter.count({ where: { deletedAt: null } }),
      ]);
      await prisma.turnoutSnapshot.create({
        data: { electionId: activeElection.id, totalVoted: votedCount, totalRegistered: registeredCount },
      });
    }

    return NextResponse.json({
      ...voter,
      hasVoted: turnout.hasVoted,
      votedAt: turnout.votedAt,
    });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Turnout error:', error);
    return NextResponse.json({ error: 'Failed to update turnout' }, { status: 500 });
  }
}

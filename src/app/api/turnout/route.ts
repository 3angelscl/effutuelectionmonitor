import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import { broadcastEventThrottled } from '@/lib/events';
import { invalidateLiveSummary } from '@/lib/live-summary';
import { parseBody, turnoutMarkSchema, ValidationError } from '@/lib/validations';

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

    const activeElection = await prisma.election.findFirst({ where: { isActive: true } });
    if (!activeElection) {
      return NextResponse.json({ error: 'No active election' }, { status: 400 });
    }

    const voter = stationId
      ? await prisma.voter.findFirst({
          where: { voterId, stationId },
          include: { pollingStation: true },
        })
      : await prisma.voter.findFirst({
          where: { voterId },
          include: { pollingStation: true },
        });

    if (!voter) {
      return NextResponse.json({ error: 'Voter not found' }, { status: 404 });
    }

    if (user.role === 'AGENT') {
      if (voter.pollingStation.agentId !== user.id) {
        return NextResponse.json({ error: 'Not authorized for this polling station' }, { status: 403 });
      }

      const latestCheckIn = await prisma.agentCheckIn.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });

      if (!latestCheckIn || latestCheckIn.type !== 'CHECK_IN') {
        return NextResponse.json(
          { error: 'You must check in at your polling station before recording turnout' },
          { status: 403 }
        );
      }
    }

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

    await invalidateLiveSummary(activeElection.id);

    broadcastEventThrottled(
      'turnout:updated',
      {
        stationId: voter.stationId,
        electionId: activeElection.id,
      },
      { intervalMs: 5000, key: activeElection.id }
    );

    const snapshotKey = `snapshot:${activeElection.id}`;
    const snapshotInterval = 15 * 60 * 1000;
    const lastSnapshotTime = snapshotThrottleTimers.get(snapshotKey) ?? 0;

    if (Date.now() - lastSnapshotTime > snapshotInterval) {
      snapshotThrottleTimers.set(snapshotKey, Date.now());
      const [votedCount, registeredCount] = await Promise.all([
        prisma.voterTurnout.count({ where: { electionId: activeElection.id, hasVoted: true } }),
        prisma.voter.count({ where: { deletedAt: null } }),
      ]);

      await prisma.turnoutSnapshot.create({
        data: {
          electionId: activeElection.id,
          totalVoted: votedCount,
          totalRegistered: registeredCount,
        },
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

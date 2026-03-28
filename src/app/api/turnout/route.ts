import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import { broadcastEvent } from '@/lib/events';

export async function PATCH(request: NextRequest) {
  try {
    const { user } = await requireRole(['ADMIN', 'AGENT']);

    const body = await request.json();
    const { voterId, hasVoted, stationId } = body;

    if (!voterId || typeof hasVoted !== 'boolean') {
      return NextResponse.json({ error: 'voterId and hasVoted are required' }, { status: 400 });
    }

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

    // Broadcast turnout update event
    broadcastEvent('turnout:updated', {
      voterId: voter.id,
      stationId: voter.stationId,
      hasVoted,
      electionId: activeElection.id,
    });

    // Take turnout snapshot (throttled to every 15 min)
    const lastSnapshot = await prisma.turnoutSnapshot.findFirst({
      where: { electionId: activeElection.id, stationId: null },
      orderBy: { timestamp: 'desc' },
    });
    const shouldSnapshot = !lastSnapshot || (Date.now() - lastSnapshot.timestamp.getTime()) > 15 * 60 * 1000;
    if (shouldSnapshot) {
      const [votedCount, registeredCount] = await Promise.all([
        prisma.voterTurnout.count({ where: { electionId: activeElection.id, hasVoted: true } }),
        prisma.voter.count(),
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

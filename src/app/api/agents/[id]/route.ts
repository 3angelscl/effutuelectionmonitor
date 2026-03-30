import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(['ADMIN', 'OFFICER']);

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20') || 20));

    const agent = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        photo: true,
        role: true,
        createdAt: true,
        assignedStations: {
          select: { id: true, psCode: true, name: true },
        },
      },
    });

    if (!agent || agent.role !== 'AGENT') {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    // Get active election for stats
    const activeElection = await prisma.election.findFirst({ where: { isActive: true } });

    // Count voters checked in by this agent
    let votersCheckedIn = 0;
    if (activeElection) {
      votersCheckedIn = await prisma.voterTurnout.count({
        where: {
          markedById: id,
          electionId: activeElection.id,
          hasVoted: true,
        },
      });
    }

    // Get activity logs with pagination
    const [logs, totalLogs] = await Promise.all([
      prisma.activityLog.findMany({
        where: { userId: id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.activityLog.count({ where: { userId: id } }),
    ]);

    // Get last activity (from full history, not just current page)
    const lastLog = await prisma.activityLog.findFirst({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
    });

    // Check if agent has an active session (logged in but not logged out within last 12 hours)
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
    const recentLogs = await prisma.activityLog.findMany({
      where: {
        userId: id,
        createdAt: { gte: twelveHoursAgo },
        type: { in: ['LOGIN', 'LOGOUT', 'STATION_ARRIVAL', 'VOTER_CHECKIN', 'RESULTS_SUBMITTED'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    // Agent is online if their most recent session-related activity is not a LOGOUT
    // and happened within the last 30 minutes, OR they have a check-in without check-out
    const lastSessionLog = recentLogs[0];
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
    const isOnline = lastSessionLog
      ? lastSessionLog.type !== 'LOGOUT' && new Date(lastSessionLog.createdAt) > thirtyMinAgo
      : false;

    return NextResponse.json({
      agent,
      stats: {
        votersCheckedIn,
        lastActivity: lastLog?.createdAt || null,
        lastActivityTitle: lastLog?.title || null,
        isOnline,
      },
      logs,
      totalLogs,
      page,
      totalPages: Math.ceil(totalLogs / limit),
    });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Agent detail error:', error);
    return NextResponse.json({ error: 'Failed to fetch agent details' }, { status: 500 });
  }
}

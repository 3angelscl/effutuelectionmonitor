import { NextResponse } from 'next/server';
import { requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    await requireRole(['ADMIN', 'OFFICER']);

    const agents = await prisma.user.findMany({
      where: { role: 'AGENT' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        photo: true,
        assignedStations: {
          select: { id: true, psCode: true, name: true },
        },
      },
    });

    const agentIds = agents.map((a) => a.id);

    // Get recent check-ins for all agents (last 30 days, max 500)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const checkIns = await prisma.agentCheckIn.findMany({
      where: { userId: { in: agentIds }, createdAt: { gte: thirtyDaysAgo } },
      orderBy: { createdAt: 'desc' },
      select: { userId: true, type: true, createdAt: true },
      take: 500,
    });

    // Use aggregate counts instead of loading all rows
    const activityCounts = await prisma.activityLog.groupBy({
      by: ['userId'],
      where: { userId: { in: agentIds } },
      _count: { id: true },
    });

    // Get results submitted by agents (aggregated)
    const resultCounts = await prisma.electionResult.groupBy({
      by: ['submittedById'],
      where: { submittedById: { in: agentIds } },
      _count: { id: true },
    });

    // Get voter turnout counts marked by agents (aggregated)
    const turnoutCounts = await prisma.voterTurnout.groupBy({
      by: ['markedById'],
      where: { markedById: { in: agentIds }, hasVoted: true },
      _count: { id: true },
    });

    // Build lookup maps
    const checkInMap = new Map<string, typeof checkIns>();
    for (const ci of checkIns) {
      const list = checkInMap.get(ci.userId) || [];
      list.push(ci);
      checkInMap.set(ci.userId, list);
    }

    const activityMap = new Map<string, number>();
    for (const ac of activityCounts) {
      activityMap.set(ac.userId, ac._count.id);
    }

    const resultsMap = new Map<string, number>();
    for (const r of resultCounts) {
      resultsMap.set(r.submittedById, r._count.id);
    }

    const turnoutMap = new Map<string, number>();
    for (const t of turnoutCounts) {
      if (t.markedById) {
        turnoutMap.set(t.markedById, t._count.id);
      }
    }

    const performance = agents.map((agent) => {
      const agentCheckIns = checkInMap.get(agent.id) || [];
      const latestCheckIn = agentCheckIns[0] || null;
      const isCheckedIn = latestCheckIn?.type === 'CHECK_IN';
      const totalCheckIns = agentCheckIns.filter((ci) => ci.type === 'CHECK_IN').length;
      const activityCount = activityMap.get(agent.id) || 0;
      const resultsSubmitted = resultsMap.get(agent.id) || 0;
      const votersProcessed = turnoutMap.get(agent.id) || 0;
      const isAssigned = agent.assignedStations.length > 0;

      // Performance score: weighted combination with breakdown
      const scoreBreakdown = {
        assigned: isAssigned ? 20 : 0,
        checkedIn: isCheckedIn ? 25 : 0,
        checkInHistory: totalCheckIns > 0 ? 15 : 0,
        resultsSubmitted: resultsSubmitted > 0 ? 20 : 0,
        votersProcessed: votersProcessed > 0 ? Math.min(20, votersProcessed) : 0,
      };
      const score = scoreBreakdown.assigned + scoreBreakdown.checkedIn +
        scoreBreakdown.checkInHistory + scoreBreakdown.resultsSubmitted +
        scoreBreakdown.votersProcessed;

      return {
        id: agent.id,
        name: agent.name,
        email: agent.email,
        phone: agent.phone,
        photo: agent.photo,
        station: agent.assignedStations[0] || null,
        isCheckedIn,
        lastCheckIn: latestCheckIn?.createdAt || null,
        totalCheckIns,
        activityCount,
        resultsSubmitted,
        votersProcessed,
        performanceScore: Math.min(100, score),
        scoreBreakdown,
      };
    });

    // Summary stats
    const totalAgents = agents.length;
    const checkedInCount = performance.filter((p) => p.isCheckedIn).length;
    const assignedCount = performance.filter((p) => p.station).length;
    const avgScore = totalAgents > 0
      ? Math.round(performance.reduce((sum, p) => sum + p.performanceScore, 0) / totalAgents)
      : 0;

    return NextResponse.json({
      summary: {
        totalAgents,
        checkedIn: checkedInCount,
        assigned: assignedCount,
        averageScore: avgScore,
      },
      agents: performance,
    });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Performance API error:', error);
    return NextResponse.json({ error: 'Failed to fetch performance data' }, { status: 500 });
  }
}

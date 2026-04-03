import { NextResponse } from 'next/server';
import { requireRole, apiHandler } from '@/lib/api-auth';
import prisma from '@/lib/prisma';

/**
 * GET /api/stats/agents/checkedin
 * Returns the count of agents whose most recent check-in record is CHECK_IN.
 * Used by the Messages page to show how many agents are currently on field.
 */
export const GET = apiHandler(async () => {
  await requireRole(['ADMIN', 'OFFICER']);

  // Get the most recent check-in record per agent (distinct on userId, ordered by latest)
  const latestPerAgent = await prisma.agentCheckIn.findMany({
    orderBy: { createdAt: 'desc' },
    distinct: ['userId'],
    select: { type: true },
  });

  const count = latestPerAgent.filter((c) => c.type === 'CHECK_IN').length;
  return NextResponse.json({ count });
});

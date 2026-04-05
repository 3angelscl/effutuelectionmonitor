import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole, apiHandler } from '@/lib/api-auth';
import { parseBody, resultSubmitSchema } from '@/lib/validations';
import { submitResults } from '@/services/election-results';

export const GET = apiHandler(async (request: Request) => {
  await requireAuth();

  const { searchParams } = new URL(request.url);
  const stationId = searchParams.get('stationId') || '';
  let electionId = searchParams.get('electionId') || '';

  if (!electionId) {
    const active = await prisma.election.findFirst({ where: { isActive: true } });
    electionId = active?.id || '';
  }

  const where: Record<string, string> = {};
  if (stationId) where.stationId = stationId;
  if (electionId) where.electionId = electionId;

  const results = await prisma.electionResult.findMany({
    where,
    include: {
      candidate: true,
      pollingStation: { select: { name: true, psCode: true } },
    },
    orderBy: { votes: 'desc' },
  });

  return NextResponse.json(results);
});

export const POST = apiHandler(async (request: Request) => {
  const { user } = await requireRole(['ADMIN', 'AGENT']);
  const data = await parseBody(request, resultSubmitSchema);

  await submitResults({
    stationId: data.stationId,
    results: data.results,
    resultType: data.resultType,
    adminOverride: data.adminOverride,
    user,
  });

  return NextResponse.json({ success: true });
});

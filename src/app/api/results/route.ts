import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole, apiHandler } from '@/lib/api-auth';
import { parseBody, resultSubmitSchema } from '@/lib/validations';
import { submitResults } from '@/services/election-results';
import { sendResultsSubmittedEmail } from '@/lib/email';
import { notifyAdmins } from '@/lib/notify';

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

  const outcome = await submitResults({
    stationId: data.stationId,
    results: data.results,
    resultType: data.resultType,
    adminOverride: data.adminOverride,
    user,
  });

  // Fire-and-forget: in-app notification + push + email to all ADMIN users
  notifyAdmins({
    type: 'RESULT_SUBMITTED',
    title: `Results submitted — ${outcome.stationCode}`,
    message: `${user.name} submitted ${data.resultType} results (${outcome.totalVotes.toLocaleString()} votes)`,
    link: '/admin/results',
    push: {
      title: `Results: ${outcome.stationCode}`,
      body: `${user.name} submitted ${data.resultType.toLowerCase()} results`,
      url: '/admin/results',
    },
  }).catch(() => {});

  Promise.all([
    prisma.user.findMany({ where: { role: 'ADMIN' }, select: { email: true } }),
    prisma.pollingStation.findUnique({ where: { id: data.stationId }, select: { name: true } }),
    prisma.election.findUnique({ where: { id: outcome.electionId }, select: { name: true } }),
  ]).then(([admins, station, election]) => {
    const emails = admins.map((a) => a.email).filter(Boolean);
    if (emails.length === 0) return;
    sendResultsSubmittedEmail({
      adminEmail: emails,
      agentName: user.name,
      stationCode: outcome.stationCode,
      stationName: station?.name ?? outcome.stationCode,
      resultType: data.resultType,
      totalVotes: outcome.totalVotes,
      electionName: election?.name ?? outcome.electionId,
    }).catch(() => {});
  }).catch(() => {});

  return NextResponse.json({ success: true });
});

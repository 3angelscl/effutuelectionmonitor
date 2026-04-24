import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { decryptField } from '@/lib/crypto';
import { logAudit } from '@/lib/audit';
import { requireAuth, requireRole, apiHandler } from '@/lib/api-auth';
import { invalidateLiveSummary } from '@/lib/live-summary';
import { parseBody, stationCreateSchema, stationUpdateSchema, ValidationError } from '@/lib/validations';
import { broadcastEvent } from '@/lib/events';

export const GET = apiHandler(async (request: Request) => {
  await requireAuth();

  const { searchParams } = new URL(request.url);
  const electionId = searchParams.get('electionId');

  let activeElectionId = electionId;
  if (!activeElectionId) {
    const active = await prisma.election.findFirst({ where: { isActive: true } });
    activeElectionId = active?.id || null;
  }

  const stations = await prisma.pollingStation.findMany({
    include: {
      agent: { select: { id: true, name: true, email: true, phone: true } },
      results: activeElectionId
        ? { where: { electionId: activeElectionId }, include: { candidate: true } }
        : { include: { candidate: true } },
    },
    orderBy: { psCode: 'asc' },
  });

  const stationIds = stations.map((station) => station.id);

  const registeredCounts = await prisma.voter.groupBy({
    by: ['stationId'],
    where: { stationId: { in: stationIds }, deletedAt: null },
    _count: { id: true },
  });
  const registeredMap = new Map(registeredCounts.map((row) => [row.stationId, row._count.id]));

  const votedMap = new Map<string, number>();
  if (activeElectionId) {
    const votedCounts = await prisma.voterTurnout.groupBy({
      by: ['voterId'],
      where: { electionId: activeElectionId, hasVoted: true },
      _count: { voterId: true },
    });

    const votedVoterIds = votedCounts.map((row) => row.voterId);
    const batchSize = 1000;
    for (let i = 0; i < votedVoterIds.length; i += batchSize) {
      const batch = votedVoterIds.slice(i, i + batchSize);
      const voters = await prisma.voter.findMany({
        where: { id: { in: batch } },
        select: { stationId: true },
      });
      for (const voter of voters) {
        votedMap.set(voter.stationId, (votedMap.get(voter.stationId) || 0) + 1);
      }
    }
  }

  const stationData = stations.map((station) => {
    const totalRegistered = registeredMap.get(station.id) || 0;
    const totalVoted = votedMap.get(station.id) || 0;

    return {
      id: station.id,
      psCode: station.psCode,
      name: station.name,
      location: station.location,
      electoralArea: station.electoralArea,
      latitude: station.latitude,
      longitude: station.longitude,
      agentId: station.agentId,
      agent: station.agent ? {
        ...station.agent,
        phone: decryptField(station.agent.phone)
      } : null,
      totalRegistered,
      totalVoted,
      turnoutPercentage: totalRegistered > 0
        ? Math.round((totalVoted / totalRegistered) * 1000) / 10
        : 0,
      results: station.results.map((result) => ({
        candidateId: result.candidateId,
        candidateName: result.candidate.name,
        party: result.candidate.party,
        votes: result.votes,
      })),
    };
  });

  return NextResponse.json(stationData);
});

export const POST = apiHandler(async (request: Request) => {
  const { user } = await requireRole('ADMIN');

  let data;
  try {
    data = await parseBody(request, stationCreateSchema);
  } catch (error) {
    if (error instanceof ValidationError) return error.toResponse();
    throw error;
  }

  const existing = await prisma.pollingStation.findUnique({ where: { psCode: data.psCode } });
  if (existing) {
    return NextResponse.json({ error: 'PS Code already exists' }, { status: 409 });
  }

  const station = await prisma.pollingStation.create({
    data: {
      psCode: data.psCode,
      name: data.name,
      location: data.location || null,
      electoralArea: data.electoralArea || null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
    },
  });

  if (data.electoralArea) {
    await prisma.electoralArea.upsert({
      where: { name: data.electoralArea },
      create: { name: data.electoralArea },
      update: {},
    });
  }

  await logAudit({
    userId: user.id,
    action: 'CREATE',
    entity: 'PollingStation',
    entityId: station.id,
    detail: `Created polling station "${data.psCode} - ${data.name}"`,
    metadata: { psCode: data.psCode, name: data.name, electoralArea: data.electoralArea || null },
  });

  await invalidateLiveSummary();
  broadcastEvent('station:updated', { stationId: station.id, action: 'created' });

  return NextResponse.json(station, { status: 201 });
});

export const DELETE = apiHandler(async (request: NextRequest) => {
  const { user } = await requireRole('ADMIN');

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Station ID required' }, { status: 400 });
  }

  const station = await prisma.pollingStation.findUnique({
    where: { id },
    select: { psCode: true, name: true },
  });

  if (!station) {
    return NextResponse.json({ error: 'Station not found' }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.incident.deleteMany({ where: { stationId: id } });
    await tx.tallyPhoto.deleteMany({ where: { stationId: id } });
    await tx.agentCheckIn.deleteMany({ where: { stationId: id } });
    await tx.electionResult.deleteMany({ where: { stationId: id } });
    await tx.voterTurnout.deleteMany({ where: { voter: { stationId: id } } });
    await tx.voter.deleteMany({ where: { stationId: id } });
    await tx.pollingStation.delete({ where: { id } });
  });

  await logAudit({
    userId: user.id,
    action: 'DELETE',
    entity: 'PollingStation',
    entityId: id,
    detail: `Deleted polling station "${station.psCode} - ${station.name}"`,
    metadata: { psCode: station.psCode, name: station.name },
  });

  await invalidateLiveSummary();
  broadcastEvent('station:updated', { stationId: id, action: 'deleted' });

  return NextResponse.json({ success: true });
});

export const PUT = apiHandler(async (request: NextRequest) => {
  const { user } = await requireRole('ADMIN');

  let data;
  try {
    data = await parseBody(request, stationUpdateSchema);
  } catch (error) {
    if (error instanceof ValidationError) return error.toResponse();
    throw error;
  }

  const updateData: Record<string, unknown> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.location !== undefined) updateData.location = data.location || null;
  if (data.electoralArea !== undefined) updateData.electoralArea = data.electoralArea || null;
  if (data.latitude !== undefined) updateData.latitude = data.latitude;
  if (data.longitude !== undefined) updateData.longitude = data.longitude;

  if (typeof updateData.electoralArea === 'string' && updateData.electoralArea) {
    await prisma.electoralArea.upsert({
      where: { name: updateData.electoralArea },
      create: { name: updateData.electoralArea },
      update: {},
    });
  }

  const station = await prisma.pollingStation.update({
    where: { id: data.id },
    data: updateData,
  });

  await logAudit({
    userId: user.id,
    action: 'UPDATE',
    entity: 'PollingStation',
    entityId: data.id,
    detail: `Updated polling station "${station.psCode}"`,
    metadata: { stationId: data.id, updatedFields: Object.keys(updateData) },
  });

  await invalidateLiveSummary();
  broadcastEvent('station:updated', { stationId: data.id, action: 'updated' });

  return NextResponse.json(station);
});

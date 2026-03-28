import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requireAuth, requireRole, ApiError, apiHandler } from '@/lib/api-auth';
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
      voters: {
        select: {
          id: true,
          turnout: activeElectionId
            ? { where: { electionId: activeElectionId }, select: { hasVoted: true } }
            : undefined,
        },
      },
      results: activeElectionId
        ? {
            where: { electionId: activeElectionId },
            include: { candidate: true },
          }
        : {
            include: { candidate: true },
          },
    },
    orderBy: { psCode: 'asc' },
  });

  const stationData = stations.map((station) => {
    const totalRegistered = station.voters.length;
    const totalVoted = activeElectionId
      ? station.voters.filter((v) => v.turnout?.some((t) => t.hasVoted)).length
      : 0;

    return {
      id: station.id,
      psCode: station.psCode,
      name: station.name,
      location: station.location,
      latitude: station.latitude,
      longitude: station.longitude,
      agentId: station.agentId,
      agent: station.agent,
      totalRegistered,
      totalVoted,
      turnoutPercentage: totalRegistered > 0
        ? Math.round((totalVoted / totalRegistered) * 1000) / 10
        : 0,
      results: station.results.map((r) => ({
        candidateId: r.candidateId,
        candidateName: r.candidate.name,
        party: r.candidate.party,
        votes: r.votes,
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
    throw new ApiError(409, 'PS Code already exists');
  }

  const station = await prisma.pollingStation.create({
    data: {
      psCode: data.psCode,
      name: data.name,
      location: data.location || null,
      ward: data.ward || null,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
    },
  });

  await logAudit({
    userId: user.id,
    action: 'CREATE',
    entity: 'PollingStation',
    entityId: station.id,
    detail: `Created polling station "${data.psCode} - ${data.name}"`,
    metadata: { psCode: data.psCode, name: data.name },
  });

  broadcastEvent('station:updated', { stationId: station.id, action: 'created' });

  return NextResponse.json(station, { status: 201 });
});

export async function DELETE(request: NextRequest) {
  try {
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

    // Delete related records in a transaction to prevent partial deletion
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

    broadcastEvent('station:updated', { stationId: id, action: 'deleted' });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Delete station error:', error);
    return NextResponse.json({ error: 'Failed to delete station' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
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
    if (data.ward !== undefined) updateData.ward = data.ward || null;
    if (data.latitude !== undefined) updateData.latitude = data.latitude;
    if (data.longitude !== undefined) updateData.longitude = data.longitude;

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

    broadcastEvent('station:updated', { stationId: data.id, action: 'updated' });

    return NextResponse.json(station);
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Update station error:', error);
    return NextResponse.json({ error: 'Failed to update station' }, { status: 500 });
  }
}

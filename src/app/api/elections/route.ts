import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requireAuth, requireRole, ApiError, apiHandler } from '@/lib/api-auth';
import { parseBody, electionCreateSchema, electionUpdateSchema, ValidationError } from '@/lib/validations';
import { broadcastEvent } from '@/lib/events';

export const GET = apiHandler(async () => {
  await requireAuth();

  const elections = await prisma.election.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      _count: {
        select: { candidates: true, results: true, turnout: true },
      },
    },
  });
  return NextResponse.json(elections);
});

export const POST = apiHandler(async (request: Request) => {
  const { user } = await requireRole(['ADMIN', 'OFFICER']);

  let data;
  try {
    data = await parseBody(request, electionCreateSchema);
  } catch (error) {
    if (error instanceof ValidationError) return error.toResponse();
    throw error;
  }

  const election = await prisma.election.create({
    data: {
      name: data.name,
      description: data.description || null,
      date: data.date ? new Date(data.date) : null,
    },
  });

  await logAudit({
    userId: user.id,
    action: 'CREATE',
    entity: 'Election',
    entityId: election.id,
    detail: `Created election "${data.name}"`,
  });

  broadcastEvent('election:changed', { electionId: election.id, action: 'created' });

  return NextResponse.json(election, { status: 201 });
});

export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireRole(['ADMIN', 'OFFICER']);

    let data;
    try {
      data = await parseBody(request, electionUpdateSchema);
    } catch (error) {
      if (error instanceof ValidationError) return error.toResponse();
      throw error;
    }

    const election = await prisma.election.update({
      where: { id: data.id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.date !== undefined && { date: data.date ? new Date(data.date) : null }),
        ...(data.status && { status: data.status }),
        ...(data.favCandidate1Id !== undefined && { favCandidate1Id: data.favCandidate1Id }),
        ...(data.favCandidate2Id !== undefined && { favCandidate2Id: data.favCandidate2Id }),
      },
    });

    await logAudit({
      userId: user.id,
      action: 'UPDATE',
      entity: 'Election',
      entityId: data.id,
      detail: `Updated election "${election.name}"${data.status ? ` — status: ${data.status}` : ''}`,
      metadata: { name: data.name, status: data.status },
    });

    broadcastEvent('election:changed', { electionId: data.id, action: 'updated' });

    return NextResponse.json(election);
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Update election error:', error);
    return NextResponse.json({ error: 'Failed to update election' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user } = await requireRole(['ADMIN', 'OFFICER']);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Election ID required' }, { status: 400 });
    }

    const targetElection = await prisma.election.findUnique({ where: { id }, select: { name: true, isActive: true } });

    if (targetElection?.isActive) {
      return NextResponse.json({ error: 'Cannot delete the active election. Deactivate it first.' }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.electionResult.deleteMany({ where: { electionId: id } }),
      prisma.voterTurnout.deleteMany({ where: { electionId: id } }),
      prisma.candidate.deleteMany({ where: { electionId: id } }),
      prisma.election.delete({ where: { id } }),
    ]);

    await logAudit({
      userId: user.id,
      action: 'DELETE',
      entity: 'Election',
      entityId: id,
      detail: `Deleted election "${targetElection?.name}"`,
    });

    broadcastEvent('election:changed', { electionId: id, action: 'deleted' });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Delete election error:', error);
    return NextResponse.json({ error: 'Failed to delete election' }, { status: 500 });
  }
}

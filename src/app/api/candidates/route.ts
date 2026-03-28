import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requireAuth, requireRole, ApiError, apiHandler } from '@/lib/api-auth';
import { parseBody, candidateCreateSchema, candidateUpdateSchema, ValidationError } from '@/lib/validations';

export const GET = apiHandler(async (request: Request) => {
  await requireAuth();

  const { searchParams } = new URL(request.url);
  let electionId = searchParams.get('electionId');

  if (!electionId) {
    const active = await prisma.election.findFirst({ where: { isActive: true } });
    electionId = active?.id || null;
  }

  if (!electionId) {
    return NextResponse.json([]);
  }

  const candidates = await prisma.candidate.findMany({
    where: { electionId },
    orderBy: { party: 'asc' },
  });
  return NextResponse.json(candidates);
});

export const POST = apiHandler(async (request: Request) => {
  const { user } = await requireRole('ADMIN');

  let data;
  try {
    data = await parseBody(request, candidateCreateSchema);
  } catch (error) {
    if (error instanceof ValidationError) return error.toResponse();
    throw error;
  }

  let targetElectionId = data.electionId;
  if (!targetElectionId) {
    const active = await prisma.election.findFirst({ where: { isActive: true } });
    if (!active) {
      throw new ApiError(400, 'No active election');
    }
    targetElectionId = active.id;
  }

  const candidate = await prisma.candidate.create({
    data: {
      name: data.name,
      party: data.party,
      partyFull: data.partyFull || null,
      color: data.color,
      photo: data.photo || null,
      electionId: targetElectionId,
    },
  });

  await logAudit({
    userId: user.id,
    action: 'CREATE',
    entity: 'Candidate',
    entityId: candidate.id,
    detail: `Created candidate "${data.name}" (${data.party})`,
    metadata: { party: data.party, electionId: targetElectionId },
  });

  return NextResponse.json(candidate, { status: 201 });
});

export async function PUT(request: NextRequest) {
  try {
    const { user } = await requireRole('ADMIN');

    let data;
    try {
      data = await parseBody(request, candidateUpdateSchema);
    } catch (error) {
      if (error instanceof ValidationError) return error.toResponse();
      throw error;
    }

    const candidate = await prisma.candidate.update({
      where: { id: data.id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.party && { party: data.party }),
        ...(data.partyFull !== undefined && { partyFull: data.partyFull }),
        ...(data.color && { color: data.color }),
        ...(data.photo !== undefined && { photo: data.photo || null }),
      },
    });

    await logAudit({
      userId: user.id,
      action: 'UPDATE',
      entity: 'Candidate',
      entityId: data.id,
      detail: `Updated candidate "${candidate.name}" (${candidate.party})`,
    });

    return NextResponse.json(candidate);
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Update candidate error:', error);
    return NextResponse.json({ error: 'Failed to update candidate' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user } = await requireRole('ADMIN');

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Candidate ID required' }, { status: 400 });
    }

    const targetCandidate = await prisma.candidate.findUnique({
      where: { id },
      select: { name: true, party: true },
    });

    await prisma.electionResult.deleteMany({ where: { candidateId: id } });
    await prisma.candidate.delete({ where: { id } });

    await logAudit({
      userId: user.id,
      action: 'DELETE',
      entity: 'Candidate',
      entityId: id,
      detail: `Deleted candidate "${targetCandidate?.name}" (${targetCandidate?.party})`,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Delete candidate error:', error);
    return NextResponse.json({ error: 'Failed to delete candidate' }, { status: 500 });
  }
}

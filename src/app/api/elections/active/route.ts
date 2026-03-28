import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';

// GET the currently active election
export async function GET() {
  try {
    await requireAuth();

    const active = await prisma.election.findFirst({
      where: { isActive: true },
    });
    return NextResponse.json(active);
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Active election error:', error);
    return NextResponse.json({ error: 'Failed to fetch active election' }, { status: 500 });
  }
}

// POST to set a specific election as active (deactivates all others)
export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRole(['ADMIN', 'OFFICER']);

    const { electionId } = await request.json();
    if (!electionId) {
      return NextResponse.json({ error: 'Election ID required' }, { status: 400 });
    }

    // Record the previously active election before changing it
    const previousActive = await prisma.election.findFirst({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    // Deactivate all elections then activate the selected one atomically
    const election = await prisma.$transaction(async (tx) => {
      await tx.election.updateMany({ data: { isActive: false } });
      return tx.election.update({
        where: { id: electionId },
        data: { isActive: true, status: 'ONGOING' },
      });
    });

    await logAudit({
      userId: user.id,
      action: 'UPDATE',
      entity: 'Election',
      entityId: electionId,
      detail: `Activated election "${election.name}"`,
      metadata: {
        previousActiveId: previousActive?.id ?? null,
        previousActiveName: previousActive?.name ?? null,
      },
    });

    return NextResponse.json(election);
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Set active election error:', error);
    return NextResponse.json({ error: 'Failed to set active election' }, { status: 500 });
  }
}

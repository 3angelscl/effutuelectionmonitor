import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';

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
    await requireRole(['ADMIN', 'OFFICER']);

    const { electionId } = await request.json();
    if (!electionId) {
      return NextResponse.json({ error: 'Election ID required' }, { status: 400 });
    }

    // Deactivate all elections
    await prisma.election.updateMany({
      data: { isActive: false },
    });

    // Activate the selected one
    const election = await prisma.election.update({
      where: { id: electionId },
      data: { isActive: true, status: 'ONGOING' },
    });

    return NextResponse.json(election);
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Set active election error:', error);
    return NextResponse.json({ error: 'Failed to set active election' }, { status: 500 });
  }
}

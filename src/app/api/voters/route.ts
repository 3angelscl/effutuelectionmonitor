import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const safePage = Math.max(1, isNaN(page) ? 1 : page);
    const safeLimit = Math.max(1, Math.min(isNaN(limit) ? 10 : limit, 100));
    const search = searchParams.get('search') || '';
    const stationId = searchParams.get('stationId') || '';

    // Build where clause — voters are global, not election-scoped
    const where: Record<string, unknown> = { deletedAt: null };

    if (stationId) {
      where.stationId = stationId;
    }

    if (search) {
      where.OR = [
        { voterId: { contains: search } },
        { firstName: { contains: search } },
        { lastName: { contains: search } },
      ];
    }

    // Get active election for turnout status
    const activeElection = await prisma.election.findFirst({ where: { isActive: true } });

    const [voters, total] = await Promise.all([
      prisma.voter.findMany({
        where,
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
        orderBy: { lastName: 'asc' },
        include: {
          pollingStation: { select: { name: true, psCode: true } },
          turnout: activeElection
            ? { where: { electionId: activeElection.id }, select: { hasVoted: true, votedAt: true } }
            : undefined,
        },
      }),
      prisma.voter.count({ where }),
    ]);

    // Map voters to include hasVoted from turnout for the active election
    const votersWithTurnout = voters.map((v) => ({
      id: v.id,
      voterId: v.voterId,
      firstName: v.firstName,
      lastName: v.lastName,
      age: v.age,
      psCode: v.psCode,
      stationId: v.stationId,
      photo: v.photo,
      pollingStation: v.pollingStation,
      hasVoted: v.turnout?.[0]?.hasVoted || false,
      votedAt: v.turnout?.[0]?.votedAt || null,
    }));

    return NextResponse.json({
      voters: votersWithTurnout,
      total,
      page: safePage,
      totalPages: Math.ceil(total / safeLimit),
    });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Voters error:', error);
    return NextResponse.json({ error: 'Failed to fetch voters' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole('ADMIN');

    const body = await request.json();
    const { voterId, firstName, lastName, age, psCode, photo } = body;

    if (!voterId || !firstName || !lastName || !age || !psCode) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    // Find the station by psCode (globally unique)
    const station = await prisma.pollingStation.findUnique({ where: { psCode } });
    if (!station) {
      return NextResponse.json({ error: 'Polling station not found' }, { status: 404 });
    }

    // Check duplicate voter at this station
    const existing = await prisma.voter.findFirst({
      where: { voterId, stationId: station.id },
    });
    if (existing) {
      return NextResponse.json({ error: 'Voter ID already exists at this station' }, { status: 409 });
    }

    const voter = await prisma.voter.create({
      data: {
        voterId,
        firstName,
        lastName,
        age: parseInt(age),
        psCode,
        stationId: station.id,
        photo: photo || null,
      },
    });

    return NextResponse.json(voter, { status: 201 });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Create voter error:', error);
    return NextResponse.json({ error: 'Failed to create voter' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireRole('ADMIN');

    const body = await request.json();
    const { id, voterId, firstName, lastName, age, photo } = body;

    if (!id) {
      return NextResponse.json({ error: 'Voter ID required' }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (voterId !== undefined) data.voterId = voterId;
    if (firstName !== undefined) data.firstName = firstName;
    if (lastName !== undefined) data.lastName = lastName;
    if (age !== undefined) data.age = parseInt(String(age));
    if (photo !== undefined) data.photo = photo || null;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const voter = await prisma.voter.update({
      where: { id },
      data,
    });

    return NextResponse.json(voter);
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Update voter error:', error);
    return NextResponse.json({ error: 'Failed to update voter' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user: admin } = await requireRole('ADMIN');

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const deleteAll = searchParams.get('deleteAll');
    const stationId = searchParams.get('stationId');

    // Delete all voters (optionally filtered by station)
    if (deleteAll === 'true') {
      const where: Record<string, unknown> = {};
      if (stationId) where.stationId = stationId;

      // Get voter IDs to delete their turnout records
      const voterIds = await prisma.voter.findMany({
        where,
        select: { id: true },
      });
      const ids = voterIds.map((v) => v.id);

      if (ids.length === 0) {
        return NextResponse.json({ success: true, deletedCount: 0 });
      }

      // Delete in transaction: turnout first, then voters
      await prisma.$transaction([
        prisma.voterTurnout.deleteMany({ where: { voterId: { in: ids } } }),
        prisma.voter.deleteMany({ where: { id: { in: ids } } }),
      ]);

      await logAudit({
        userId: admin.id,
        action: 'DELETE',
        entity: 'Voter',
        entityId: stationId || 'ALL',
        detail: `Bulk deleted ${ids.length} voter${ids.length !== 1 ? 's' : ''}${stationId ? ` for station ${stationId}` : ' across all stations'}`,
        metadata: { deletedCount: ids.length, stationId: stationId || null },
      });

      return NextResponse.json({ success: true, deletedCount: ids.length });
    }

    // Soft-delete single voter
    if (!id) {
      return NextResponse.json({ error: 'Voter ID required' }, { status: 400 });
    }

    await prisma.voter.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Delete voter error:', error);
    return NextResponse.json({ error: 'Failed to delete voter' }, { status: 500 });
  }
}

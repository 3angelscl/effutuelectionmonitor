import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { requireAuth, requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { invalidateLiveSummary } from '@/lib/live-summary';
import { parseBody, voterCreateSchema, voterUpdateSchema } from '@/lib/validations';

const AGE_BUCKETS = [
  { label: '18-25', min: 18, max: 25 },
  { label: '26-35', min: 26, max: 35 },
  { label: '36-50', min: 36, max: 50 },
  { label: '51-65', min: 51, max: 65 },
  { label: '65+', min: 66, max: Number.POSITIVE_INFINITY },
];

function buildVoterSummary(voters: { age: number; gender: string | null }[]) {
  const ageBands = AGE_BUCKETS.map((bucket) => ({ ...bucket, count: 0 }));
  const genderCounts = { male: 0, female: 0, unknown: 0 };

  for (const voter of voters) {
    if (voter.gender === 'Male') {
      genderCounts.male++;
    } else if (voter.gender === 'Female') {
      genderCounts.female++;
    } else {
      genderCounts.unknown++;
    }

    const bucket = ageBands.find((entry) => voter.age >= entry.min && voter.age <= entry.max);
    if (bucket) bucket.count++;
  }

  return {
    total: voters.length,
    ageBands: ageBands.map(({ label, count }) => ({ label, count })),
    genderCounts,
  };
}

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
    const electoralArea = searchParams.get('electoralArea') || '';

    // Build where clause — voters are global, not election-scoped
    const where: Record<string, unknown> = { deletedAt: null };

    if (stationId) {
      where.stationId = stationId;
    }
    if (electoralArea) {
      where.pollingStation = { is: { electoralArea } };
    }

    if (search) {
      const parts = search.trim().split(/\s+/);
      const conditions: unknown[] = [
        { voterId: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
      // Support "First Last" or "Last First" full-name searches
      if (parts.length >= 2) {
        conditions.push(
          { firstName: { contains: parts[0], mode: 'insensitive' }, lastName: { contains: parts[1], mode: 'insensitive' } },
          { firstName: { contains: parts[1], mode: 'insensitive' }, lastName: { contains: parts[0], mode: 'insensitive' } },
        );
      }
      where.OR = conditions;
    }

    // Get active election for turnout status
    const activeElection = await prisma.election.findFirst({ where: { isActive: true } });

    const [voters, total, voterSummaryRows] = await Promise.all([
      prisma.voter.findMany({
        where,
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
        orderBy: [
          { lastName: 'asc' },
          { firstName: 'asc' },
          { id: 'asc' },
        ],
        include: {
          pollingStation: { select: { name: true, psCode: true, electoralArea: true } },
          turnout: activeElection
            ? { where: { electionId: activeElection.id }, select: { hasVoted: true, votedAt: true } }
            : undefined,
        },
      }),
      prisma.voter.count({ where }),
      prisma.voter.findMany({
        where,
        select: {
          age: true,
          gender: true,
        },
      }),
    ]);

    // Map voters to include hasVoted from turnout for the active election
    const votersWithTurnout = voters.map((v) => ({
      id: v.id,
      voterId: v.voterId,
      firstName: v.firstName,
      lastName: v.lastName,
      age: v.age,
      gender: v.gender,
      psCode: v.pollingStation?.psCode,
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
      summary: buildVoterSummary(voterSummaryRows),
    });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Voters error:', error);
    return NextResponse.json({ error: 'Failed to fetch voters' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { user: admin } = await requireRole('ADMIN');

    const data = await parseBody(request, voterCreateSchema);
    const { voterId, firstName, lastName, age, gender, psCode, photo } = data;

    // Find the station by psCode (globally unique)
    const station = await prisma.pollingStation.findUnique({ where: { psCode } });
    if (!station) {
      throw new ApiError(404, 'Polling station not found');
    }

    // Check duplicate voter at this station (ignore soft-deleted records)
    const existing = await prisma.voter.findFirst({
      where: { voterId, stationId: station.id, deletedAt: null },
    });
    if (existing) {
      throw new ApiError(409, 'Voter ID already exists at this station');
    }

    const voter = await prisma.voter.create({
      data: {
        voterId,
        firstName,
        lastName,
        age,
        gender,
        stationId: station.id,
        photo: photo || null,
      },
    });

    await logAudit({
      userId: admin.id,
      action: 'CREATE',
      entity: 'Voter',
      entityId: voter.id,
      detail: `Registered new voter: ${firstName} ${lastName} (${voterId}) at station ${psCode}`,
      metadata: { stationId: station.id, voterId },
    });

    await invalidateLiveSummary();

    return NextResponse.json(voter, { status: 201 });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Create voter server error:', error);
    return NextResponse.json({ error: 'Failed to create voter' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { user: admin } = await requireRole('ADMIN');

    const body = await parseBody(request, voterUpdateSchema);
    const { id, ...updateData } = body;

    const voter = await prisma.voter.update({
      where: { id },
      data: updateData,
    });

    await logAudit({
      userId: admin.id,
      action: 'UPDATE',
      entity: 'Voter',
      entityId: voter.id,
      detail: `Updated voter details for ${voter.firstName} ${voter.lastName} (${voter.voterId})`,
      metadata: { updateData },
    });

    await invalidateLiveSummary();

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
    const electoralArea = searchParams.get('electoralArea');

    // Delete all voters (optionally filtered by station)
    if (deleteAll === 'true') {
      // Require password confirmation for bulk delete
      let body: { password?: string } = {};
      try {
        body = await request.json();
      } catch {
        // no body
      }

      if (!body.password) {
        return NextResponse.json({ error: 'Password confirmation required' }, { status: 400 });
      }

      // Verify the admin's password
      const adminUser = await prisma.user.findUnique({
        where: { id: admin.id },
        select: { password: true },
      });

      if (!adminUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const isValidPassword = await bcrypt.compare(body.password, adminUser.password);
      if (!isValidPassword) {
        return NextResponse.json({ error: 'Invalid password' }, { status: 403 });
      }

      const where: Record<string, unknown> = {};
      if (stationId) where.stationId = stationId;
      if (electoralArea) where.pollingStation = { is: { electoralArea } };

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

      await invalidateLiveSummary();

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

    await invalidateLiveSummary();

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Delete voter error:', error);
    return NextResponse.json({ error: 'Failed to delete voter' }, { status: 500 });
  }
}

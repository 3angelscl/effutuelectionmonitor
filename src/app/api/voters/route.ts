import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { requireAuth, requireRole, apiHandler, ApiError } from '@/lib/api-auth';
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

export const GET = apiHandler(async (request: NextRequest) => {
  await requireAuth();

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '10', 10);
  const safePage = Math.max(1, Number.isNaN(page) ? 1 : page);
  const safeLimit = Math.max(1, Math.min(Number.isNaN(limit) ? 10 : limit, 100));
  const search = searchParams.get('search') || '';
  const stationId = searchParams.get('stationId') || '';
  const electoralArea = searchParams.get('electoralArea') || '';

  const where: Record<string, unknown> = { deletedAt: null };

  if (stationId) where.stationId = stationId;
  if (electoralArea) where.pollingStation = { is: { electoralArea } };

  if (search) {
    const parts = search.trim().split(/\s+/);
    const conditions: unknown[] = [
      { voterId: { contains: search, mode: 'insensitive' } },
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
    ];

    if (parts.length >= 2) {
      conditions.push(
        { firstName: { contains: parts[0], mode: 'insensitive' }, lastName: { contains: parts[1], mode: 'insensitive' } },
        { firstName: { contains: parts[1], mode: 'insensitive' }, lastName: { contains: parts[0], mode: 'insensitive' } },
      );
    }

    where.OR = conditions;
  }

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

  const votersWithTurnout = voters.map((voter) => ({
    id: voter.id,
    voterId: voter.voterId,
    firstName: voter.firstName,
    lastName: voter.lastName,
    age: voter.age,
    gender: voter.gender,
    psCode: voter.pollingStation?.psCode,
    stationId: voter.stationId,
    photo: voter.photo,
    pollingStation: voter.pollingStation,
    hasVoted: voter.turnout?.[0]?.hasVoted || false,
    votedAt: voter.turnout?.[0]?.votedAt || null,
  }));

  return NextResponse.json({
    voters: votersWithTurnout,
    total,
    page: safePage,
    totalPages: Math.ceil(total / safeLimit),
    summary: buildVoterSummary(voterSummaryRows),
  });
});

export const POST = apiHandler(async (request: NextRequest) => {
  const { user: admin } = await requireRole('ADMIN');

  const data = await parseBody(request, voterCreateSchema);
  const { voterId, firstName, lastName, age, gender, psCode, photo } = data;

  const station = await prisma.pollingStation.findUnique({ where: { psCode } });
  if (!station) {
    throw new ApiError(404, 'Polling station not found');
  }

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
});

export const PUT = apiHandler(async (request: NextRequest) => {
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
});

export const DELETE = apiHandler(async (request: NextRequest) => {
  const { user: admin } = await requireRole('ADMIN');

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const deleteAll = searchParams.get('deleteAll');
  const stationId = searchParams.get('stationId');
  const electoralArea = searchParams.get('electoralArea');

  if (deleteAll === 'true') {
    let body: { password?: string } = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    if (!body.password) {
      return NextResponse.json({ error: 'Password confirmation required' }, { status: 400 });
    }

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

    const where: Record<string, unknown> = { deletedAt: null };
    if (stationId) where.stationId = stationId;
    if (electoralArea) where.pollingStation = { is: { electoralArea } };

    const voterIds = await prisma.voter.findMany({
      where,
      select: { id: true },
    });
    const ids = voterIds.map((voter) => voter.id);

    if (ids.length === 0) {
      return NextResponse.json({ success: true, deletedCount: 0 });
    }

    await prisma.voter.updateMany({
      where: { id: { in: ids } },
      data: { deletedAt: new Date() },
    });

    await logAudit({
      userId: admin.id,
      action: 'DELETE',
      entity: 'Voter',
      entityId: stationId || 'ALL',
      detail: `Bulk soft-deleted ${ids.length} voter${ids.length !== 1 ? 's' : ''}${stationId ? ` for station ${stationId}` : ' across all stations'}`,
      metadata: { deletedCount: ids.length, stationId: stationId || null, softDelete: true },
    });

    await invalidateLiveSummary();

    return NextResponse.json({ success: true, deletedCount: ids.length });
  }

  if (!id) {
    return NextResponse.json({ error: 'Voter ID required' }, { status: 400 });
  }

  await prisma.voter.update({
    where: { id },
    data: { deletedAt: new Date() },
  });

  await invalidateLiveSummary();

  return NextResponse.json({ success: true });
});

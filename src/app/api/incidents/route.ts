import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole, ApiError, apiHandler } from '@/lib/api-auth';
import { parseBody, incidentCreateSchema, ValidationError } from '@/lib/validations';
import { broadcastEvent } from '@/lib/events';
import { createRateLimiter } from '@/lib/rate-limit';
import { notifyAdmins } from '@/lib/notify';

// 10 incident reports per 5 minutes per user
const incidentRateLimiter = createRateLimiter({ windowMs: 5 * 60 * 1000, max: 10 });

export const GET = apiHandler(async (request: Request) => {
  const { user } = await requireAuth();

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || '';
  const stationId = searchParams.get('stationId') || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')));
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};

  // Agents can only see their own incidents
  if (user.role === 'AGENT') {
    where.userId = user.id;
  }

  if (status) where.status = status;
  if (stationId) where.stationId = stationId;

  const [incidents, total] = await Promise.all([
    prisma.incident.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        station: { select: { id: true, name: true, psCode: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.incident.count({ where }),
  ]);

  return NextResponse.json({
    incidents,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
});

export const POST = apiHandler(async (request: Request) => {
  const { user } = await requireRole(['ADMIN', 'AGENT']);

  const { success } = await incidentRateLimiter.check(user.id);
  if (!success) throw new ApiError(429, 'Too many incident reports. Please wait before submitting again.');

  let data;
  try {
    data = await parseBody(request, incidentCreateSchema);
  } catch (error) {
    if (error instanceof ValidationError) return error.toResponse();
    throw error;
  }

  // Verify station exists
  const station = await prisma.pollingStation.findUnique({ where: { id: data.stationId } });
  if (!station) {
    throw new ApiError(404, 'Polling station not found');
  }

  // If agent, verify assignment
  if (user.role === 'AGENT' && station.agentId !== user.id) {
    throw new ApiError(403, 'Not authorized for this polling station');
  }

  const incident = await prisma.incident.create({
    data: {
      userId: user.id,
      stationId: data.stationId,
      type: data.type,
      severity: data.severity,
      title: data.title,
      description: data.description,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      photoUrl: data.photoUrl ?? null,
      status: 'OPEN',
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      station: { select: { id: true, name: true, psCode: true } },
    },
  });

  // Persist notification + push to admins (fire-and-forget)
  notifyAdmins({
    type: 'ALERT',
    title: `Incident reported — ${station.psCode}`,
    message: `${user.name}: [${data.severity}] ${data.title}`,
    link: '/admin/incidents',
    push: {
      title: `⚠️ Incident: ${station.psCode}`,
      body: `${data.severity} — ${data.title}`,
      url: '/admin/incidents',
    },
  }).catch(() => {});

  // Broadcast to admins
  broadcastEvent('incident:created', {
    incidentId: incident.id,
    type: data.type,
    severity: data.severity,
    stationCode: station.psCode,
  }, { targetRoles: ['ADMIN'] });

  return NextResponse.json(incident, { status: 201 });
});

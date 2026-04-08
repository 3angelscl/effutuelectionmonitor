import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { requireAuth, requireRole, ApiError, apiHandler } from '@/lib/api-auth';
import {
  electoralAreaCreateSchema,
  electoralAreaUpdateSchema,
  parseBody,
  ValidationError,
} from '@/lib/validations';
import { getBoundaryCenter, parseBoundaryGeoJson } from '@/lib/electoral-area-boundary';

async function syncElectoralAreaRecords() {
  const stationAreas = await prisma.pollingStation.findMany({
    where: { electoralArea: { not: null } },
    select: { electoralArea: true },
    distinct: ['electoralArea'],
  });

  const names = stationAreas
    .map((station) => station.electoralArea?.trim())
    .filter((name): name is string => Boolean(name));

  if (names.length === 0) return;

  await prisma.electoralArea.createMany({
    data: names.map((name) => ({ name })),
    skipDuplicates: true,
  });
}

export const GET = apiHandler(async () => {
  await requireAuth();

  await syncElectoralAreaRecords();

  const [areas, stations] = await Promise.all([
    prisma.electoralArea.findMany({
      orderBy: { name: 'asc' },
    }),
    prisma.pollingStation.findMany({
      where: { electoralArea: { not: null } },
      select: {
        id: true,
        psCode: true,
        name: true,
        latitude: true,
        longitude: true,
        electoralArea: true,
      },
      orderBy: [{ electoralArea: 'asc' }, { psCode: 'asc' }],
    }),
  ]);

  const stationsByArea = new Map<string, {
    id: string;
    psCode: string;
    name: string;
    latitude: number | null;
    longitude: number | null;
  }[]>();
  for (const station of stations) {
    const areaName = station.electoralArea?.trim();
    if (!areaName) continue;
    if (!stationsByArea.has(areaName)) stationsByArea.set(areaName, []);
    stationsByArea.get(areaName)!.push({
      id: station.id,
      psCode: station.psCode,
      name: station.name,
      latitude: station.latitude,
      longitude: station.longitude,
    });
  }

  return NextResponse.json(
    areas.map((area) => {
      const boundaryPoints = parseBoundaryGeoJson(area.boundaryGeoJson);
      const center = getBoundaryCenter(boundaryPoints);

      return {
        id: area.id,
        name: area.name,
        location: area.location,
        boundaryGeoJson: area.boundaryGeoJson,
        boundaryPointCount: boundaryPoints.length,
        boundaryCenter: center ? { latitude: center[0], longitude: center[1] } : null,
        createdAt: area.createdAt,
        updatedAt: area.updatedAt,
        stations: stationsByArea.get(area.name) ?? [],
        stationCount: (stationsByArea.get(area.name) ?? []).length,
      };
    }),
  );
});

export const POST = apiHandler(async (request: Request) => {
  const { user } = await requireRole('ADMIN');

  let data;
  try {
    data = await parseBody(request, electoralAreaCreateSchema);
  } catch (error) {
    if (error instanceof ValidationError) return error.toResponse();
    throw error;
  }

  const existing = await prisma.electoralArea.findFirst({
    where: { name: { equals: data.name, mode: 'insensitive' } },
    select: { id: true },
  });
  if (existing) throw new ApiError(409, 'Electoral area already exists');

  const area = await prisma.electoralArea.create({
    data: {
      name: data.name,
      location: data.location || null,
      boundaryGeoJson: data.boundaryGeoJson || null,
    },
  });

  await logAudit({
    userId: user.id,
    action: 'CREATE',
    entity: 'ElectoralArea',
    entityId: area.id,
    detail: `Created electoral area "${area.name}"`,
    metadata: {
      name: area.name,
      location: area.location,
      hasBoundary: Boolean(area.boundaryGeoJson),
    },
  });

  return NextResponse.json(area, { status: 201 });
});

export const PUT = apiHandler(async (request: Request) => {
  const { user } = await requireRole('ADMIN');

  let data;
  try {
    data = await parseBody(request, electoralAreaUpdateSchema);
  } catch (error) {
    if (error instanceof ValidationError) return error.toResponse();
    throw error;
  }

  const existing = await prisma.electoralArea.findUnique({
    where: { id: data.id },
  });
  if (!existing) throw new ApiError(404, 'Electoral area not found');

  const duplicate = await prisma.electoralArea.findFirst({
    where: {
      id: { not: data.id },
      name: { equals: data.name, mode: 'insensitive' },
    },
    select: { id: true },
  });
  if (duplicate) throw new ApiError(409, 'Another electoral area already uses that name');

  const updated = await prisma.$transaction(async (tx) => {
    const area = await tx.electoralArea.update({
      where: { id: data.id },
      data: {
        name: data.name,
        location: data.location || null,
        boundaryGeoJson: data.boundaryGeoJson || null,
      },
    });

    if (existing.name !== data.name) {
      await tx.pollingStation.updateMany({
        where: { electoralArea: existing.name },
        data: { electoralArea: data.name },
      });
    }

    return area;
  });

  await logAudit({
    userId: user.id,
    action: 'UPDATE',
    entity: 'ElectoralArea',
    entityId: updated.id,
    detail: `Updated electoral area "${existing.name}"`,
    metadata: {
      previousName: existing.name,
      name: updated.name,
      location: updated.location,
      hasBoundary: Boolean(updated.boundaryGeoJson),
    },
  });

  return NextResponse.json(updated);
});

export async function DELETE(request: NextRequest) {
  try {
    const { user } = await requireRole('ADMIN');
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Electoral area ID required' }, { status: 400 });
    }

    const area = await prisma.electoralArea.findUnique({
      where: { id },
    });
    if (!area) {
      return NextResponse.json({ error: 'Electoral area not found' }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.pollingStation.updateMany({
        where: { electoralArea: area.name },
        data: { electoralArea: null },
      });
      await tx.electoralArea.delete({ where: { id } });
    });

    await logAudit({
      userId: user.id,
      action: 'DELETE',
      entity: 'ElectoralArea',
      entityId: id,
      detail: `Deleted electoral area "${area.name}"`,
      metadata: { name: area.name },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Delete electoral area error:', error);
    return NextResponse.json({ error: 'Failed to delete electoral area' }, { status: 500 });
  }
}

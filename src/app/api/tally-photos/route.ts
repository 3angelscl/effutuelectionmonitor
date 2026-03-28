import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';

export async function GET(request: NextRequest) {
  try {
    await requireRole(['ADMIN', 'OFFICER']);

    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('stationId') || undefined;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50') || 50));

    const where: Record<string, unknown> = {};
    if (stationId) {
      where.stationId = stationId;
    }

    const [photos, total] = await Promise.all([
      prisma.tallyPhoto.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, role: true } },
          station: { select: { id: true, psCode: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.tallyPhoto.count({ where }),
    ]);

    return NextResponse.json({
      photos,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Tally photos fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch tally photos' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { user } = await requireRole('ADMIN');

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Photo ID required' }, { status: 400 });
    }

    const photo = await prisma.tallyPhoto.findUnique({
      where: { id },
      select: { id: true, stationId: true, station: { select: { psCode: true } } },
    });

    if (!photo) {
      return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
    }

    await prisma.tallyPhoto.delete({ where: { id } });

    await logAudit({
      userId: user.id,
      action: 'DELETE',
      entity: 'TallyPhoto',
      entityId: id,
      detail: `Deleted tally photo for station ${photo.station?.psCode ?? photo.stationId}`,
      metadata: { stationId: photo.stationId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Tally photo delete error:', error);
    return NextResponse.json({ error: 'Failed to delete tally photo' }, { status: 500 });
  }
}

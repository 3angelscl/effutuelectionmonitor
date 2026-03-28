import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function GET(request: NextRequest) {
  try {
    const { user } = await requireRole(['ADMIN', 'OFFICER', 'AGENT']);

    const { searchParams } = new URL(request.url);
    let stationId = searchParams.get('stationId') || undefined;

    // Agents can only see photos for their own station
    if (user.role === 'AGENT') {
      const station = await prisma.pollingStation.findFirst({
        where: { agentId: user.id },
        select: { id: true },
      });
      stationId = station?.id;
    }
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

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireRole(['ADMIN', 'OFFICER', 'AGENT']);

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const caption = formData.get('caption') as string | null;
    const stationId = formData.get('stationId') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Only JPG and PNG are allowed.' }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Maximum 10MB.' }, { status: 400 });
    }

    // For agents, determine their station automatically
    let resolvedStationId = stationId;
    if (user.role === 'AGENT') {
      const station = await prisma.pollingStation.findFirst({
        where: { agentId: user.id },
        select: { id: true },
      });
      if (!station) {
        return NextResponse.json({ error: 'No polling station assigned to this agent' }, { status: 400 });
      }
      resolvedStationId = station.id;
    }

    if (!resolvedStationId) {
      return NextResponse.json({ error: 'Station ID is required' }, { status: 400 });
    }

    // Verify station exists
    const station = await prisma.pollingStation.findUnique({
      where: { id: resolvedStationId },
      select: { id: true, psCode: true },
    });
    if (!station) {
      return NextResponse.json({ error: 'Polling station not found' }, { status: 404 });
    }

    // Save file
    const buffer = Buffer.from(await file.arrayBuffer());
    const rawExt = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const allowedExts = ['jpg', 'jpeg', 'png'];
    const ext = allowedExts.includes(rawExt) ? rawExt : 'jpg';
    const filename = `tally-${station.psCode}-${Date.now()}.${ext}`;
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'tally');

    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, filename), buffer);

    const photoUrl = `/uploads/tally/${filename}`;

    const photo = await prisma.tallyPhoto.create({
      data: {
        userId: user.id,
        stationId: resolvedStationId,
        photoUrl,
        caption: caption?.trim() || null,
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
        station: { select: { id: true, psCode: true, name: true } },
      },
    });

    await logAudit({
      userId: user.id,
      action: 'CREATE',
      entity: 'TallyPhoto',
      entityId: photo.id,
      detail: `Uploaded tally photo for station ${station.psCode}`,
      metadata: { stationId: resolvedStationId, photoUrl },
    });

    return NextResponse.json(photo, { status: 201 });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Tally photo upload error:', error);
    return NextResponse.json({ error: 'Failed to upload tally photo' }, { status: 500 });
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

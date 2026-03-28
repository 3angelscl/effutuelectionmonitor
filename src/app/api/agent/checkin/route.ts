import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import { broadcastEvent } from '@/lib/events';

export async function GET() {
  try {
    const { user } = await requireAuth();

    const station = await prisma.pollingStation.findFirst({
      where: { agentId: user.id },
      select: { id: true, psCode: true, name: true, latitude: true, longitude: true },
    });

    if (!station) {
      return NextResponse.json({ station: null, checkInStatus: null });
    }

    const latestCheckIn = await prisma.agentCheckIn.findFirst({
      where: { userId: user.id, stationId: station.id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      station,
      checkInStatus: latestCheckIn
        ? {
            type: latestCheckIn.type,
            timestamp: latestCheckIn.createdAt,
            latitude: latestCheckIn.latitude,
            longitude: latestCheckIn.longitude,
          }
        : null,
    });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Check-in status error:', error);
    return NextResponse.json({ error: 'Failed to get check-in status' }, { status: 500 });
  }
}

// Haversine formula
function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireAuth();
    const { type, latitude, longitude } = await request.json();

    if (!type || !['CHECK_IN', 'CHECK_OUT'].includes(type)) {
      return NextResponse.json({ error: 'Type must be CHECK_IN or CHECK_OUT' }, { status: 400 });
    }

    const station = await prisma.pollingStation.findFirst({
      where: { agentId: user.id },
    });

    if (!station) {
      return NextResponse.json({ error: 'No station assigned' }, { status: 400 });
    }

    // Verify GPS proximity (within 500m) if station has coordinates
    let distanceWarning: string | null = null;
    if (latitude && longitude && station.latitude && station.longitude) {
      const distance = getDistanceKm(latitude, longitude, station.latitude, station.longitude);
      if (distance > 0.5) {
        distanceWarning = `You are ${distance.toFixed(1)}km from the station`;
      }
    }

    const checkIn = await prisma.agentCheckIn.create({
      data: {
        userId: user.id,
        stationId: station.id,
        type,
        latitude: latitude || null,
        longitude: longitude || null,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        type: type === 'CHECK_IN' ? 'STATION_ARRIVAL' : 'STATION_DEPARTURE',
        title: type === 'CHECK_IN' ? 'Checked in at station' : 'Checked out from station',
        detail: `${station.name} (${station.psCode})${distanceWarning ? ` - ${distanceWarning}` : ''}`,
        metadata: JSON.stringify({ latitude, longitude, stationId: station.id }),
      },
    });

    // Broadcast check-in event to admins
    broadcastEvent('agent:checkin', {
      userId: user.id,
      stationId: station.id,
      type,
    }, { targetRoles: ['ADMIN'] });

    return NextResponse.json({ success: true, checkIn, distanceWarning });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Check-in error:', error);
    return NextResponse.json({ error: 'Failed to record check-in' }, { status: 500 });
  }
}

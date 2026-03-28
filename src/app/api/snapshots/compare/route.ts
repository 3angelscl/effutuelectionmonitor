import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';

const ELECTION_COLORS = [
  '#2563eb',
  '#16a34a',
  '#dc2626',
  '#d97706',
  '#7c3aed',
  '#0891b2',
];

export async function GET(request: NextRequest) {
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const electionsParam = searchParams.get('elections') || '';

    const electionIds = electionsParam
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    if (electionIds.length === 0) {
      return NextResponse.json({ elections: [], series: [] });
    }

    const elections = await prisma.election.findMany({
      where: { id: { in: electionIds } },
      orderBy: { date: 'asc' },
    });

    const seriesAll: {
      electionId: string;
      hoursElapsed: number;
      turnoutPct: number;
    }[] = [];

    for (let idx = 0; idx < elections.length; idx++) {
      const election = elections[idx];

      const snapshots = await prisma.turnoutSnapshot.findMany({
        where: {
          electionId: election.id,
          stationId: null,
        },
        orderBy: { timestamp: 'asc' },
      });

      if (snapshots.length === 0) continue;

      const firstTimestamp = snapshots[0].timestamp.getTime();
      const lastTimestamp = snapshots[snapshots.length - 1].timestamp.getTime();
      const totalMs = lastTimestamp - firstTimestamp;

      const MAX_POINTS = 20;
      let sampled: typeof snapshots;

      if (snapshots.length <= MAX_POINTS) {
        sampled = snapshots;
      } else {
        sampled = [];
        for (let i = 0; i < MAX_POINTS; i++) {
          const targetMs = firstTimestamp + (totalMs * i) / (MAX_POINTS - 1);
          let closest = snapshots[0];
          let closestDiff = Math.abs(snapshots[0].timestamp.getTime() - targetMs);
          for (const snap of snapshots) {
            const diff = Math.abs(snap.timestamp.getTime() - targetMs);
            if (diff < closestDiff) {
              closest = snap;
              closestDiff = diff;
            }
          }
          sampled.push(closest);
        }
        // Deduplicate while preserving order
        const seen = new Set<string>();
        sampled = sampled.filter((s) => {
          if (seen.has(s.id)) return false;
          seen.add(s.id);
          return true;
        });
      }

      for (const snap of sampled) {
        const hoursElapsed =
          (snap.timestamp.getTime() - firstTimestamp) / (1000 * 60 * 60);
        const turnoutPct =
          snap.totalRegistered > 0
            ? Math.round((snap.totalVoted / snap.totalRegistered) * 1000) / 10
            : 0;

        seriesAll.push({
          electionId: election.id,
          hoursElapsed: Math.round(hoursElapsed * 10) / 10,
          turnoutPct,
        });
      }
    }

    const electionsOut = elections.map((e, idx) => ({
      id: e.id,
      name: e.name,
      date: e.date,
      color: ELECTION_COLORS[idx % ELECTION_COLORS.length],
    }));

    return NextResponse.json({
      elections: electionsOut,
      series: seriesAll,
    });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Snapshot compare error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch snapshot comparison' },
      { status: 500 }
    );
  }
}

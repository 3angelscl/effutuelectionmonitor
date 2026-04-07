import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, ApiError } from '@/lib/api-auth';
import { getLiveSummary } from '@/lib/live-summary';

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  try {
    await requireAuth();

    const { searchParams } = new URL(request.url);
    const electionId = searchParams.get('electionId');

    const summary = await getLiveSummary(electionId);
    console.info('[api/stats/live-summary] completed', {
      requestedElectionId: electionId,
      resolvedElectionId: summary.election?.id || null,
      durationMs: Date.now() - startedAt,
      totalStations: summary.totalStations,
      totalVoted: summary.totalVoted,
    });
    return NextResponse.json(summary);
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Live summary stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch live summary stats' }, { status: 500 });
  }
}

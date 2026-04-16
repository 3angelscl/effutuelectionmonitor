import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import { buildCsv, buildXlsx } from '@/lib/spreadsheet';

export async function GET(request: NextRequest) {
  try {
    await requireRole(['ADMIN', 'OFFICER']);

    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'csv';
    const electionIdParam = searchParams.get('electionId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    const election = electionIdParam
      ? await prisma.election.findUnique({ where: { id: electionIdParam } })
      : await prisma.election.findFirst({ where: { isActive: true } });

    if (!election) {
      return NextResponse.json({ error: 'No election found' }, { status: 404 });
    }

    const turnoutWhere: Record<string, unknown> = {
      electionId: election.id,
      hasVoted: true,
    };

    if (dateFrom || dateTo) {
      const votedAt: Record<string, Date> = {};
      if (dateFrom) votedAt.gte = new Date(`${dateFrom}T00:00:00`);
      if (dateTo) votedAt.lte = new Date(`${dateTo}T23:59:59.999`);
      turnoutWhere.votedAt = votedAt;
    }

    const stations = await prisma.pollingStation.findMany({
      include: {
        voters: {
          where: { deletedAt: null },
          select: {
            id: true,
            turnout: {
              where: turnoutWhere,
              select: { id: true },
            },
          },
        },
      },
      orderBy: { psCode: 'asc' },
    });

    const rows = stations.map((station) => {
      const registered = station.voters.length;
      const voted = station.voters.reduce((sum, voter) => sum + voter.turnout.length, 0);
      const turnoutPct = registered > 0 ? ((voted / registered) * 100).toFixed(2) : '0.00';

      return {
        Election: election.name,
        'PS Code': station.psCode,
        'Station Name': station.name,
        'Electoral Area': station.electoralArea || '',
        'Registered Voters': registered,
        'Votes Cast': voted,
        'Turnout %': turnoutPct,
        'Date From': dateFrom || '',
        'Date To': dateTo || '',
      };
    });

    if (format === 'xlsx') {
      const body = await buildXlsx(rows, 'Turnout');
      return new NextResponse(new Uint8Array(body), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="turnout-summary.xlsx"',
        },
      });
    }

    const csv = buildCsv(rows);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="turnout-summary.csv"',
      },
    });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Turnout export error:', error);
    return NextResponse.json({ error: 'Failed to export turnout summary' }, { status: 500 });
  }
}

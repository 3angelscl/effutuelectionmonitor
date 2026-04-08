import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import * as XLSX from 'xlsx';

export async function GET(request: NextRequest) {
  try {
    await requireRole(['ADMIN', 'OFFICER']);

    const { searchParams } = new URL(request.url);
    const stationId = searchParams.get('stationId') || '';
    const electoralArea = searchParams.get('electoralArea') || '';
    const search = searchParams.get('search') || '';
    const format = searchParams.get('format') || 'csv';
    const electionIdParam = searchParams.get('electionId');
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    // Resolve election — explicit param takes priority, then active
    const election = electionIdParam
      ? await prisma.election.findUnique({ where: { id: electionIdParam } })
      : await prisma.election.findFirst({ where: { isActive: true } });

    const where: Record<string, unknown> = {};
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

    // Build turnout filter
    const turnoutWhere: Record<string, unknown> = {};
    if (election) turnoutWhere.electionId = election.id;
    if (dateFrom || dateTo) {
      const votedAtFilter: Record<string, Date> = {};
      if (dateFrom) votedAtFilter.gte = new Date(dateFrom + 'T00:00:00');
      if (dateTo) {
        const end = new Date(dateTo + 'T23:59:59.999');
        votedAtFilter.lte = end;
      }
      turnoutWhere.votedAt = votedAtFilter;
    }

    const voters = await prisma.voter.findMany({
      where,
      include: {
        pollingStation: { select: { name: true, psCode: true, electoralArea: true } },
        turnout: Object.keys(turnoutWhere).length > 0
          ? { where: turnoutWhere, select: { hasVoted: true, votedAt: true } }
          : undefined,
      },
      orderBy: [{ pollingStation: { psCode: 'asc' } }, { lastName: 'asc' }],
    });

    const data = voters.map((v) => ({
      'Voter ID': v.voterId,
      'First Name': v.firstName,
      'Last Name': v.lastName,
      'Age': v.age,
      'Gender': v.gender || '',
      'PS Code': v.pollingStation?.psCode,
      'Station Name': v.pollingStation.name,
      'Electoral Area': v.pollingStation.electoralArea || '',
      'Has Voted': (v.turnout?.[0]?.hasVoted) ? 'Yes' : 'No',
      'Voted At': v.turnout?.[0]?.votedAt ? v.turnout[0].votedAt.toISOString() : '',
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Voters');

    if (format === 'xlsx') {
      const buffer = XLSX.write(workbook, {
        type: 'buffer',
        bookType: 'xlsx',
      });
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="voters.xlsx"',
        },
      });
    }

    const csv = XLSX.utils.sheet_to_csv(worksheet);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="voters.csv"',
      },
    });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Failed to export' }, { status: 500 });
  }
}

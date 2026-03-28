import { NextRequest, NextResponse } from 'next/server';
import { requireRole, ApiError } from '@/lib/api-auth';
import prisma from '@/lib/prisma';
import * as XLSX from 'xlsx';

export async function GET(request: NextRequest) {
  try {
    await requireRole(['ADMIN', 'OFFICER']);

    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'csv';
    const candidateId = searchParams.get('candidateId');
    let electionId = searchParams.get('electionId');

    if (!electionId) {
      const active = await prisma.election.findFirst({ where: { isActive: true } });
      electionId = active?.id || null;
    }

    const where: Record<string, string> = {};
    if (electionId) where.electionId = electionId;
    if (candidateId) where.candidateId = candidateId;

    const results = await prisma.electionResult.findMany({
      where,
      include: {
        candidate: true,
        pollingStation: { select: { name: true, psCode: true } },
        submittedBy: { select: { name: true } },
        election: { select: { name: true } },
      },
      orderBy: [{ pollingStation: { psCode: 'asc' } }, { votes: 'desc' }],
    });

    const data = results.map((r) => ({
      'Election': r.election.name,
      'PS Code': r.pollingStation.psCode,
      'Station Name': r.pollingStation.name,
      'Candidate': r.candidate.name,
      'Party': r.candidate.party,
      'Votes': r.votes,
      'Submitted By': r.submittedBy.name,
      'Submitted At': r.updatedAt.toISOString(),
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');

    const buffer = XLSX.write(workbook, {
      type: 'buffer',
      bookType: format === 'xlsx' ? 'xlsx' : 'csv',
    });

    const contentType = format === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv';

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="election-results.${format}"`,
      },
    });
  } catch (error) {
    if (error instanceof ApiError) return error.toResponse();
    console.error('Export results error:', error);
    return NextResponse.json({ error: 'Failed to export' }, { status: 500 });
  }
}
